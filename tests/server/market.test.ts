import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MarketIndex } from "../../server/commerce/search.js";
import { getCatalog, toMarketItems } from "../../server/commerce/catalog.js";
import { Channel3Client, Channel3Error } from "../../server/market/channel3.js";
import { seedMarket } from "../../server/market/seed.js";
import {
  anonymize,
  fetchSnapshot,
  loadCompetitorItems,
  saveSnapshot,
  SnapshotFileSchema,
} from "../../server/market/snapshot.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

function apiProduct(id: string, brand: string, title: string, price = 25) {
  return {
    id,
    title,
    description: `${brand} makes this. ${title} by ${brand} is food safe.`,
    brands: [{ name: brand }],
    category: { title: "Mugs" },
    materials: ["Stoneware"],
    key_features: [`Made in the ${brand} studio`],
    structured_attributes: { "cleaning-instructions": ["Dishwasher safe"] },
    offers: [
      {
        domain: "shop.example",
        price: { price, currency: "USD" },
        availability: "InStock",
        url: "https://buy.example/secret",
      },
    ],
  };
}

function stubClient(products: object[]) {
  const calls: string[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(init?.body as string).query);
    return Response.json({ products });
  }) as unknown as typeof fetch;
  return { client: new Channel3Client({ apiKey: "test-key-1234567", fetchImpl }), calls };
}

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
});

afterAll(async () => {
  await database.close();
});

describe("Channel3Client", () => {
  it("keeps only buyable products and drops links", async () => {
    const out = apiProduct("p3", "Gamma", "Out of stock mug");
    out.offers[0]!.availability = "OutOfStock";
    const { client } = stubClient([apiProduct("p1", "Acme Clay", "Mug"), out]);
    const found = await client.search("mug");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "p1", seller: "Acme Clay", priceCents: 2500 });
    expect(JSON.stringify(found)).not.toContain("buy.example");
  });

  it("raises a clear error on a failed request", async () => {
    const fetchImpl = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    const client = new Channel3Client({ apiKey: "test-key-1234567", fetchImpl });
    await expect(client.search("mug")).rejects.toBeInstanceOf(Channel3Error);
  });
});

describe("anonymize", () => {
  it("labels sellers and removes their names from the text", async () => {
    const { client } = stubClient([
      apiProduct("a1", "Acme Clay", "Acme Clay Mug"),
      apiProduct("a2", "Acme Clay", "Acme Clay Bowl"),
      apiProduct("b1", "Zeta Works", "Zeta Works Vase"),
    ]);
    const products = anonymize(await client.search("x"));
    expect(products.map((p) => p.storeLabel)).toEqual([
      "Competitor A",
      "Competitor A",
      "Competitor B",
    ]);
    const text = JSON.stringify(products);
    expect(text).not.toMatch(/Acme|Zeta/i);
    expect(text).toContain("the maker");
  });

  it("drops repeat listings of the same product", async () => {
    const { client } = stubClient([
      apiProduct("a1", "Acme Clay", "Same Mug"),
      apiProduct("a2", "Acme Clay", "Same Mug"),
    ]);
    expect(anonymize(await client.search("x"))).toHaveLength(1);
  });
});

describe("market snapshot storage", () => {
  it("saves once, then loads competitor items that are searchable", async () => {
    const { client, calls } = stubClient([apiProduct("a1", "Acme Clay", "Dishwasher Safe Mug")]);
    const file = await fetchSnapshot(client, ["mug query"], 5);
    expect(calls).toEqual(["mug query"]);

    const first = await saveSnapshot(database.db, "mayabazar", file);
    const second = await saveSnapshot(database.db, "mayabazar", file);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const competitors = await loadCompetitorItems(database.db, "mayabazar");
    expect(competitors).toHaveLength(1);
    expect(competitors[0]?.store).toBe("Competitor A");

    const catalog = await getCatalog(database.db, "mayabazar");
    const index = new MarketIndex([...toMarketItems(catalog), ...competitors]);
    expect(index.size).toBe(catalog.products.length + 1);
    const hit = index.query("dishwasher safe mug").find((h) => h.store === "Competitor A");
    expect(hit).toBeDefined();
  });
});

describe("committed market snapshot", () => {
  it("is valid, anonymous, and seeds idempotently", async () => {
    const db = await createTestDatabase({ seed: true });
    try {
      const first = await seedMarket(db.db, "mayabazar");
      expect(first?.created).toBe(true);
      expect(first!.products).toBeGreaterThanOrEqual(30);
      expect((await seedMarket(db.db, "mayabazar"))?.created).toBe(false);

      const items = await loadCompetitorItems(db.db, "mayabazar");
      expect(items.length).toBe(first!.products);
      expect(new Set(items.map((i) => i.store)).size).toBeGreaterThanOrEqual(5);
      expect(items.every((i) => /^Competitor [A-Z]$/.test(i.store))).toBe(true);
    } finally {
      await db.close();
    }
  });

  it("holds no links or image addresses", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync("data/market/snapshot.json", "utf8");
    SnapshotFileSchema.parse(JSON.parse(raw));
    expect(raw).not.toMatch(/https?:\/\//);
  });
});
