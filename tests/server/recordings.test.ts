import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCatalog } from "../../server/commerce/catalog.js";
import { seedRecordings, RecordingFileSchema } from "../../server/demo/recordings.js";
import { seedMarket } from "../../server/market/seed.js";
import { comparePanels, summarizePanel } from "../../server/panel/report.js";
import { panels } from "../../server/db/schema.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  await seedMarket(database.db, "mayabazar");
});

afterAll(async () => {
  await database.close();
});

describe("demo recordings", () => {
  it("seeds the baseline, the approved fixes and the re-measured panel", async () => {
    const result = await seedRecordings(database.db, "mayabazar");
    expect(result).toEqual({ seeded: true, panels: 2 });

    const current = await getCatalog(database.db, "mayabazar");
    expect(current.version.version).toBe(2);
    const mug = current.products.find((p) => p.sku === "MB-MUG-MONSOON")!;
    expect(Object.keys(mug.attributes).length).toBeGreaterThan(3);
    expect(mug.attributes.dishwasher_safe).toBeDefined();
    const original = await getCatalog(database.db, "mayabazar", 1);
    expect(original.products.find((p) => p.sku === "MB-MUG-MONSOON")!.attributes).toEqual({});
  });

  it("is idempotent", async () => {
    expect((await seedRecordings(database.db, "mayabazar")).seeded).toBe(false);
    expect(await database.db.select().from(panels)).toHaveLength(2);
  });

  it("reproduces the recorded PickRate numbers", async () => {
    const rows = (await database.db.select().from(panels)).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const all = await Promise.all(rows.map((r) => summarizePanel(database.db, r.id, "mayabazar")));
    const baseline = all.find((s) => s?.label === "Baseline")!;
    const after = all.find((s) => s?.label !== "Baseline")!;
    expect(baseline.recorded).toBe(true);
    expect(baseline.pickRate).toBeCloseTo(0.15, 5);
    expect(after.pickRate).toBeCloseTo(0.6, 5);
    expect(baseline.totalRuns).toBe(20);
    expect(comparePanels(baseline, after).deltaPoints).toBe(45);
    expect(baseline.lostReasons[0]?.category).toBe("missing_fact");
  });

  it("holds only anonymised competitors and no prices or stock changes", async () => {
    const raw = readFileSync("data/recordings/demo-run.json", "utf8");
    const file = RecordingFileSchema.parse(JSON.parse(raw));
    expect(raw).not.toMatch(/https?:\/\//);
    const stores = new Set(
      [...file.baseline.runs, ...file.after.runs].flatMap((r) =>
        r.considerations.map((c) => c.store),
      ),
    );
    for (const store of stores) expect(store).toMatch(/^(Mayabazar|mayabazar|Competitor [A-Z])$/);
    expect(file.proposals.every((p) => !/price|stock/i.test(p.field))).toBe(true);
    const before = await getCatalog(database.db, "mayabazar", 1);
    const after = await getCatalog(database.db, "mayabazar", 2);
    for (const p of after.products) {
      const old = before.products.find((o) => o.sku === p.sku)!;
      expect(p.priceCents).toBe(old.priceCents);
      expect(p.stock).toBe(old.stock);
    }
  });
});

describe("per-request reasons for lost sales", () => {
  it("attaches the shopper's reason about the store's own listing to each lost request", async () => {
    const rows = await database.db.select().from(panels);
    const after = (
      await Promise.all(rows.map((r) => summarizePanel(database.db, r.id, "mayabazar")))
    ).find((s) => s?.label !== "Baseline")!;
    const lost = after.results.filter((r) => r.outcome !== "bought_ours");
    expect(lost.length).toBe(8);
    expect(lost.every((r) => r.ourReason?.category)).toBe(true);
    const won = after.results.filter((r) => r.outcome === "bought_ours");
    expect(won.every((r) => r.ourReason === undefined)).toBe(true);
  });
});
