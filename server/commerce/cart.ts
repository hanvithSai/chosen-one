import { randomBytes } from "node:crypto";
import type { _Error, BusinessError, PayPalCart, PayPalCartWritable } from "./cartSpec.js";
import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import type { Db } from "../db/client.js";
import { carts, orders } from "../db/schema.js";
import type { CheckoutPolicy } from "../demo/data.js";
import type { PaymentGateway } from "../payments/gateway.js";
import { getCatalog } from "./catalog.js";
import { priceCart, type PricedCart } from "./cartPricing.js";

export type CartRow = typeof carts.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;

/** Error carrying an HTTP status and a Cart API v1 error body. */
export class CartError extends Error {
  constructor(
    readonly status: 400 | 404 | 422,
    readonly body: _Error | BusinessError,
  ) {
    super(body.message);
  }
}

export interface CartContext {
  /** Identifies the calling agent (e.g. MCP client name), used for attribution. */
  agentClient?: string;
}

export interface CartServiceOptions {
  merchantSlug: string;
  policy: CheckoutPolicy;
  publicBaseUrl: string;
  gateway: PaymentGateway;
  logger?: Logger;
}

const WRITABLE_KEYS = [
  "items",
  "customer",
  "shipping_address",
  "billing_address",
  "checkout_fields",
  "coupons",
  "geo_coordinates",
] as const satisfies readonly (keyof PayPalCartWritable)[];

export function newCartId(): string {
  return `cart_${randomBytes(9).toString("base64url")}`;
}

/** PayPal custom_id is limited to 127 characters; keep only safe characters. */
export function buildCustomId(agentClient: string | undefined, cartId: string): string {
  const agent = (agentClient ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40);
  return `agent=${agent};cart=${cartId}`.slice(0, 127);
}

function pickWritable(cart: Partial<PayPalCart>): PayPalCartWritable {
  const writable: PayPalCartWritable = {};
  for (const key of WRITABLE_KEYS) {
    if (cart[key] !== undefined) Object.assign(writable, { [key]: cart[key] });
  }
  return writable;
}

export class CartService {
  constructor(
    private readonly db: Db,
    private readonly options: CartServiceOptions,
  ) {}

  async create(request: PayPalCartWritable, ctx: CartContext = {}): Promise<PayPalCart> {
    const catalog = await getCatalog(this.db, this.options.merchantSlug);
    const priced = this.price(request, catalog.products);
    const id = newCartId();
    const cart = this.toCart(id, request, priced);
    await this.db.insert(carts).values({
      id,
      merchantId: catalog.merchant.id,
      catalogVersionId: catalog.version.id,
      status: priced.status,
      validationStatus: priced.validationStatus,
      body: cart,
      agentClient: ctx.agentClient ?? null,
    });
    return cart;
  }

  async get(cartId: string): Promise<PayPalCart> {
    return (await this.requireCart(cartId)).body as PayPalCart;
  }

  async update(
    cartId: string,
    request: PayPalCartWritable,
    ctx: CartContext = {},
  ): Promise<PayPalCart> {
    const row = await this.requireCart(cartId);
    if (row.status === "COMPLETED") {
      throw new CartError(422, {
        name: "UNPROCESSABLE_ENTITY",
        message: "This cart has already been checked out and can no longer change.",
      });
    }
    const merged: PayPalCartWritable = {
      ...pickWritable(row.body as PayPalCart),
      ...pickWritable(request),
    };
    const catalog = await getCatalog(this.db, this.options.merchantSlug);
    const priced = this.price(merged, catalog.products);
    const cart = this.toCart(cartId, merged, priced);
    // Any change after checkout started invalidates the pending PayPal order.
    await this.db
      .update(carts)
      .set({
        catalogVersionId: catalog.version.id,
        status: priced.status,
        validationStatus: priced.validationStatus,
        body: cart,
        paypalOrderId: null,
        agentClient: row.agentClient ?? ctx.agentClient ?? null,
        updatedAt: new Date(),
      })
      .where(eq(carts.id, cartId));
    return cart;
  }

