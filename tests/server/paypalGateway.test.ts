import { ApiError, type OrdersController } from "@paypal/paypal-server-sdk";
import { describe, expect, it, vi } from "vitest";
import type { CreateOrderInput } from "../../server/payments/gateway.js";
import { buildOrderRequest, PayPalGateway } from "../../server/payments/paypalGateway.js";
import { PayPalApiError, toPayPalError } from "../../server/payments/paypalErrors.js";

const input: CreateOrderInput = {
  requestId: "checkout-cart_1-4200",
  cartId: "cart_1",
  merchantName: "mayabazar",
  customId: "agent=test;cart=cart_1",
  currency: "USD",
  items: [{ sku: "MB-MUG", name: "Monsoon Mug", unitAmountCents: 3400, quantity: 1 }],
  itemTotalCents: 3400,
  shippingCents: 800,
  handlingCents: 0,
  totalCents: 4200,
  shippingAddress: {
    addressLine1: "1 Main St",
    adminArea2: "Austin",
    adminArea1: "TX",
    postalCode: "78701",
    countryCode: "US",
  },
  returnUrl: "https://example.test/paypal/return",
  cancelUrl: "https://example.test/paypal/cancel",
};

/** Builds an SDK ApiError the way the runtime does: status, headers and a parsed result. */
function apiError(status: number, payload: object, headers: Record<string, string> = {}): ApiError {
  const err = new ApiError(
    {
      request: {} as never,
      response: { statusCode: status, headers, body: JSON.stringify(payload) } as never,
    },
    "PayPal error",
  );
  err.result = payload as never;
  return err;
}

const approvalOrder = {
  id: "ORDER1",
  status: "PAYER_ACTION_REQUIRED",
  links: [{ rel: "payer-action", href: "https://sandbox.paypal.test/checkoutnow?token=ORDER1" }],
};

function controllerWith(
  overrides: Partial<Record<"createOrder" | "captureOrder" | "getOrder", unknown>>,
) {
  return overrides as unknown as OrdersController;
}

const noSleep = {
  sleep: async () => {},
  brandName: "Mayabazar",
  clientId: "x".repeat(12),
  clientSecret: "y".repeat(12),
  environment: "sandbox" as const,
};

describe("buildOrderRequest", () => {
  const request = buildOrderRequest(input, "Mayabazar");
  const unit = request.purchaseUnits[0]!;

  it("sends exact amounts with a matching breakdown", () => {
    expect(unit.amount).toMatchObject({
      currencyCode: "USD",
      value: "42.00",
      breakdown: { itemTotal: { value: "34.00" }, shipping: { value: "8.00" } },
    });
    expect(unit.items?.[0]).toMatchObject({
      sku: "MB-MUG",
      quantity: "1",
      unitAmount: { value: "34.00" },
    });
  });

  it("carries agent attribution and the cart id", () => {
    expect(unit.customId).toBe("agent=test;cart=cart_1");
    expect(unit.invoiceId).toBe("cart_1");
  });

  it("asks the shopper to pay on PayPal for the provided address", () => {
    expect(request.paymentSource?.paypal?.experienceContext).toMatchObject({
      returnUrl: "https://example.test/paypal/return",
      shippingPreference: "SET_PROVIDED_ADDRESS",
      userAction: "PAY_NOW",
    });
  });
});

