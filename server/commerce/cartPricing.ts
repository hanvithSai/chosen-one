import type {
  CartItem,
  CartTotals,
  Money,
  PayPalCartWritable,
  ShippingOption,
  ValidationIssue,
} from "./cartSpec.js";
import type { CartStatus, CartValidationStatus } from "../db/schema.js";
import type { CheckoutPolicy } from "../demo/data.js";
import type { Product } from "./catalog.js";

export const SHIPPING_OPTION_ID = "standard";

export function money(cents: number, currency: string): Money {
  return { currency_code: currency, value: (cents / 100).toFixed(2) };
}

export interface PricedLine {
  sku: string;
  name: string;
  unitAmountCents: number;
  quantity: number;
}

export interface PricedCart {
  items: CartItem[];
  lines: PricedLine[];
  totals: CartTotals;
  shippingOptions: ShippingOption[];
  issues: ValidationIssue[];
  status: Exclude<CartStatus, "COMPLETED">;
  validationStatus: CartValidationStatus;
  amounts: {
    itemTotalCents: number;
    shippingCents: number;
    handlingCents: number;
    totalCents: number;
  };
}

/** Adds business days (Mon-Fri) to a date and returns an ISO calendar date (YYYY-MM-DD). */
export function addBusinessDays(from: Date, days: number): string {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/** Accepts either a bare SKU or a market ref such as "mayabazar:MB-MUG-MONSOON". */
export function normalizeItemId(itemId: string, merchantSlug: string): string {
  const prefix = `${merchantSlug}:`;
  return itemId.startsWith(prefix) ? itemId.slice(prefix.length) : itemId;
}

/**
 * Prices a requested cart entirely from server-side data. Prices, totals and shipping are never
 * taken from the request, so an agent (or injected instruction) cannot change what is charged.
 */
export function priceCart(
  request: PayPalCartWritable,
  catalog: Product[],
  policy: CheckoutPolicy,
  merchantSlug: string,
  now: Date = new Date(),
): PricedCart {
  const currency = policy.currency;
  const bySku = new Map(catalog.map((p) => [p.sku, p]));
  const issues: ValidationIssue[] = [];
  const items: CartItem[] = [];
  const lines: PricedLine[] = [];

  const requested = request.items ?? [];
  if (requested.length === 0) {
    issues.push({
      code: "DATA_ERROR",
      type: "MISSING_FIELD",
      field: "items",
      message: "The cart has no items.",
      user_message: "Add at least one item to the cart.",
      context: { specific_issue: "REQUIRED_FIELD_MISSING" },
      resolution_options: [{ action: "MODIFY_CART", label: "Add items" }],
    });
  }

  for (const line of requested) {
    const sku = line.item_id ? normalizeItemId(line.item_id, merchantSlug) : undefined;
    const product = sku ? bySku.get(sku) : undefined;
    if (!product) {
      issues.push({
        code: "DATA_ERROR",
        type: "INVALID_DATA",
        field: "items.item_id",
        item_id: line.item_id,
        message: `Unknown item_id: ${line.item_id ?? "(missing)"}`,
        user_message: "One of the items is not sold by this store.",
        context: { specific_issue: "ITEM_NOT_FOUND" },
        resolution_options: [{ action: "REMOVE_ITEM", label: "Remove the item" }],
      });
      continue;
    }

    if (product.stock <= 0 || line.quantity > product.stock) {
      issues.push({
        code: "INVENTORY_ISSUE",
        type: "BUSINESS_RULE",
        item_id: product.sku,
        message: `Only ${product.stock} of ${product.sku} in stock.`,
        user_message: `Only ${product.stock} left of ${product.title}.`,
        context: {
          specific_issue: product.stock <= 0 ? "ITEM_OUT_OF_STOCK" : "INSUFFICIENT_INVENTORY",
          item_id: product.sku,
          available_quantity: product.stock,
          requested_quantity: line.quantity,
        },
        resolution_options: [{ action: "MODIFY_CART", label: "Reduce the quantity" }],
      });
    }

    const quantity = Math.max(1, Math.floor(line.quantity));
    lines.push({
      sku: product.sku,
      name: product.title,
      unitAmountCents: product.priceCents,
      quantity,
    });
    items.push({
      item_id: product.sku,
      quantity,
      name: product.title,
      description: product.description,
      price: money(product.priceCents, currency),
      ...(line.gift_options ? { gift_options: line.gift_options } : {}),
    });
  }

  const address = request.shipping_address;
  if (!address) {
    issues.push({
      code: "SHIPPING_ERROR",
      type: "MISSING_FIELD",
      field: "shipping_address",
      message: "A shipping address is required.",
      user_message: "Where should we ship this order?",
      context: { specific_issue: "MISSING_SHIPPING_ADDRESS" },
      resolution_options: [{ action: "PROVIDE_MISSING_FIELD", label: "Add a shipping address" }],
    });
  } else if (!policy.shipToCountries.includes(address.country_code.toUpperCase())) {
    issues.push({
      code: "SHIPPING_ERROR",
      type: "BUSINESS_RULE",
      field: "shipping_address.country_code",
      message: `This store ships to ${policy.shipToCountries.join(", ")} only.`,
      user_message: `Sorry, we only ship within ${policy.shipToCountries.join(", ")}.`,
      context: {
        specific_issue: "INTERNATIONAL_SHIPPING_RESTRICTED",
        destination_country: address.country_code,
        supported_countries: policy.shipToCountries,
      },
      resolution_options: [{ action: "UPDATE_ADDRESS", label: "Use a supported address" }],
    });
  }

  const itemTotalCents = lines.reduce((sum, l) => sum + l.unitAmountCents * l.quantity, 0);
  const shippingCents =
    itemTotalCents > policy.freeShippingOverCents ? 0 : policy.flatShippingCents;
  const wantsGiftWrap = requested.some((l) => l.gift_options?.gift_wrap === true);
  const handlingCents = wantsGiftWrap ? policy.giftWrapCents : 0;
  const totalCents = itemTotalCents + shippingCents + handlingCents;

  const [minDays, maxDays] = policy.transitBusinessDays;
  const shippingOptions: ShippingOption[] = [
    {
      id: SHIPPING_OPTION_ID,
      name: policy.carrier,
      description: `Ships within ${policy.handlingBusinessDays} business days, then ${minDays}-${maxDays} business days in transit. Free over ${money(policy.freeShippingOverCents, currency).value} ${currency}.`,
      price: money(shippingCents, currency),
      is_selected: true,
      // Latest expected delivery date; the cart API requires an ISO calendar date.
      estimated_delivery: addBusinessDays(now, policy.handlingBusinessDays + maxDays),
    },
  ];

  const totals: CartTotals = {
    subtotal: money(itemTotalCents, currency),
    shipping: money(shippingCents, currency),
    ...(handlingCents > 0 ? { handling: money(handlingCents, currency) } : {}),
    total: money(totalCents, currency),
  };

  const missingInfo = issues.some((i) => i.type === "MISSING_FIELD");
  const invalid = issues.some((i) => i.type !== "MISSING_FIELD");
  return {
    items,
    lines,
    totals,
    shippingOptions,
    issues,
    status: issues.length === 0 ? "READY" : "INCOMPLETE",
    validationStatus: invalid
      ? "INVALID"
      : missingInfo
        ? "REQUIRES_ADDITIONAL_INFORMATION"
        : "VALID",
    amounts: { itemTotalCents, shippingCents, handlingCents, totalCents },
  };
}
