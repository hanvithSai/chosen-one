import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCatalog, NotFoundError, toMarketItems } from "../../server/commerce/catalog.js";
import { attributesToText, MarketIndex, type MarketItem } from "../../server/commerce/search.js";
import type { DbHandle } from "../../server/db/client.js";
import { createTestDatabase } from "../helpers/db.js";

function item(overrides: Partial<MarketItem> & Pick<MarketItem, "ref" | "title">): MarketItem {
  return {
    store: "Test",
    description: "",
    priceCents: 3000,
    currency: "USD",
    attributes: {},
    inStock: true,
    ...overrides,
  };
}

describe("attributesToText", () => {
  it("flattens booleans, arrays and values into searchable text", () => {
    expect(
      attributesToText({ dishwasher_safe: true, food_safe: false, colours: ["pink", "mint"] }),
    ).toBe("dishwasher safe; not food safe; colours: pink, mint");
  });
});

describe("MarketIndex", () => {
  const market = [
    item({ ref: "a:mug", title: "Stoneware Mug", priceCents: 2500 }),
    item({ ref: "b:mug", store: "Other", title: "Ceramic Mug", priceCents: 4500 }),
    item({ ref: "c:vase", title: "Raku Vase", priceCents: 9000 }),
    item({ ref: "d:mug-gone", title: "Sold Out Mug", inStock: false }),
  ];
  const index = new MarketIndex(market);

  it("finds matching items and excludes out-of-stock ones", () => {
    const refs = index.query("mug").map((h) => h.ref);
    expect(refs).toContain("a:mug");
    expect(refs).toContain("b:mug");
    expect(refs).not.toContain("d:mug-gone");
    expect(refs).not.toContain("c:vase");
  });

  it("applies price and store filters", () => {
    expect(index.query("mug", { maxPriceCents: 3000 }).map((h) => h.ref)).toEqual(["a:mug"]);
    expect(index.query("mug", { store: "Other" }).map((h) => h.ref)).toEqual(["b:mug"]);
  });

  it("returns identical results for identical queries", () => {
    expect(index.query("ceramic mug")).toEqual(index.query("ceramic mug"));
  });

  it("rejects duplicate refs", () => {
    expect(
      () => new MarketIndex([item({ ref: "x", title: "A" }), item({ ref: "x", title: "B" })]),
    ).toThrow(/Duplicate/);
  });

  it("ranks a listing higher once its structured facts match the shopper's need", () => {
    const competitor = item({
      ref: "comp:mug",
      store: "Competitor A",
      title: "Handmade Mug",
      description: "Dishwasher safe handmade stoneware mug.",
    });
    const thin = item({
      ref: "ours:mug",
      store: "Mayabazar",
      title: "Monsoon Mug",
      description: "Hand-thrown mug.",
    });
    const enriched = { ...thin, attributes: { dishwasher_safe: true, handmade: true } };

    const before = new MarketIndex([competitor, thin]).query("dishwasher safe handmade mug");
    const after = new MarketIndex([competitor, enriched]).query("dishwasher safe handmade mug");

    expect(before[0]?.ref).toBe("comp:mug");
    const scoreOf = (hits: typeof before, ref: string) =>
      hits.find((h) => h.ref === ref)?.score ?? 0;
    expect(scoreOf(after, "ours:mug")).toBeGreaterThan(scoreOf(before, "ours:mug"));
  });
});

describe("catalog service", () => {
  let database: DbHandle;

  beforeAll(async () => {
    database = await createTestDatabase({ seed: true });
  });

  afterAll(async () => {
    await database.close();
  });

  it("loads the latest Mayabazar catalog as market items", async () => {
    const catalog = await getCatalog(database.db, "mayabazar");
    expect(catalog.version.version).toBe(1);
    expect(catalog.products).toHaveLength(24);

    const items = toMarketItems(catalog);
    expect(items[0]?.ref).toMatch(/^mayabazar:MB-/);
    expect(new MarketIndex(items).query("kulhad chai").map((h) => h.ref)).toContain(
      "mayabazar:MB-KULHAD-4",
    );
  });

  it("raises NotFoundError for unknown merchants", async () => {
    await expect(getCatalog(database.db, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});
