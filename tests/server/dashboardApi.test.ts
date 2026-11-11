import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { LlmService } from "../../server/ai/llm.js";
import { QuotaGuard } from "../../server/ai/quota.js";
import { createApp } from "../../server/app.js";
import { CartService } from "../../server/commerce/cart.js";
import { loadConfig } from "../../server/config.js";
import { seedRecordings } from "../../server/demo/recordings.js";
import { loadDemoData } from "../../server/demo/data.js";
import { createLogger } from "../../server/logger.js";
import { seedMarket } from "../../server/market/seed.js";
import { FakePaymentGateway } from "../../server/payments/gateway.js";
import { PanelService } from "../../server/panel/panelService.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

let database: TestDatabase;
let app: ReturnType<typeof createApp>;
let cartService: CartService;

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  await seedMarket(database.db, "mayabazar");
  await seedRecordings(database.db, "mayabazar");
  const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: "test-store-token" });
  const policy = loadDemoData().merchant.checkout;
  cartService = new CartService(database.db, {
    merchantSlug: "mayabazar",
    policy,
    publicBaseUrl: "http://localhost:3000",
    gateway: new FakePaymentGateway(),
  });
  const llm = new LlmService([
    {
      slot: "main",
      model: new MockLanguageModelV4(),
      guard: new QuotaGuard({ db: database.db, provider: "d", model: "d", limits: {} }),
    },
  ]);
  app = createApp({
    config,
    logger: createLogger(config),
    database,
    llm,
    panelService: new PanelService(database.db, llm),
    commerce: { cartService, merchantSlug: "mayabazar", policy },
  });
});

afterAll(async () => {
  await database.close();
});

describe("dashboard API", () => {
  it("describes the store and its current catalog version", async () => {
    const res = await request(app).get("/api/store");
    expect(res.status).toBe(200);
    expect(res.body.merchant.name).toBe("Mayabazar");
    expect(res.body.catalogVersion).toBe(2);
    expect(res.body.products).toBe(24);
  });

  it("lists the approved fixes with their quotes and source notes", async () => {
    const res = await request(app).get("/api/proposals");
    expect(res.status).toBe(200);
    expect(res.body.proposals.length).toBeGreaterThan(200);
    const one = res.body.proposals[0];
    expect(one.quote).toBeTruthy();
    expect(one.noteTitle).toBeTruthy();
    expect(one.status).toBe("approved");
  });

  it("lists the recorded panels, newest data first, without per-request detail", async () => {
    const res = await request(app).get("/api/panels");
    expect(res.body.panels).toHaveLength(2);
    expect(res.body.panels.every((p: { recorded: boolean }) => p.recorded)).toBe(true);
    const rates = res.body.panels.map((p: { pickRate: number }) => p.pickRate).sort();
    expect(rates[0]).toBeCloseTo(0.15, 5);
    expect(rates[1]).toBeCloseTo(0.6, 5);
  });

  it("shows agent orders and tool calls", async () => {
    const cart = await cartService.create(
      {
        items: [{ item_id: "MB-MUG-MONSOON", quantity: 1 }],
        shipping_address: { country_code: "US", postal_code: "78701" },
      },
      { agentClient: "dash-agent" },
    );
    await cartService.checkout(cart.id!, {}, { agentClient: "dash-agent" });
    const res = await request(app).get("/api/activity");
    expect(res.status).toBe(200);
    expect(res.body.orders[0]).toMatchObject({ agent: "dash-agent", status: "CREATED" });
    expect(res.body.totals.agentOrders).toBe(1);
    expect(res.body.toolCalls.byTool).toEqual([]);
  });
});
