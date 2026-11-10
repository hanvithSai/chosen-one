import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LlmService, type LlmModel } from "../../server/ai/llm.js";
import { QuotaGuard } from "../../server/ai/quota.js";
import { createApp } from "../../server/app.js";
import { getCatalog } from "../../server/commerce/catalog.js";
import { loadConfig } from "../../server/config.js";
import { catalogVersions, proposals } from "../../server/db/schema.js";
import { approveProposals, rejectProposals } from "../../server/enrichment/apply.js";
import {
  generateProposals,
  listProposals,
  verifyAgainstNotes,
} from "../../server/enrichment/propose.js";
import { createLogger } from "../../server/logger.js";
import { seedMarket } from "../../server/market/seed.js";
import { PanelService } from "../../server/panel/panelService.js";
import { comparePanels, summarizePanel } from "../../server/panel/report.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

const TOKEN = "test-store-token";
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const reply = (json: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(json) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});

const CARE_QUOTE = "dishwasher safe and microwave safe";
const STONEWARE = ["MB-MUG-MONSOON", "MB-MUG-SANDSTONE", "MB-BOWL-SOUP-2"];

/** Drafts one real fix, one with a made-up quote, and one with an invented number. */
const proposerModel = () =>
  new MockLanguageModelV4({
    doGenerate: async () =>
      reply({
        proposals: [
          { skus: STONEWARE, field: "dishwasher safe", value: "yes", quote: CARE_QUOTE },
          {
            skus: ["MB-MUG-BIGHUG"],
            field: "capacity",
            value: "20 oz",
            quote: "Big Hug Mug: 16 oz with an extra-wide handle",
          },
          {
            skus: ["MB-MUG-BIGHUG"],
            field: "lead free",
            value: "yes, certified for 10 years",
            quote: "All glazes on our stoneware are lead-free",
          },
          {
            skus: ["MB-VASE-BUD"],
            field: "holds water",
            value: "yes",
            quote: "this sentence is not in any note",
          },
        ],
      }),
  });

/** Shopper that buys the store's listing only if it states "dishwasher safe". */
const shopperModel = () =>
  new MockLanguageModelV4({
    doGenerate: async (params) => {
      const prompt = JSON.stringify(params.prompt);
      const blocks = prompt.split("Listing ").slice(1);
      const ours = blocks
        .map((b) => ({ ref: /ref: ([^\\]+)\\n/.exec(b)?.[1] ?? "", text: b }))
        .find((b) => b.ref.startsWith("mayabazar:") && /dishwasher safe: yes/.test(b.text));
      return reply({
        chosen_ref: ours?.ref ?? null,
        rationale: ours ? "States dishwasher safe." : "Key facts are missing.",
        considerations: [],
      });
    },
  });

let database: TestDatabase;

function llmWith(factory: () => MockLanguageModelV4, tag: string): LlmService {
  const entry = (slot: LlmModel["slot"]): LlmModel => ({
    slot,
    model: factory(),
    guard: new QuotaGuard({ db: database.db, provider: `${tag}-${slot}`, model: slot, limits: {} }),
  });
  return new LlmService([entry("gemini"), entry("groq"), entry("main")]);
}

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  await seedMarket(database.db, "mayabazar");
});

afterAll(async () => {
  await database.close();
});

describe("verifyAgainstNotes", () => {
  const notes = [{ id: "n1", body: "Soup Bowls: 6.5 in across, 24 oz each. Dishwasher SAFE." }];

  it("accepts a quote found in a note, ignoring case and spacing", () => {
    const out = verifyAgainstNotes({ value: "24 oz", quote: "6.5 in across,  24 OZ each" }, notes);
    expect(out).toEqual({ ok: true, noteId: "n1" });
  });

  it("rejects a quote that is not in any note", () => {
    expect(verifyAgainstNotes({ value: "yes", quote: "freezer safe forever" }, notes).ok).toBe(
      false,
    );
  });

  it("rejects a value with a number the quote does not contain", () => {
    const out = verifyAgainstNotes({ value: "30 oz", quote: "24 oz each" }, notes);
    expect(out.ok).toBe(false);
  });
});

