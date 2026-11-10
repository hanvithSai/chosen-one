import { MockLanguageModelV4 } from "ai/test";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LlmService, type LlmModel } from "../../server/ai/llm.js";
import { QuotaGuard } from "../../server/ai/quota.js";
import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { createLogger } from "../../server/logger.js";
import { seedMarket } from "../../server/market/seed.js";
import { PanelService } from "../../server/panel/panelService.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

const TOKEN = "test-store-token";
let database: TestDatabase;

/** Always declines to buy, so runs are fast and deterministic. */
const decliningModel = () =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            chosen_ref: null,
            rationale: "Nothing fits.",
            considerations: [],
          }),
        },
      ],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });

function buildApp(env: Record<string, string> = {}) {
  const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: TOKEN, ...env });
  const entry = (slot: LlmModel["slot"]): LlmModel => ({
    slot,
    model: decliningModel(),
    guard: new QuotaGuard({
      db: database.db,
      provider: `api-${slot}`,
      model: slot,
      limits: {},
    }),
  });
  const llm = new LlmService([entry("gemini"), entry("groq")]);
  return createApp({
    config,
    logger: createLogger(config),
    database,
    panelService: new PanelService(database.db, llm),
  });
}

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  await seedMarket(database.db, "mayabazar");
});

afterAll(async () => {
  await database.close();
});

describe("panel API", () => {
  it("requires the token to start a panel", async () => {
    const res = await request(buildApp()).post("/api/panels").send({ label: "x" });
    expect(res.status).toBe(401);
  });

  it("starts a panel, then reports it with PickRate", async () => {
    const app = buildApp();
    const started = await request(app)
      .post("/api/panels")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ label: "Baseline" });
    expect(started.status).toBe(202);
    const id = started.body.panelId as string;

    let body: { status: string; pickRate: number; totalRuns: number } | undefined;
    for (let i = 0; i < 100; i++) {
      const res = await request(app).get(`/api/panels/${id}`);
      body = res.body;
      if (body?.status === "completed") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(body?.status).toBe("completed");
    expect(body?.totalRuns).toBe(20);
    expect(body?.pickRate).toBe(0);

    const list = await request(app).get("/api/panels");
    expect(list.status).toBe(200);
    expect(list.body.panels.some((p: { panelId: string }) => p.panelId === id)).toBe(true);
    expect(list.body.panels[0].results).toBeUndefined();
  });

  it("refuses to start panels in read-only replay mode", async () => {
    const res = await request(buildApp({ DEMO_MODE: "replay" }))
      .post("/api/panels")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown or malformed panel id", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/panels/not-an-id")).status).toBe(404);
    expect(
      (await request(app).get("/api/panels/00000000-0000-0000-0000-000000000000")).status,
    ).toBe(404);
  });
});
