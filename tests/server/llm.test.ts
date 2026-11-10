import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmService, LlmUnavailableError, type LlmModel } from "../../server/ai/llm.js";
import { QuotaExceededError, QuotaGuard } from "../../server/ai/quota.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();
});

function mockModel(json: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe("QuotaGuard", () => {
  it("counts daily usage in the database", async () => {
    const guard = new QuotaGuard({
      db: database.db,
      provider: "p1",
      model: "m1",
      limits: { requestsPerDay: 2 },
    });
    await guard.reserve(10);
    await guard.record(10, 10);
    await guard.reserve(10);
    await guard.record(20, 10);
    expect(await guard.usageToday()).toEqual({ requests: 2, tokens: 30 });
    await expect(guard.reserve(1)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("rejects a request that would pass the daily token limit", async () => {
    const guard = new QuotaGuard({
      db: database.db,
      provider: "p2",
      model: "m2",
      limits: { tokensPerDay: 100 },
    });
    await guard.reserve(60);
    await guard.record(60, 60);
    await expect(guard.reserve(60)).rejects.toThrow(/daily token limit/);
  });

  it("waits for the per-minute window instead of failing", async () => {
    let now = 1_000_000;
    const slept: number[] = [];
    const guard = new QuotaGuard({
      db: database.db,
      provider: "p3",
      model: "m3",
      limits: { requestsPerMinute: 1 },
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
    });
    await guard.reserve(1);
    await guard.reserve(1);
    expect(slept.length).toBe(1);
    expect(slept[0]).toBeGreaterThan(59_000);
  });

  it("gives up when the wait would be too long", async () => {
    const guard = new QuotaGuard({
      db: database.db,
      provider: "p4",
      model: "m4",
      limits: { requestsPerMinute: 1 },
      maxWaitMs: 1000,
      sleep: async () => {},
    });
    await guard.reserve(1);
    await expect(guard.reserve(1)).rejects.toThrow(/per-minute limit/);
  });
});

describe("LlmService", () => {
  const schema = z.object({ pick: z.string() });

  function entry(slot: LlmModel["slot"], json: unknown, limits = {}): LlmModel {
    return {
      slot,
      model: mockModel(json),
      guard: new QuotaGuard({
        db: database.db,
        provider: `prov-${slot}`,
        model: `model-${slot}`,
        limits,
      }),
    };
  }

  it("returns validated structured output and records usage", async () => {
    const llm = new LlmService([entry("gemini", { pick: "Mayabazar" })]);
    const result = await llm.generateStructured({
      slot: "gemini",
      system: "Pick a shop.",
      prompt: "mug",
      schema,
    });
    expect(result.data).toEqual({ pick: "Mayabazar" });
    expect(result.slot).toBe("gemini");
    expect(result.tokens).toBe(15);
  });

  it("falls back to the other provider when a slot is out of quota", async () => {
    const llm = new LlmService([
      entry("gemini", { pick: "from-gemini" }, { requestsPerDay: 0 }),
      entry("groq", { pick: "from-groq" }),
    ]);
    const result = await llm.generateStructured({
      slot: "gemini",
      system: "s",
      prompt: "p",
      schema,
    });
    expect(result.data.pick).toBe("from-groq");
    expect(result.slot).toBe("groq");
  });

  it("reports quota exhaustion when no fallback has room", async () => {
    const llm = new LlmService([entry("groq", { pick: "x" }, { requestsPerDay: 0 })]);
    await expect(
      llm.generateStructured({ slot: "groq", system: "s", prompt: "p", schema }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("reports unavailable when no model is configured", async () => {
    const llm = new LlmService([]);
    await expect(
      llm.generateStructured({ slot: "main", system: "s", prompt: "p", schema }),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});

describe("LlmService provider overload", () => {
  it("tries the other provider when the first reports high demand", async () => {
    const busy = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("This model is currently experiencing high demand.");
      },
    });
    const guard = (provider: string) =>
      new QuotaGuard({ db: database.db, provider, model: provider, limits: {} });
    const llm = new LlmService([
      { slot: "gemini", model: busy, guard: guard("busy-g") },
      { slot: "groq", model: mockModel({ pick: "from-groq" }), guard: guard("ok-g") },
    ]);
    const result = await llm.generateStructured({
      slot: "gemini",
      system: "s",
      prompt: "p",
      schema: z.object({ pick: z.string() }),
    });
    expect(result.slot).toBe("groq");
  });
});
