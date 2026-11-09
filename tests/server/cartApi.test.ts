import { payPalCartSchema } from "../../server/commerce/cartSpec.js";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { buildCustomId, CartService } from "../../server/commerce/cart.js";
import { loadConfig } from "../../server/config.js";
import { orders } from "../../server/db/schema.js";
import { loadDemoData } from "../../server/demo/data.js";
import { createLogger } from "../../server/logger.js";
import { FakePaymentGateway } from "../../server/payments/gateway.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

const TOKEN = "test-store-token";
const auth = { Authorization: `Bearer ${TOKEN}`, "X-Agent-Client": "test-agent" };
const address = {
  address_line_1: "500 Congress Ave",
  admin_area_2: "Austin",
  admin_area_1: "TX",
  postal_code: "78701",
  country_code: "US",
};

let database: TestDatabase;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: TOKEN });
  const cartService = new CartService(database.db, {
    merchantSlug: "mayabazar",
    policy: loadDemoData().merchant.checkout,
    publicBaseUrl: "http://localhost:3000",
    gateway: new FakePaymentGateway(),
  });
  app = createApp({ config, logger: createLogger(config), commerce: { cartService } });
});

afterAll(async () => {
  await database.close();
});

const createCart = (body: object) => request(app).post("/merchant-cart").set(auth).send(body);

describe("Cart API v1", () => {
  it("requires the bearer token", async () => {
    const res = await request(app).post("/merchant-cart").send({});
    expect(res.status).toBe(401);
  });

  it("creates a priced, spec-valid cart", async () => {
    const res = await createCart({
      items: [{ item_id: "mayabazar:MB-MUG-MONSOON", quantity: 1 }],
      shipping_address: address,
    });
    expect(res.status).toBe(201);
    expect(payPalCartSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      status: "READY",
      validation_status: "VALID",
      totals: {
        subtotal: { value: "34.00" },
        shipping: { value: "8.00" },
        total: { value: "42.00" },
      },
    });
    expect(res.body.id).toMatch(/^cart_/);
  });

  it("rejects bodies that do not match the spec", async () => {
    const res = await createCart({ items: [{ item_id: "MB-MUG-MONSOON", quantity: "two" }] });
    expect(res.status).toBe(400);
    expect(res.body.name).toBe("INVALID_REQUEST");
  });

  it("supports adding the address later with PUT", async () => {
    const created = await createCart({ items: [{ item_id: "MB-KULHAD-4", quantity: 1 }] });
    expect(created.body.status).toBe("INCOMPLETE");
    const updated = await request(app)
      .put(`/merchant-cart/${created.body.id}`)
      .set(auth)
      .send({ shipping_address: address });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ status: "READY", items: [{ item_id: "MB-KULHAD-4" }] });
  });

  it("refuses checkout until the cart is ready", async () => {
    const created = await createCart({ items: [{ item_id: "MB-MUG-MONSOON", quantity: 1 }] });
    const res = await request(app)
      .post(`/merchant-cart/${created.body.id}/checkout`)
      .set(auth)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.business_context.context.specific_issue).toBe("MISSING_SHIPPING_ADDRESS");
  });

  it("checks out once, captures on return, and attributes the agent", async () => {
    const created = await createCart({
      items: [{ item_id: "MB-MUG-BIGHUG", quantity: 2 }],
      shipping_address: address,
    });
    const cartId = created.body.id as string;

    const first = await request(app).post(`/merchant-cart/${cartId}/checkout`).set(auth).send({});
    expect(first.status).toBe(200);
    expect(first.body.payment_method).toMatchObject({ type: "paypal" });
    const { token, approval_url: approvalUrl } = first.body.payment_method;

    const again = await request(app).post(`/merchant-cart/${cartId}/checkout`).set(auth).send({});
    expect(again.body.payment_method.token).toBe(token);

    const returnPath = new URL(approvalUrl).pathname + new URL(approvalUrl).search;
    const landing = await request(app).get(returnPath);
    expect(landing.status).toBe(200);
    expect(landing.text).toContain("Payment complete");

    const cart = await request(app).get(`/merchant-cart/${cartId}`).set(auth);
    expect(cart.body.status).toBe("COMPLETED");

    const [order] = await database.db.select().from(orders).where(eq(orders.paypalOrderId, token));
    expect(order).toMatchObject({
      status: "COMPLETED",
      amountCents: 7600,
      customId: buildCustomId("test-agent", cartId),
      agentClient: "test-agent",
    });
    expect(order?.captureId).toMatch(/^FAKECAP-/);

    const repeatLanding = await request(app).get(returnPath);
    expect(repeatLanding.status).toBe(200);
  });

  it("completes checkout when PayPal sends back the approved token", async () => {
    const created = await createCart({
      items: [{ item_id: "MB-PLANTER-SMALL", quantity: 1 }],
      shipping_address: address,
    });
    const started = await request(app)
      .post(`/merchant-cart/${created.body.id}/checkout`)
      .set(auth)
      .send({});
    const done = await request(app)
      .post(`/merchant-cart/${created.body.id}/checkout`)
      .set(auth)
      .send({
        payment_method: {
          type: "paypal",
          token: started.body.payment_method.token,
          payer_id: "PAYER1",
        },
      });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("COMPLETED");
  });

  it("returns 404 for unknown carts", async () => {
    const res = await request(app).get("/merchant-cart/cart_missing").set(auth);
    expect(res.status).toBe(404);
    expect(res.body.name).toBe("RESOURCE_NOT_FOUND");
  });
});

describe("buildCustomId", () => {
  it("keeps PayPal's 127-character limit and strips unsafe characters", () => {
    const id = buildCustomId("Some Agent/1.0 (x".repeat(10), "cart_abc");
    expect(id.length).toBeLessThanOrEqual(127);
    expect(id).toMatch(/^agent=[A-Za-z0-9._-]+;cart=cart_abc$/);
  });
});
