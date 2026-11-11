import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  OrderStatus,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  type Order,
  type OrderRequest,
} from "@paypal/paypal-server-sdk";
import type { Logger } from "pino";
import type {
  CapturedOrder,
  CaptureStatus,
  CreatedOrder,
  CreateOrderInput,
  PaymentGateway,
} from "./gateway.js";
import { PayPalApiError, toPayPalError } from "./paypalErrors.js";

export interface PayPalGatewayOptions {
  clientId: string;
  clientSecret: string;
  environment: "sandbox" | "production";
  brandName: string;
  logger?: Logger;
  /** Retry attempts for transient failures (HTTP 429 and 5xx). Safe: every POST carries PayPal-Request-Id. */
  maxRetries?: number;
  /** Base delay between retries; doubled each attempt. */
  retryBaseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const cents = (value: number): string => (value / 100).toFixed(2);

export function buildOrderRequest(input: CreateOrderInput, brandName: string): OrderRequest {
  const money = (amountCents: number) => ({
    currencyCode: input.currency,
    value: cents(amountCents),
  });
  return {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        referenceId: input.cartId,
        customId: input.customId,
        invoiceId: input.cartId,
        description: `${input.merchantName} order`,
        amount: {
          currencyCode: input.currency,
          value: cents(input.totalCents),
          breakdown: {
            itemTotal: money(input.itemTotalCents),
            shipping: money(input.shippingCents),
            ...(input.handlingCents > 0 ? { handling: money(input.handlingCents) } : {}),
          },
        },
        items: input.items.map((item) => ({
          name: item.name.slice(0, 127),
          sku: item.sku,
          quantity: String(item.quantity),
          unitAmount: money(item.unitAmountCents),
        })),
        shipping: { address: input.shippingAddress },
      },
    ],
    paymentSource: {
      paypal: {
        experienceContext: {
          brandName,
          returnUrl: input.returnUrl,
          cancelUrl: input.cancelUrl,
          // The shopper reviews and pays on PayPal; the address came from the cart.
          shippingPreference: PaypalWalletContextShippingPreference.SetProvidedAddress,
          userAction: PaypalExperienceUserAction.PayNow,
        },
      },
    },
  };
}

function approvalLink(order: Order): string | undefined {
  return order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
}

function captureStatusOf(order: Order): { status: CaptureStatus; captureId?: string } {
  const capture = order.purchaseUnits?.[0]?.payments?.captures?.[0];
  if (order.status === OrderStatus.Completed && capture?.status === "COMPLETED") {
    return { status: "COMPLETED", captureId: capture.id };
  }
  if (capture?.status === "DECLINED" || capture?.status === "FAILED") {
    return { status: "DECLINED", captureId: capture.id };
  }
  return { status: "PENDING", captureId: capture?.id };
}

/** PaymentGateway backed by PayPal Orders v2 through the official Server SDK. */
export class PayPalGateway implements PaymentGateway {
  readonly name = "paypal";
  private readonly orders: OrdersController;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly options: PayPalGatewayOptions,
    ordersController?: OrdersController,
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    // One long-lived client: it caches the OAuth token and refreshes it before expiry.
    this.orders =
      ordersController ??
      new OrdersController(
        new Client({
          environment:
            options.environment === "production" ? Environment.Production : Environment.Sandbox,
          clientCredentialsAuthCredentials: {
            oAuthClientId: options.clientId,
            oAuthClientSecret: options.clientSecret,
          },
          timeout: 30_000,
        }),
      );
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const order = await this.withRetry(
      "create order",
      async () =>
        (
          await this.orders.createOrder({
            body: buildOrderRequest(input, this.options.brandName),
            paypalRequestId: input.requestId,
            prefer: "return=representation",
          })
        ).result,
    );
    const approvalUrl = approvalLink(order);
    if (!order.id || !approvalUrl) {
      throw new Error("PayPal returned an order without an id or approval link");
    }
    return { orderId: order.id, approvalUrl, status: order.status ?? "CREATED" };
  }

  async captureOrder(orderId: string, requestId: string): Promise<CapturedOrder> {
    try {
      const order = await this.withRetry(
        "capture order",
        async () =>
          (
            await this.orders.captureOrder({
              id: orderId,
              paypalRequestId: requestId,
              prefer: "return=representation",
            })
          ).result,
      );
      return { orderId, ...captureStatusOf(order) };
    } catch (error) {
      if (error instanceof PayPalApiError && error.isDeclined) {
        return { orderId, status: "DECLINED", debugId: error.debugId };
      }
      // Capturing twice is not an error for us: fetch the settled order instead.
      if (error instanceof PayPalApiError && error.issues.includes("ORDER_ALREADY_CAPTURED")) {
        const order = (await this.orders.getOrder({ id: orderId })).result;
        return { orderId, ...captureStatusOf(order) };
      }
      throw error;
    }
  }

  /** Runs a call, converting SDK errors, and retries transient failures with exponential backoff. */
  private async withRetry<T>(label: string, call: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call();
      } catch (raw) {
        const error = toPayPalError(raw);
        if (!(error instanceof PayPalApiError)) {
          // Network or authentication failures never reach PayPal's error format. Report them
          // in the same shape so callers get a clear 502 instead of an anonymous 500.
          const message = error instanceof Error ? error.message : String(error);
          this.options.logger?.error({ op: label, err: message }, "PayPal call failed");
          throw new PayPalApiError(502, "GATEWAY_ERROR", message.slice(0, 200), []);
        }
        this.options.logger?.warn(
          {
            op: label,
            status: error.statusCode,
            name: error.errorName,
            issues: error.issues,
            debugId: error.debugId,
            attempt,
          },
          "PayPal API error",
        );
        if (!error.isTransient || attempt >= this.maxRetries) throw error;
        const delay = (error.retryAfterSeconds ?? 0) * 1000 || this.retryBaseDelayMs * 2 ** attempt;
        await this.sleep(delay);
      }
    }
  }
}