  /**
   * Starts checkout: creates (once) a PayPal order and returns its approval link.
   * If the request carries an approved PayPal token and payer id, completes the order instead.
   */
  async checkout(
    cartId: string,
    request: PayPalCartWritable,
    ctx: CartContext = {},
  ): Promise<PayPalCart> {
    const token = request.payment_method?.token;
    if (token && request.payment_method?.payer_id) {
      return (await this.completeByOrderId(token)).cart;
    }

    let row = await this.requireCart(cartId);
    if (row.status === "COMPLETED") return row.body as PayPalCart;

    if (Object.keys(pickWritable(request)).length > 0) {
      await this.update(cartId, request, ctx);
      row = await this.requireCart(cartId);
    }

    const cart = row.body as PayPalCart;
    if (row.status !== "READY") {
      throw new CartError(422, {
        name: "UNPROCESSABLE_ENTITY",
        message: "The cart is not ready for checkout. Resolve the validation issues first.",
        ...(cart.validation_issues?.[0] ? { business_context: cart.validation_issues[0] } : {}),
      });
    }
    if (row.paypalOrderId) return cart; // checkout already started; same approval link

    const priced = this.price(
      pickWritable(cart),
      (await getCatalog(this.db, this.options.merchantSlug)).products,
    );
    const agentClient = row.agentClient ?? ctx.agentClient;
    const customId = buildCustomId(agentClient, cartId);
    const address = cart.shipping_address!;
    const created = await this.options.gateway.createOrder({
      requestId: `checkout-${cartId}-${priced.amounts.totalCents}`,
      cartId,
      merchantName: this.options.merchantSlug,
      customId,
      currency: this.options.policy.currency,
      items: priced.lines,
      itemTotalCents: priced.amounts.itemTotalCents,
      shippingCents: priced.amounts.shippingCents,
      handlingCents: priced.amounts.handlingCents,
      totalCents: priced.amounts.totalCents,
      shippingAddress: {
        addressLine1: address.address_line_1,
        addressLine2: address.address_line_2,
        adminArea2: address.admin_area_2,
        adminArea1: address.admin_area_1,
        postalCode: address.postal_code,
        countryCode: address.country_code,
      },
      returnUrl: new URL("/paypal/return", this.options.publicBaseUrl).toString(),
      cancelUrl: new URL("/paypal/cancel", this.options.publicBaseUrl).toString(),
    });

    const withPayment: PayPalCart = {
      ...cart,
      payment_method: { type: "paypal", token: created.orderId, approval_url: created.approvalUrl },
    };
    await this.db.insert(orders).values({
      paypalOrderId: created.orderId,
      cartId,
      status: created.status,
      amountCents: priced.amounts.totalCents,
      currency: this.options.policy.currency,
      customId,
      agentClient: agentClient ?? null,
      debugIds: created.debugId ? [created.debugId] : [],
    });
    await this.db
      .update(carts)
      .set({ paypalOrderId: created.orderId, body: withPayment, updatedAt: new Date() })
      .where(eq(carts.id, cartId));
    this.options.logger?.info(
      { cartId, orderId: created.orderId, gateway: this.options.gateway.name, customId },
      "Checkout started",
    );
    return withPayment;
  }

  /** Captures an approved order and completes its cart. Safe to call more than once. */
  async completeByOrderId(orderId: string): Promise<{ cart: PayPalCart; order: OrderRow }> {
    const [order] = await this.db.select().from(orders).where(eq(orders.paypalOrderId, orderId));
    if (!order) {
      throw new CartError(404, {
        name: "RESOURCE_NOT_FOUND",
        message: `Unknown order: ${orderId}`,
      });
    }
    if (order.status === "COMPLETED") {
      return { cart: await this.get(order.cartId), order };
    }

    const capture = await this.options.gateway.captureOrder(orderId, `capture-${orderId}`);
    const debugIds = capture.debugId ? [...order.debugIds, capture.debugId] : order.debugIds;
    if (capture.status === "DECLINED") {
      await this.db
        .update(orders)
        .set({ status: "DECLINED", debugIds, updatedAt: new Date() })
        .where(eq(orders.paypalOrderId, orderId));
      throw new CartError(422, {
        name: "INSTRUMENT_DECLINED",
        message: "The payment method was declined. Approve again with a different funding source.",
        ...(capture.debugId ? { debug_id: capture.debugId } : {}),
      });
    }

    const [updatedOrder] = await this.db
      .update(orders)
      .set({
        status: capture.status,
        captureId: capture.captureId ?? null,
        debugIds,
        updatedAt: new Date(),
      })
      .where(eq(orders.paypalOrderId, orderId))
      .returning();

    const row = await this.requireCart(order.cartId);
    let cart = row.body as PayPalCart;
    if (capture.status === "COMPLETED") {
      cart = { ...cart, status: "COMPLETED" };
      await this.db
        .update(carts)
        .set({ status: "COMPLETED", body: cart, updatedAt: new Date() })
        .where(eq(carts.id, order.cartId));
      this.options.logger?.info(
        { cartId: order.cartId, orderId, captureId: capture.captureId, customId: order.customId },
        "Agent order captured",
      );
    }
    return { cart, order: updatedOrder! };
  }

  private price(
    request: PayPalCartWritable,
    products: Parameters<typeof priceCart>[1],
  ): PricedCart {
    return priceCart(request, products, this.options.policy, this.options.merchantSlug);
  }

  private toCart(id: string, request: PayPalCartWritable, priced: PricedCart): PayPalCart {
    return {
      id,
      status: priced.status,
      validation_status: priced.validationStatus,
      validation_issues: priced.issues,
      totals: priced.totals,
      available_shipping_options: priced.shippingOptions,
      items: priced.items,
      ...(request.customer ? { customer: request.customer } : {}),
      ...(request.shipping_address ? { shipping_address: request.shipping_address } : {}),
      ...(request.billing_address ? { billing_address: request.billing_address } : {}),
      ...(request.checkout_fields ? { checkout_fields: request.checkout_fields } : {}),
    };
  }

  private async requireCart(cartId: string): Promise<CartRow> {
    const [row] = await this.db.select().from(carts).where(eq(carts.id, cartId));
    if (!row) {
      throw new CartError(404, {
        name: "RESOURCE_NOT_FOUND",
        message: `Cart not found: ${cartId}`,
      });
    }
    return row;
  }
}
