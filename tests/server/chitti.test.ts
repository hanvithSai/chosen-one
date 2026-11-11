import request from "supertest";
import { describe, expect, it } from "vitest";
import { QuotaExceededError } from "../../server/ai/quota.js";
import { createApp } from "../../server/app.js";
import { collectSteps, parseToolOutput, type BuyerAgent } from "../../server/buyer/chitti.js";
import { RateLimiter } from "../../server/buyer/routes.js";
import { loadConfig } from "../../server/config.js";
import { createLogger } from "../../server/logger.js";

const asText = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  isError,
});

describe("collectSteps", () => {
  it("summarises tool calls and finds the PayPal approval link", () => {
    const out = collectSteps([
      {
        toolCalls: [{ toolCallId: "1", toolName: "search_products", input: { query: "mug" } }],
        toolResults: [
          { toolCallId: "1", toolName: "search_products", output: asText({ results: [{}, {}] }) },
        ],
      },
      {
        toolCalls: [{ toolCallId: "2", toolName: "checkout_cart", input: { cart_id: "cart_1" } }],
        toolResults: [
          {
            toolCallId: "2",
            toolName: "checkout_cart",
            output: asText({ cart_id: "cart_1", approval_url: "https://www.sandbox.paypal.com/x" }),
          },
        ],
      },
    ]);
    expect(out.steps.map((s) => s.summary)).toEqual([
      "2 products found",
      "PayPal checkout started",
    ]);
    expect(out.approvalUrl).toBe("https://www.sandbox.paypal.com/x");
    expect(out.cartId).toBe("cart_1");
  });

  it("marks failed tool calls and gives no approval link", () => {
    const out = collectSteps([
      {
        toolCalls: [{ toolCallId: "1", toolName: "checkout_cart", input: {} }],
        toolResults: [
          { toolCallId: "1", toolName: "checkout_cart", output: asText({ error: "nope" }, true) },
        ],
      },
    ]);
    expect(out.steps[0]?.ok).toBe(false);
    expect(out.steps[0]?.summary).toMatch(/^error/);
    expect(out.approvalUrl).toBeUndefined();
  });

  it("tolerates a call with no result", () => {
    const out = collectSteps([{ toolCalls: [{ toolCallId: "9", toolName: "get_product" }] }]);
    expect(out.steps[0]?.summary).toBe("no result");
  });

  it("parses non-JSON tool text without throwing", () => {
    expect(parseToolOutput({ content: [{ type: "text", text: "plain" }] })).toMatchObject({
      ok: true,
      data: undefined,
      text: "plain",
    });
  });
});

describe("RateLimiter", () => {
  it("allows the limit inside the window, then frees up", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
    now = 1500;
    expect(limiter.take("a")).toBe(true);
  });
});

describe("Chitti API", () => {
  const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: "test-store-token" });
  const logger = createLogger(config);
  const reply = { reply: "Hello", steps: [], model: "mock" };
  const build = (agent: BuyerAgent) => createApp({ config, logger, buyerAgent: agent });
  const user = (content: string) => ({ messages: [{ role: "user", content }] });

  it("returns the agent's reply", async () => {
    const res = await request(build({ chat: async () => reply }))
      .post("/api/chitti")
      .send(user("hi"));
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Hello");
  });

  it("rejects bad input", async () => {
    const app = build({ chat: async () => reply });
    expect((await request(app).post("/api/chitti").send({})).status).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/chitti")
          .send(user("x".repeat(601)))
      ).status,
    ).toBe(400);
    const lastAssistant = { messages: [{ role: "assistant", content: "hi" }] };
    expect((await request(app).post("/api/chitti").send(lastAssistant)).status).toBe(400);
  });

  it("limits each visitor", async () => {
    const app = build({ chat: async () => reply });
    for (let i = 0; i < 8; i++) {
      expect((await request(app).post("/api/chitti").send(user("hi"))).status).toBe(200);
    }
    const blocked = await request(app).post("/api/chitti").send(user("hi"));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("busy");
  });

  it("explains when the free model quota is used up", async () => {
    const agent: BuyerAgent = {
      chat: async () => {
        throw new QuotaExceededError("google", "m", "daily request limit");
      },
    };
    const res = await request(build(agent)).post("/api/chitti").send(user("hi"));
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/limit/);
  });

  it("reports a failed agent without leaking details", async () => {
    const agent: BuyerAgent = {
      chat: async () => {
        throw new Error("secret internal detail");
      },
    };
    const res = await request(build(agent)).post("/api/chitti").send(user("hi"));
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});
