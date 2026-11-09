/**
 * Single entry point for PayPal's Cart API v1 contract (@paypal/agentic-commerce-spec).
 *
 * The package root (dist/index.js) re-exports modules with extensionless ESM specifiers, which
 * bundlers and tsx accept but plain Node rejects at runtime. The generated Zod module is
 * self-contained (it only imports "zod"), so runtime schemas are loaded from it directly.
 */
export {
  payPalCartSchema,
  payPalCartWritableSchema,
} from "@paypal/agentic-commerce-spec/dist/generated/zod.gen.js";

export type {
  _Error,
  BusinessError,
  CartItem,
  CartTotals,
  Money,
  PayPalCart,
  PayPalCartWritable,
  ShippingOption,
  ValidationIssue,
} from "@paypal/agentic-commerce-spec";
