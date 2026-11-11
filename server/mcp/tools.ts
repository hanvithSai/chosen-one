import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { orders, toolCalls } from "../db/schema.js";
import { paymentProviderBody } from "../agent-api/cartRoutes.js";
import { PayPalApiError } from "../payments/paypalErrors.js";
import { CartError, type CartService } from "../commerce/cart.js";
import {
  getCatalog,
  getMerchantBySlug,
  NotFoundError,
  toMarketItems,
} from "../commerce/catalog.js";
import { money } from "../commerce/cartPricing.js";
import { MarketIndex } from "../commerce/search.js";
import type { CheckoutPolicy } from "../demo/data.js";

export interface McpToolContext {
  db: Db;
  cartService: CartService;
  merchantSlug: string;
  policy: CheckoutPolicy;
  /** Which agent is calling (from request headers); recorded for attribution. */
  agentClient?: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (data: unknown): ToolResult => ({ ...ok(data), isError: true });

const addressShape = {
  country_code: z.string().length(2).describe("ISO 3166-1 alpha-2 country, e.g. US"),
  postal_code: z.string().min(3).describe("Delivery postal / ZIP code"),
  address_line_1: z.string().optional(),
  address_line_2: z.string().optional(),
  admin_area_2: z.string().optional().describe("City"),
  admin_area_1: z.string().optional().describe("State or province code, e.g. TX"),
};

export const toolInputs = {
  search_products: {
    query: z.string().min(1).describe("What the shopper wants, in plain words"),
    max_price_usd: z.number().positive().optional().describe("Budget ceiling in dollars"),
    limit: z.number().int().min(1).max(10).optional(),
  },
  get_product: { sku: z.string().min(1).describe("SKU such as MB-MUG-MONSOON") },
  get_store_policies: {},
  create_cart: {
    items: z
      .array(
        z.object({
          item_id: z.string().min(1).describe("SKU from search_products"),
          quantity: z.number().int().min(1).max(20),
          gift_wrap: z.boolean().optional(),
        }),
      )
      .min(1),
    shipping_address: z.object(addressShape),
  },
  checkout_cart: { cart_id: z.string().min(1) },
  get_order_status: { cart_id: z.string().min(1) },
} as const;

type Inputs = {
  [K in keyof typeof toolInputs]: z.infer<z.ZodObject<(typeof toolInputs)[K]>>;
};

const dollars = (cents: number, currency: string) => money(cents, currency).value;

/** Plain tool implementations. The MCP server wraps these; they are also directly testable. */
export function createTools(ctx: McpToolContext) {
  return {
    async search_products(args: Inputs["search_products"]) {
      const catalog = await getCatalog(ctx.db, ctx.merchantSlug);
      const hits = new MarketIndex(toMarketItems(catalog)).query(args.query, {
        limit: args.limit ?? 5,
        maxPriceCents:
          args.max_price_usd === undefined ? undefined : Math.round(args.max_price_usd * 100),
      });
      return ok({
        store: catalog.merchant.name,
        results: hits.map((hit) => ({
          sku: hit.ref.slice(hit.ref.indexOf(":") + 1),
          title: hit.title,
          price: `${dollars(hit.priceCents, hit.currency)} ${hit.currency}`,
          summary: hit.summary,
        })),
      });
    },

    async get_product(args: Inputs["get_product"]) {
      const catalog = await getCatalog(ctx.db, ctx.merchantSlug);
      const product = catalog.products.find((p) => p.sku === args.sku);
      if (!product) return fail({ error: `No product with SKU ${args.sku}` });
      return ok({
        sku: product.sku,
        title: product.title,
        description: product.description,
        price: `${dollars(product.priceCents, product.currency)} ${product.currency}`,
        in_stock: product.stock > 0,
        attributes: product.attributes,
      });
    },

    async get_store_policies() {
      const catalog = await getCatalog(ctx.db, ctx.merchantSlug);
      const p = ctx.policy;
      return ok({
        store: catalog.merchant.name,
        tagline: catalog.merchant.tagline,
        currency: p.currency,
        ships_to: p.shipToCountries,
        carrier: p.carrier,
        ships_within_business_days: p.handlingBusinessDays,
        transit_business_days: p.transitBusinessDays,
        flat_shipping: dollars(p.flatShippingCents, p.currency),
        free_shipping_over: dollars(p.freeShippingOverCents, p.currency),
        gift_wrap: dollars(p.giftWrapCents, p.currency),
      });
    },

    async create_cart(args: Inputs["create_cart"]) {
      const cart = await ctx.cartService.create(
        {
          items: args.items.map((item) => ({
            item_id: item.item_id,
            quantity: item.quantity,
            ...(item.gift_wrap ? { gift_options: { gift_wrap: true } } : {}),
          })),
          shipping_address: args.shipping_address,
        },
        { agentClient: ctx.agentClient },
      );
      return ok(cart);
    },

    async checkout_cart(args: Inputs["checkout_cart"]) {
      const cart = await ctx.cartService.checkout(
        args.cart_id,
        {},
        { agentClient: ctx.agentClient },
      );
      return ok({
        cart_id: args.cart_id,
        status: cart.status,
        approval_url: cart.payment_method?.approval_url,
        next_step:
          "Give approval_url to the human shopper. They approve the payment on PayPal; the order is then captured and get_order_status shows COMPLETED.",
      });
    },

    async get_order_status(args: Inputs["get_order_status"]) {
      const cart = await ctx.cartService.get(args.cart_id);
      const [order] = await ctx.db.select().from(orders).where(eq(orders.cartId, args.cart_id));
      return ok({
        cart_id: args.cart_id,
        cart_status: cart.status,
        order: order
          ? {
              status: order.status,
              amount: `${dollars(order.amountCents, order.currency)} ${order.currency}`,
              paypal_order_id: order.paypalOrderId,
              capture_id: order.captureId,
            }
          : null,
      });
    },
  };
}

export type ToolName = keyof typeof toolInputs;

function describeError(err: unknown): ToolResult {
  if (err instanceof CartError) return fail({ error: err.body });
  if (err instanceof NotFoundError) return fail({ error: err.message });
  if (err instanceof PayPalApiError) return fail({ error: paymentProviderBody(err) });
  throw err;
}

/** Runs a tool, converts expected errors to MCP error results, and records the call. */
export async function runTool(
  ctx: McpToolContext,
  name: ToolName,
  args: unknown,
): Promise<ToolResult> {
  const tools = createTools(ctx) as Record<ToolName, (a: never) => Promise<ToolResult>>;
  let result: ToolResult;
  try {
    result = await tools[name](args as never);
  } catch (err) {
    result = describeError(err);
  }
  const text = result.content[0]?.text ?? "";
  const merchant = await getMerchantBySlug(ctx.db, ctx.merchantSlug);
  await ctx.db.insert(toolCalls).values({
    merchantId: merchant.id,
    channel: "mcp",
    agentClient: ctx.agentClient ?? null,
    tool: name,
    argsDigest: createHash("sha256")
      .update(JSON.stringify(args ?? {}))
      .digest("hex")
      .slice(0, 16),
    resultSummary: `${result.isError ? "error: " : ""}${text.replace(/\s+/g, " ").slice(0, 200)}`,
  });
  return result;
}
