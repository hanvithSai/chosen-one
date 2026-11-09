import { describe, expect, it } from "vitest";
import type { Product } from "../../server/commerce/catalog.js";
import {
  addBusinessDays,
  money,
  normalizeItemId,
  priceCart,
} from "../../server/commerce/cartPricing.js";
import type { CheckoutPolicy } from "../../server/demo/data.js";

const policy: CheckoutPolicy = {
  currency: "USD",
  shipToCountries: ["US"],
  carrier: "USPS Priority Mail",
  handlingBusinessDays: 2,
  transitBusinessDays: [2, 3],
  flatShippingCents: 800,
  freeShippingOverCents: 6000,
  giftWrapCents: 500,
};

const product = (sku: string, priceCents: number, stock = 10): Product => ({
  id: sku,
  catalogVersionId: "v1",
  sku,
  line: "stoneware",
  title: `Title ${sku}`,
  description: "Thin listing.",
  priceCents,
  currency: "USD",
  stock,
  attributes: {},
  imageUrl: null,
});

const catalog = [product("MB-MUG", 3400), product("MB-VASE", 11000, 1)];
const usAddress = {
  address_line_1: "1 Main St",
  admin_area_2: "Austin",
  admin_area_1: "TX",
  postal_code: "78701",
  country_code: "US",
};

describe("priceCart", () => {
  it("prices from the catalog and charges flat shipping under the threshold", () => {
    const priced = priceCart(
      { items: [{ item_id: "MB-MUG", quantity: 1 }], shipping_address: usAddress },
      catalog,
      policy,
      "mayabazar",
    );
    expect(priced.status).toBe("READY");
    expect(priced.validationStatus).toBe("VALID");
    expect(priced.totals).toMatchObject({
      subtotal: money(3400, "USD"),
      shipping: money(800, "USD"),
      total: money(4200, "USD"),
    });
  });

  it("ships free over the threshold", () => {
    const priced = priceCart(
      { items: [{ item_id: "MB-MUG", quantity: 2 }], shipping_address: usAddress },
      catalog,
      policy,
      "mayabazar",
    );
    expect(priced.amounts).toMatchObject({
      itemTotalCents: 6800,
      shippingCents: 0,
      totalCents: 6800,
    });
  });

  it("ignores prices supplied by the agent", () => {
    const priced = priceCart(
      {
        items: [{ item_id: "MB-MUG", quantity: 1, price: { currency_code: "USD", value: "0.01" } }],
        shipping_address: usAddress,
      },
      catalog,
      policy,
      "mayabazar",
    );
    expect(priced.items[0]?.price).toEqual(money(3400, "USD"));
  });

  it("adds gift wrap as handling", () => {
    const priced = priceCart(
      {
        items: [{ item_id: "MB-MUG", quantity: 1, gift_options: { gift_wrap: true } }],
        shipping_address: usAddress,
      },
      catalog,
      policy,
      "mayabazar",
    );
    expect(priced.totals.handling).toEqual(money(500, "USD"));
    expect(priced.amounts.totalCents).toBe(3400 + 800 + 500);
  });

  it("asks for a shipping address when missing", () => {
    const priced = priceCart(
      { items: [{ item_id: "MB-MUG", quantity: 1 }] },
      catalog,
      policy,
      "mayabazar",
    );
    expect(priced.status).toBe("INCOMPLETE");
    expect(priced.validationStatus).toBe("REQUIRES_ADDITIONAL_INFORMATION");
    expect(priced.issues[0]?.context).toMatchObject({ specific_issue: "MISSING_SHIPPING_ADDRESS" });
  });

  it("rejects destinations outside the shipping countries", () => {
    const priced = priceCart(
      {
        items: [{ item_id: "MB-MUG", quantity: 1 }],
        shipping_address: { ...usAddress, country_code: "CA" },
      },
      catalog,
      policy,
      "mayabazar",
    );
    expect(priced.validationStatus).toBe("INVALID");
    expect(priced.issues[0]?.context).toMatchObject({
      specific_issue: "INTERNATIONAL_SHIPPING_RESTRICTED",
    });
  });

  it("flags insufficient inventory and unknown items", () => {
    const priced = priceCart(
      {
        items: [
          { item_id: "MB-VASE", quantity: 3 },
          { item_id: "MB-NOPE", quantity: 1 },
        ],
        shipping_address: usAddress,
      },
      catalog,
      policy,
      "mayabazar",
    );
    const issues = priced.issues.map(
      (i) => (i.context as { specific_issue?: string }).specific_issue,
    );
    expect(issues).toEqual(["INSUFFICIENT_INVENTORY", "ITEM_NOT_FOUND"]);
    expect(priced.status).toBe("INCOMPLETE");
  });

  it("accepts market refs as item ids", () => {
    expect(normalizeItemId("mayabazar:MB-MUG", "mayabazar")).toBe("MB-MUG");
    expect(normalizeItemId("MB-MUG", "mayabazar")).toBe("MB-MUG");
  });
});

describe("addBusinessDays", () => {
  it("skips weekends and returns an ISO date", () => {
    // Tue 10 Nov 2026 + 5 business days = Tue 17 Nov 2026.
    expect(addBusinessDays(new Date("2026-11-10T09:00:00Z"), 5)).toBe("2026-11-17");
    // Fri 13 Nov 2026 + 1 business day = Mon 16 Nov 2026.
    expect(addBusinessDays(new Date("2026-11-13T09:00:00Z"), 1)).toBe("2026-11-16");
  });
});
