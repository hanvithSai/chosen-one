import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { CartService } from "../../server/commerce/cart.js";
import { loadConfig } from "../../server/config.js";
import { loadDemoData } from "../../server/demo/data.js";
import { createLogger } from "../../server/logger.js";
import type { PaymentGateway } from "../../server/payments/gateway.js";
import { PayPalApiError } from "../../server/payments/paypalErrors.js";
import { PayPalGateway } from "../../server/payments/paypalGateway.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

const TOKEN = "test-store-token";
const auth = { Authorization: `Bearer ${TOKEN}` };

let database: TestDatabase;
let app: ReturnType<typeof createApp>;

/** A gateway whose PayPal calls always fail with a provider error. */
const failingGateway: PaymentGateway = {
  name: "failing",
  createOrder: async () => {
    throw new PayPalApiError(401, "invalid_client", "Client Authentication failed", [], "dbg-123");
  },
  captureOrder: async () => {
    throw new Error("unused");
  },
};

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: TOKEN });
  const policy = loadDemoData().merchant.checkout;
  const cartService = new CartService(database.db, {
    merchantSlug: "mayabazar",
    policy,
    publicBaseUrl: "http://localhost:3000",
    gateway: failingGateway,
  });
  app = createApp({
    config,
    logger: createLogger(config),
    database,
    commerce: { cartService, merchantSlug: "mayabazar", policy },
  });
});

afterAll(async () => {
  await database.close();
});

describe("payment provider failures", () => {
  it("returns a clear 502 with PayPal's error name and debug id from the Cart API", async () => {
    const created = await request(app)
      .post("/merchant-cart")
      .set(auth)
      .send({
        items: [{ item_id: "MB-MUG-MONSOON", quantity: 1 }],
        shipping_address: { country_code: "US", postal_code: "78701" },
      });
    const res = await request(app)
      .post(`/merchant-cart/${created.body.id}/checkout`)
      .set(auth)
      .send({});
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      name: "PAYMENT_PROVIDER_ERROR",
      paypal_error: "invalid_client",
      debug_id: "dbg-123",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
  });

  it("wraps non-PayPal failures (for example a network error) in the same shape", async () => {
    const gateway = new PayPalGateway(
      {
        clientId: "client-id-123",
        clientSecret: "client-secret-123",
        environment: "sandbox",
        brandName: "x",
      },
      {
        createOrder: async () => {
          throw new Error("getaddrinfo ENOTFOUND api-m.sandbox.paypal.com");
        },
      } as never,
    );
    await expect(
      gateway.createOrder({
        requestId: "r",
        cartId: "c",
        merchantName: "m",
        customId: "agent=x;cart=c",
        currency: "USD",
        items: [{ sku: "A", name: "A", unitAmountCents: 100, quantity: 1 }],
        itemTotalCents: 100,
        shippingCents: 0,
        handlingCents: 0,
        totalCents: 100,
        shippingAddress: { countryCode: "US" },
        returnUrl: "http://localhost/r",
        cancelUrl: "http://localhost/c",
      }),
    ).rejects.toMatchObject({ statusCode: 502, errorName: "GATEWAY_ERROR" });
  });
});