describe("PayPalGateway.createOrder", () => {
  it("creates an order with an idempotency key and returns the approval link", async () => {
    const createOrder = vi.fn().mockResolvedValue({ result: approvalOrder });
    const gateway = new PayPalGateway(noSleep, controllerWith({ createOrder }));
    const created = await gateway.createOrder(input);
    expect(created).toEqual({
      orderId: "ORDER1",
      approvalUrl: approvalOrder.links[0]!.href,
      status: "PAYER_ACTION_REQUIRED",
    });
    expect(createOrder.mock.calls[0]![0]).toMatchObject({
      paypalRequestId: "checkout-cart_1-4200",
    });
  });

  it("retries rate limits and server errors, reusing the same idempotency key", async () => {
    const createOrder = vi
      .fn()
      .mockRejectedValueOnce(
        apiError(429, { name: "RATE_LIMIT_REACHED", message: "slow down", debug_id: "d1" }),
      )
      .mockRejectedValueOnce(
        apiError(503, { name: "SERVICE_UNAVAILABLE", message: "try later", debug_id: "d2" }),
      )
      .mockResolvedValue({ result: approvalOrder });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const gateway = new PayPalGateway({ ...noSleep, sleep }, controllerWith({ createOrder }));
    await gateway.createOrder(input);
    expect(createOrder).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
    const keys = new Set(
      createOrder.mock.calls.map((c) => (c[0] as { paypalRequestId: string }).paypalRequestId),
    );
    expect(keys.size).toBe(1);
  });

  it("honours Retry-After on 429", async () => {
    const createOrder = vi
      .fn()
      .mockRejectedValueOnce(
        apiError(429, { name: "RATE_LIMIT_REACHED", message: "x" }, { "retry-after": "2" }),
      )
      .mockResolvedValue({ result: approvalOrder });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await new PayPalGateway({ ...noSleep, sleep }, controllerWith({ createOrder })).createOrder(
      input,
    );
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry client errors and surfaces the debug id", async () => {
    const createOrder = vi
      .fn()
      .mockRejectedValue(
        apiError(422, {
          name: "UNPROCESSABLE_ENTITY",
          message: "bad",
          debug_id: "dbg9",
          details: [{ issue: "ITEM_TOTAL_MISMATCH" }],
        }),
      );
    const gateway = new PayPalGateway(noSleep, controllerWith({ createOrder }));
    const error = await gateway.createOrder(input).catch((e: unknown) => e);
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(PayPalApiError);
    expect(error).toMatchObject({
      statusCode: 422,
      debugId: "dbg9",
      issues: ["ITEM_TOTAL_MISMATCH"],
    });
  });

  it("gives up after the maximum number of retries", async () => {
    const createOrder = vi
      .fn()
      .mockRejectedValue(apiError(500, { name: "INTERNAL_SERVER_ERROR", message: "boom" }));
    const gateway = new PayPalGateway(
      { ...noSleep, maxRetries: 2 },
      controllerWith({ createOrder }),
    );
    await expect(gateway.createOrder(input)).rejects.toBeInstanceOf(PayPalApiError);
    expect(createOrder).toHaveBeenCalledTimes(3);
  });
});

describe("PayPalGateway.captureOrder", () => {
  const completed = {
    status: "COMPLETED",
    purchaseUnits: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }],
  };

  it("returns the capture id on success", async () => {
    const captureOrder = vi.fn().mockResolvedValue({ result: completed });
    const gateway = new PayPalGateway(noSleep, controllerWith({ captureOrder }));
    expect(await gateway.captureOrder("ORDER1", "capture-ORDER1")).toEqual({
      orderId: "ORDER1",
      status: "COMPLETED",
      captureId: "CAP1",
    });
    expect(captureOrder.mock.calls[0]![0]).toMatchObject({
      id: "ORDER1",
      paypalRequestId: "capture-ORDER1",
    });
  });

  it("reports a declined instrument instead of throwing", async () => {
    const captureOrder = vi
      .fn()
      .mockRejectedValue(
        apiError(422, {
          name: "UNPROCESSABLE_ENTITY",
          message: "declined",
          debug_id: "dbgD",
          details: [{ issue: "INSTRUMENT_DECLINED" }],
        }),
      );
    const gateway = new PayPalGateway(noSleep, controllerWith({ captureOrder }));
    expect(await gateway.captureOrder("ORDER1", "capture-ORDER1")).toEqual({
      orderId: "ORDER1",
      status: "DECLINED",
      debugId: "dbgD",
    });
  });

  it("treats an already-captured order as settled by fetching it", async () => {
    const captureOrder = vi
      .fn()
      .mockRejectedValue(
        apiError(422, {
          name: "UNPROCESSABLE_ENTITY",
          message: "done",
          details: [{ issue: "ORDER_ALREADY_CAPTURED" }],
        }),
      );
    const getOrder = vi.fn().mockResolvedValue({ result: completed });
    const gateway = new PayPalGateway(noSleep, controllerWith({ captureOrder, getOrder }));
    expect(await gateway.captureOrder("ORDER1", "capture-ORDER1")).toMatchObject({
      status: "COMPLETED",
      captureId: "CAP1",
    });
  });

  it("reports a pending capture without completing", async () => {
    const pending = {
      status: "COMPLETED",
      purchaseUnits: [{ payments: { captures: [{ id: "CAP2", status: "PENDING" }] } }],
    };
    const gateway = new PayPalGateway(
      noSleep,
      controllerWith({ captureOrder: vi.fn().mockResolvedValue({ result: pending }) }),
    );
    expect(await gateway.captureOrder("ORDER1", "capture-ORDER1")).toMatchObject({
      status: "PENDING",
      captureId: "CAP2",
    });
  });
});

describe("toPayPalError", () => {
  it("passes non-API errors through unchanged", () => {
    const plain = new Error("network down");
    expect(toPayPalError(plain)).toBe(plain);
  });

  it("falls back to the raw body when the SDK did not parse the payload", () => {
    const err = apiError(400, {});
    err.result = undefined;
    (err as { body: string }).body = JSON.stringify({
      name: "INVALID_REQUEST",
      message: "nope",
      debug_id: "raw1",
    });
    expect(toPayPalError(err)).toMatchObject({ errorName: "INVALID_REQUEST", debugId: "raw1" });
  });
});
