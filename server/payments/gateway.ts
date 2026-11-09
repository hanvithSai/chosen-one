import { randomBytes } from "node:crypto";

export interface OrderLineItem {
  sku: string;
  name: string;
  unitAmountCents: number;
  quantity: number;
}

export interface OrderShippingAddress {
  addressLine1?: string;
  addressLine2?: string;
  adminArea2?: string;
  adminArea1?: string;
  postalCode?: string;
  countryCode: string;
}

export interface CreateOrderInput {
  /** Idempotency key: retries with the same key must not create a second order. */
  requestId: string;
  cartId: string;
  merchantName: string;
  /** Attribution carried on the payment, e.g. "agent=claude;cart=cart_123". */
  customId: string;
  currency: string;
  items: OrderLineItem[];
  itemTotalCents: number;
  shippingCents: number;
  handlingCents: number;
  totalCents: number;
  shippingAddress: OrderShippingAddress;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatedOrder {
  orderId: string;
  approvalUrl: string;
  status: string;
  debugId?: string;
}

export type CaptureStatus = "COMPLETED" | "PENDING" | "DECLINED";

export interface CapturedOrder {
  orderId: string;
  status: CaptureStatus;
  captureId?: string;
  debugId?: string;
}

/** Payment provider boundary. PayPal is the production implementation. */
export interface PaymentGateway {
  readonly name: string;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  captureOrder(orderId: string, requestId: string): Promise<CapturedOrder>;
}

/**
 * Offline gateway for tests and keyless replay mode. Approval is simulated by sending the
 * shopper straight to the return URL, as if they had approved on PayPal.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly name = "fake";
  private readonly created = new Map<string, CreatedOrder>();
  private readonly captured = new Map<string, CapturedOrder>();

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const existing = this.created.get(input.requestId);
    if (existing) return existing;
    const orderId = `FAKE-${randomBytes(6).toString("hex").toUpperCase()}`;
    const approval = new URL(input.returnUrl);
    approval.searchParams.set("token", orderId);
    approval.searchParams.set("PayerID", "FAKEPAYER");
    const order: CreatedOrder = { orderId, approvalUrl: approval.toString(), status: "CREATED" };
    this.created.set(input.requestId, order);
    return order;
  }

  async captureOrder(orderId: string): Promise<CapturedOrder> {
    const existing = this.captured.get(orderId);
    if (existing) return existing;
    const known = [...this.created.values()].some((o) => o.orderId === orderId);
    if (!known) throw new Error(`Unknown order: ${orderId}`);
    const capture: CapturedOrder = {
      orderId,
      status: "COMPLETED",
      captureId: `FAKECAP-${randomBytes(6).toString("hex").toUpperCase()}`,
    };
    this.captured.set(orderId, capture);
    return capture;
  }
}
