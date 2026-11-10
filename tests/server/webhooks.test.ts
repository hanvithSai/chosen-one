import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { CartService } from "../../server/commerce/cart.js";
import { loadConfig } from "../../server/config.js";
import { orders, webhookEvents } from "../../server/db/schema.js";
import { loadDemoData } from "../../server/demo/data.js";
import { createLogger } from "../../server/logger.js";
import { FakePaymentGateway } from "../../server/payments/gateway.js";
import {
  PayPalWebhookVerifier,
  type WebhookHeaders,
  type WebhookVerifier,
} from "../../server/webhooks/verifier.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

const signed = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "good",
  "paypal-transmission-time": "2026-11-11T00:00:00Z",
};

/** Accepts only the signature "good", standing in for PayPal's verification call. */
const verifier: WebhookVerifier = {
  verify: async (headers: WebhookHeaders) => headers.transmissionSig === "good",
};

let database: TestDatabase;
let app: ReturnType<typeof createApp>;
let orderId: string;

function captureEvent(id: string, type = "PAYMENT.CAPTURE.COMPLETED") {
  return {
    id,
    event_type: type,
    resource: {
      id: "CAPTURE-123",
      supplementary_data: { related_ids: { order_id: orderId } },
    },
  };
}

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: "test-store-token" });
  const policy = loadDemoData().merchant.checkout;
  const cartService = new CartService(database.db, {
    merchantSlug: "mayabazar",
    policy,
    publicBaseUrl: "http://localhost:3000",
    gateway: new FakePaymentGateway(),
  });
  app = createApp({
    config,
    logger: createLogger(config),
    database,
    webhookVerifier: verifier,
    commerce: { cartService, merchantSlug: "mayabazar", policy },
  });
  const cart = await cartService.create(
    {
      items: [{ item_id: "MB-MUG-MONSOON", quantity: 1 }],
      shipping_address: { country_code: "US", postal_code: "78701" },
    },
    { agentClient: "test-agent" },
  );
  const checkedOut = await cartService.checkout(cart.id!, {}, { agentClient: "test-agent" });
  orderId = checkedOut.payment_method!.token!;
});

afterAll(async () => {
  await database.close();
});

const post = (body: object, headers: Record<string, string> = signed) =>
  request(app).post("/webhooks/paypal").set(headers).send(body);

describe("PayPal webhooks", () => {
  it("rejects a delivery without signature headers", async () => {
    const res = await request(app).post("/webhooks/paypal").send(captureEvent("WH-0"));
    expect(res.status).toBe(400);
  });

  it("rejects a delivery whose signature does not verify", async () => {
    const res = await post(captureEvent("WH-1"), { ...signed, "paypal-transmission-sig": "bad" });
    expect(res.status).toBe(401);
    expect(await database.db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("confirms the order on a verified capture event", async () => {
    const res = await post(captureEvent("WH-2"));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processed");
    const [order] = await database.db
      .select()
      .from(orders)
      .where(eq(orders.paypalOrderId, orderId));
    expect(order?.webhookConfirmed).toBe(true);
    expect(order?.status).toBe("COMPLETED");
    expect(order?.captureId).toBe("CAPTURE-123");
  });

  it("treats a redelivered event as a duplicate", async () => {
    const res = await post(captureEvent("WH-2"));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
    expect(await database.db.select().from(webhookEvents)).toHaveLength(1);
  });

  it("records but ignores event types it does not act on", async () => {
    const res = await post({ id: "WH-3", event_type: "CHECKOUT.ORDER.APPROVED", resource: {} });
    expect(res.body.status).toBe("ignored");
  });

  it("marks the order refunded on a refund event", async () => {
    const res = await post(captureEvent("WH-4", "PAYMENT.CAPTURE.REFUNDED"));
    expect(res.body.status).toBe("processed");
    const [order] = await database.db
      .select()
      .from(orders)
      .where(eq(orders.paypalOrderId, orderId));
    expect(order?.status).toBe("REFUNDED");
  });
});

describe("PayPalWebhookVerifier", () => {
  it("sends the exact received body to PayPal and trusts only SUCCESS", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url.endsWith("/v1/oauth2/token")) {
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      return Response.json({ verification_status: "SUCCESS" });
    }) as unknown as typeof fetch;
    const real = new PayPalWebhookVerifier({
      clientId: "client-id-123",
      clientSecret: "client-secret-123",
      webhookId: "WEBHOOK-ID",
      environment: "sandbox",
      fetchImpl,
    });
    const raw = '{"id":"WH-9",  "amount":1.10}';
    const ok = await real.verify(
      {
        authAlgo: "a",
        certUrl: "https://c",
        transmissionId: "t",
        transmissionSig: "s",
        transmissionTime: "2026",
      },
      raw,
    );
    expect(ok).toBe(true);
    const verifyCall = calls.find((c) => c.url.endsWith("verify-webhook-signature"));
    expect(verifyCall?.body).toContain(`"webhook_event":${raw}}`);
    expect(verifyCall?.body).toContain('"webhook_id":"WEBHOOK-ID"');
  });

  it("returns false when PayPal does not say SUCCESS", async () => {
    const fetchImpl = (async (url: string) =>
      url.endsWith("/v1/oauth2/token")
        ? Response.json({ access_token: "tok", expires_in: 3600 })
        : Response.json({ verification_status: "FAILURE" })) as unknown as typeof fetch;
    const real = new PayPalWebhookVerifier({
      clientId: "client-id-123",
      clientSecret: "client-secret-123",
      webhookId: "W",
      environment: "sandbox",
      fetchImpl,
    });
    const ok = await real.verify(
      {
        authAlgo: "a",
        certUrl: "c",
        transmissionId: "t",
        transmissionSig: "s",
        transmissionTime: "x",
      },
      "{}",
    );
    expect(ok).toBe(false);
  });
});