describe("fix proposals", () => {
  it("keeps only fixes backed by the merchant's notes", async () => {
    const result = await generateProposals(database.db, llmWith(proposerModel, "p"), "mayabazar");
    expect(result.created).toBe(STONEWARE.length);
    expect(result.rejected.map((r) => r.field).sort()).toEqual([
      "capacity",
      "holds water",
      "lead free",
    ]);
    const listed = await listProposals(database.db, "mayabazar", "proposed");
    expect(listed.map((p) => p.field)).toEqual(Array(STONEWARE.length).fill("dishwasher safe"));
    expect(listed[0]?.noteTitle).toMatch(/Care card/);
    expect(listed[0]?.quote).toBe(CARE_QUOTE);
  });

  it("publishes approved fixes as a new catalog version without touching price", async () => {
    const before = await getCatalog(database.db, "mayabazar");
    const result = await approveProposals(database.db, "mayabazar");
    expect(result).toMatchObject({ version: before.version.version + 1, approved: 3 });
    expect(result.productsChanged).toBe(3);

    const after = await getCatalog(database.db, "mayabazar");
    expect(after.version.version).toBe(before.version.version + 1);
    const mug = after.products.find((p) => p.sku === "MB-MUG-MONSOON")!;
    const oldMug = before.products.find((p) => p.sku === "MB-MUG-MONSOON")!;
    expect(mug.attributes.dishwasher_safe).toBe("yes");
    expect(mug.priceCents).toBe(oldMug.priceCents);
    expect(mug.stock).toBe(oldMug.stock);
    expect(mug.description).toBe(oldMug.description);
    const untouched = after.products.find((p) => p.sku === "MB-PLATE-SIDE")!;
    expect(untouched.attributes).toEqual({});

    const versions = await database.db.select().from(catalogVersions);
    expect(versions).toHaveLength(2);
    // The old version stays intact for before/after comparison.
    const old = await getCatalog(database.db, "mayabazar", before.version.version);
    expect(old.products.find((p) => p.sku === "MB-MUG-MONSOON")!.attributes).toEqual({});
  });

  it("does nothing when there is nothing left to approve", async () => {
    const result = await approveProposals(database.db, "mayabazar");
    expect(result.approved).toBe(0);
  });

  it("rejects proposals the merchant declines", async () => {
    await generateProposals(database.db, llmWith(proposerModel, "p2"), "mayabazar");
    const pending = await listProposals(database.db, "mayabazar", "proposed");
    expect(pending.length).toBeGreaterThan(0);
    expect(await rejectProposals(database.db, [pending[0]!.id])).toBe(1);
    const [row] = await database.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, pending[0]!.id));
    expect(row?.status).toBe("rejected");
  });
});

describe("before and after", () => {
  it("shows PickRate rising after approved fixes", async () => {
    const db = await createTestDatabase({ seed: true });
    try {
      await seedMarket(db.db, "mayabazar");
      const mk = (factory: () => MockLanguageModelV4, tag: string) => {
        const entry = (slot: LlmModel["slot"]): LlmModel => ({
          slot,
          model: factory(),
          guard: new QuotaGuard({ db: db.db, provider: `${tag}${slot}`, model: slot, limits: {} }),
        });
        return new LlmService([entry("gemini"), entry("groq"), entry("main")]);
      };
      const panels = new PanelService(db.db, mk(shopperModel, "s"));
      const beforeId = await panels.runToCompletion({ merchantSlug: "mayabazar", label: "Before" });
      await generateProposals(db.db, mk(proposerModel, "g"), "mayabazar");
      await approveProposals(db.db, "mayabazar");
      const afterId = await panels.runToCompletion({ merchantSlug: "mayabazar", label: "After" });

      const before = (await summarizePanel(db.db, beforeId, "mayabazar"))!;
      const after = (await summarizePanel(db.db, afterId, "mayabazar"))!;
      expect(before.pickRate).toBe(0);
      expect(after.pickRate).toBeGreaterThan(0);

      const diff = comparePanels(before, after);
      expect(diff.deltaPoints).toBeGreaterThan(0);
      expect(diff.gained.length).toBeGreaterThan(0);
      expect(diff.lost).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});

describe("proposal API", () => {
  it("lists publicly but needs the token to change anything", async () => {
    const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: TOKEN });
    const app = createApp({
      config,
      logger: createLogger(config),
      database,
      llm: llmWith(proposerModel, "api"),
    });
    expect((await request(app).get("/api/proposals")).status).toBe(200);
    expect((await request(app).post("/api/proposals/generate")).status).toBe(401);
    const generated = await request(app)
      .post("/api/proposals/generate")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(generated.status).toBe(201);
    expect(generated.body.created).toBeGreaterThan(0);
    const bad = await request(app)
      .post("/api/proposals/approve")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ ids: ["not-a-uuid"] });
    expect(bad.status).toBe(400);
  });
});
