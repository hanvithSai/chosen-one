import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LlmService, type LlmModel } from "../../server/ai/llm.js";
import { QuotaGuard } from "../../server/ai/quota.js";
import { considerations, panels, runs } from "../../server/db/schema.js";
import { seedMarket } from "../../server/market/seed.js";
import { PanelService } from "../../server/panel/panelService.js";
import { summarizePanel } from "../../server/panel/report.js";
import { buildShopperPrompt, findCandidates } from "../../server/panel/shopper.js";
import { MarketIndex } from "../../server/commerce/search.js";
import { getCatalog, toMarketItems } from "../../server/commerce/catalog.js";
import { loadCompetitorItems } from "../../server/market/snapshot.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

/**
 * Stand-in shopper: reads the listings from the prompt and picks the one that states
 * "dishwasher" if any, else the cheapest. Every listing gets a considered verdict.
 */
function shopperModel(options: { prefer: "ours" | "competitor" | "none" }) {
  return new MockLanguageModelV4({
    doGenerate: async (params) => {
      const prompt = JSON.stringify(params.prompt);
      const listings = [...prompt.matchAll(/ref: ([^\\]+)\\nseller: ([^\\]+)\\n/g)].map((m) => ({
        ref: m[1]!,
        seller: m[2]!,
      }));
      const ours = listings.find((l) => l.ref.startsWith("mayabazar:"));
      const theirs = listings.find((l) => !l.ref.startsWith("mayabazar:"));
      const chosen =
        options.prefer === "none" ? undefined : options.prefer === "ours" ? ours : theirs;
      const decision = {
        chosen_ref: chosen?.ref ?? null,
        rationale: chosen ? "Best match." : "Nothing good enough.",
        considerations: listings.map((l) => ({
          ref: l.ref,
          verdict: l.ref === chosen?.ref ? "chosen" : "rejected",
          reason: l.ref.startsWith("mayabazar:") ? "Does not state key facts." : "Not the best.",
          reason_category: l.ref.startsWith("mayabazar:") ? "missing_fact" : "better_alternative",
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(decision) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 50, text: 50, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  await seedMarket(database.db, "mayabazar");
});

afterAll(async () => {
  await database.close();
});

function llmWith(prefer: "ours" | "competitor" | "none"): LlmService {
  const entry = (slot: LlmModel["slot"]): LlmModel => ({
    slot,
    model: shopperModel({ prefer }),
    guard: new QuotaGuard({
      db: database.db,
      provider: `mock-${slot}-${prefer}`,
      model: slot,
      limits: {},
    }),
  });
  return new LlmService([entry("gemini"), entry("groq")]);
}

describe("shopper candidates", () => {
  it("shows the same listings every time, with both stores in the market", async () => {
    const catalog = await getCatalog(database.db, "mayabazar");
    const market = [
      ...toMarketItems(catalog),
      ...(await loadCompetitorItems(database.db, "mayabazar")),
    ];
    const index = new MarketIndex(market);
    const intent = {
      text: "A statement vase for dried pampas grass",
      persona: null,
      constraints: {},
    };
    const a = findCandidates(index, intent).map((c) => c.ref);
    const b = findCandidates(index, intent).map((c) => c.ref);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(2);
    expect(a.some((ref) => ref.startsWith("mayabazar:"))).toBe(true);
    expect(a.some((ref) => ref.startsWith("competitor-"))).toBe(true);
    expect(buildShopperPrompt(intent, findCandidates(index, intent))).toContain("Request:");
  });
});

describe("PanelService", () => {
  it("runs every intent and stores decisions with reasons", async () => {
    const service = new PanelService(database.db, llmWith("competitor"));
    const progress: number[] = [];
    const panelId = await service.runToCompletion({
      merchantSlug: "mayabazar",
      label: "Baseline",
      onProgress: (done) => progress.push(done),
    });
    expect(progress.at(-1)).toBe(20);

    const [panel] = await database.db.select().from(panels).where(eq(panels.id, panelId));
    expect(panel?.status).toBe("completed");
    const runRows = await database.db.select().from(runs).where(eq(runs.panelId, panelId));
    expect(runRows).toHaveLength(20);
    expect(runRows.every((r) => r.transcript.length === 2)).toBe(true);
    const reasons = await database.db.select().from(considerations);
    expect(reasons.length).toBeGreaterThan(20);
  });

  it("reports PickRate, who won, and why the store lost", async () => {
    const service = new PanelService(database.db, llmWith("competitor"));
    const panelId = await service.runToCompletion({ merchantSlug: "mayabazar", label: "B" });
    const summary = (await summarizePanel(database.db, panelId, "mayabazar"))!;
    expect(summary.totalRuns).toBe(20);
    expect(summary.pickRate).toBe(summary.boughtOurs / (summary.totalRuns - summary.errors));
    expect(summary.pickRate).toBeLessThan(0.5);
    expect(summary.boughtCompetitor).toBeGreaterThan(0);
    expect(summary.lostTo.every((l) => /^Competitor [A-Z]$/.test(l.store))).toBe(true);
    expect(summary.lostReasons.map((r) => r.category)).toContain("missing_fact");
    expect(summary.results).toHaveLength(20);
  });

  it("gives a high PickRate when the shopper prefers the store", async () => {
    const service = new PanelService(database.db, llmWith("ours"));
    const panelId = await service.runToCompletion({ merchantSlug: "mayabazar", label: "Ours" });
    const summary = (await summarizePanel(database.db, panelId, "mayabazar"))!;
    expect(summary.pickRate).toBeGreaterThan(0.5);
    expect(summary.lostReasons.length).toBeLessThanOrEqual(
      summary.boughtCompetitor + summary.noPurchase,
    );
  });

  it("counts no-purchase runs and keeps the panel completed", async () => {
    const service = new PanelService(database.db, llmWith("none"));
    const panelId = await service.runToCompletion({ merchantSlug: "mayabazar", label: "None" });
    const summary = (await summarizePanel(database.db, panelId, "mayabazar"))!;
    expect(summary.pickRate).toBe(0);
    expect(summary.noPurchase).toBeGreaterThan(0);
    expect(summary.status).toBe("completed");
  });

  it("marks failed runs as errors and fails the panel when every run fails", async () => {
    const broken = new LlmService([
      {
        slot: "gemini",
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            throw new Error("boom");
          },
        }),
        guard: new QuotaGuard({ db: database.db, provider: "x1", model: "x1", limits: {} }),
      },
      {
        slot: "groq",
        model: new MockLanguageModelV4({
          doGenerate: async () => {
            throw new Error("boom");
          },
        }),
        guard: new QuotaGuard({ db: database.db, provider: "x2", model: "x2", limits: {} }),
      },
    ]);
    const service = new PanelService(database.db, broken);
    const panelId = await service.runToCompletion({ merchantSlug: "mayabazar", label: "Broken" });
    const summary = (await summarizePanel(database.db, panelId, "mayabazar"))!;
    expect(summary.status).toBe("failed");
    expect(summary.errors).toBe(20);
    expect(summary.pickRate).toBe(0);
  });
});
