import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase, type DbHandle } from "../../server/db/client.js";
import { intents, products, sourceNotes } from "../../server/db/schema.js";
import { loadDemoData } from "../../server/demo/data.js";
import { assignModelSlot, seedDemo } from "../../server/demo/seed.js";

const data = loadDemoData();
let database: DbHandle;

beforeAll(async () => {
  database = await openDatabase();
  await database.migrate();
});

afterAll(async () => {
  await database.close();
});

describe("demo data files", () => {
  it("describe the Mayabazar shop with 24 thin listings across three lines", () => {
    expect(data.merchant.slug).toBe("mayabazar");
    expect(data.products).toHaveLength(24);
    expect(new Set(data.products.map((p) => p.line))).toEqual(
      new Set(["stoneware", "terracotta", "raku"]),
    );
  });

  it("keep the facts agents need in source notes, not in listings", () => {
    const listingText = data.products.map((p) => `${p.title} ${p.description}`).join(" ");
    const notesText = data.sourceNotes.map((n) => n.body).join(" ");
    for (const fact of ["dishwasher safe", "lead-free", "drainage hole", "not watertight"]) {
      expect(listingText.toLowerCase()).not.toContain(fact);
      expect(notesText.toLowerCase()).toContain(fact);
    }
  });

  it("define 20 shopper intents", () => {
    expect(data.intents).toHaveLength(20);
  });
});

describe("seedDemo", () => {
  it("seeds the merchant, catalog, notes and intents", async () => {
    const summary = await seedDemo(database.db, data);
    expect(summary.created).toEqual({ merchant: true, catalog: true, notes: true, intents: true });

    const { db } = database;
    const catalog = await db
      .select()
      .from(products)
      .where(eq(products.catalogVersionId, summary.catalogVersionId));
    expect(catalog).toHaveLength(24);
    const notes = await db
      .select()
      .from(sourceNotes)
      .where(eq(sourceNotes.merchantId, summary.merchantId));
    expect(notes).toHaveLength(data.sourceNotes.length);
    const seededIntents = await db
      .select()
      .from(intents)
      .where(eq(intents.intentSetId, summary.intentSetId));
    expect(seededIntents).toHaveLength(20);
  });

  it("is idempotent", async () => {
    const again = await seedDemo(database.db, data);
    expect(again.created).toEqual({
      merchant: false,
      catalog: false,
      notes: false,
      intents: false,
    });
    const catalog = await database.db
      .select()
      .from(products)
      .where(eq(products.catalogVersionId, again.catalogVersionId));
    expect(catalog).toHaveLength(24);
  });

  it("alternates panel model slots so both providers share the panel", () => {
    expect([0, 1, 2, 3].map(assignModelSlot)).toEqual(["gemini", "groq", "gemini", "groq"]);
  });
});
