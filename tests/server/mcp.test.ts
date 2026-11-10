import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { CartService } from "../../server/commerce/cart.js";
import { loadConfig } from "../../server/config.js";
import { toolCalls } from "../../server/db/schema.js";
import { loadDemoData } from "../../server/demo/data.js";
import { createLogger } from "../../server/logger.js";
import { FakePaymentGateway } from "../../server/payments/gateway.js";
import { createTestDatabase, type TestDatabase } from "../helpers/db.js";

const TOKEN = "test-store-token";
let database: TestDatabase;
let httpServer: Server;
let baseUrl: string;

beforeAll(async () => {
  database = await createTestDatabase({ seed: true });
  const config = loadConfig({ NODE_ENV: "test", STORE_API_TOKEN: TOKEN });
  const policy = loadDemoData().merchant.checkout;
  const cartService = new CartService(database.db, {
    merchantSlug: "mayabazar",
    policy,
    publicBaseUrl: "http://localhost:3000",
    gateway: new FakePaymentGateway(),
  });
  const app = createApp({
    config,
    logger: createLogger(config),
    database,
    commerce: { cartService, merchantSlug: "mayabazar", policy },
  });
  httpServer = app.listen(0);
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  httpServer.close();
  await database.close();
});

async function connect(token = TOKEN): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}`, "X-Agent-Client": "test-agent" } },
  });
  await client.connect(transport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { isError: Boolean(result.isError), data: JSON.parse(content[0]!.text) };
}

describe("MCP server", () => {
  it("rejects calls without the store token", async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: "POST" });
    expect(res.status).toBe(401);
    await expect(connect("wrong")).rejects.toThrow();
  });

  it("lists the six store tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "checkout_cart",
      "create_cart",
      "get_order_status",
      "get_product",
      "get_store_policies",
      "search_products",
    ]);
    await client.close();
  });

  it("searches, prices a cart, starts checkout and reports status", async () => {
    const client = await connect();

    const search = await call(client, "search_products", { query: "stoneware mug", limit: 3 });
    expect(search.isError).toBe(false);
    expect(search.data.results.length).toBeGreaterThan(0);
    const sku = search.data.results[0].sku as string;

    const product = await call(client, "get_product", { sku });
    expect(product.data.sku).toBe(sku);

    const policies = await call(client, "get_store_policies");
    expect(policies.data.ships_to).toContain("US");

    const cart = await call(client, "create_cart", {
      items: [{ item_id: sku, quantity: 1 }],
      shipping_address: { country_code: "US", postal_code: "78701" },
    });
    expect(cart.isError).toBe(false);
    const cartId = cart.data.id as string;

    const checkout = await call(client, "checkout_cart", { cart_id: cartId });
    expect(checkout.data.approval_url).toMatch(/^https?:\/\//);

    const status = await call(client, "get_order_status", { cart_id: cartId });
    expect(status.data.order.status).toBe("CREATED");
    await client.close();
  });

  it("returns a tool error for an unknown product", async () => {
    const client = await connect();
    const result = await call(client, "get_product", { sku: "MB-DOES-NOT-EXIST" });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it("returns a tool error when the cart cannot ship to the country", async () => {
    const client = await connect();
    const result = await call(client, "create_cart", {
      items: [{ item_id: "MB-MUG-MONSOON", quantity: 1 }],
      shipping_address: { country_code: "DE", postal_code: "10115" },
    });
    expect(result.data.status === "INCOMPLETE" || result.isError).toBe(true);
    await client.close();
  });

  it("logs every call with the calling agent", async () => {
    const rows = await database.db.select().from(toolCalls);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.every((r) => r.channel === "mcp")).toBe(true);
    expect(rows.some((r) => r.agentClient === "test-agent" && r.tool === "create_cart")).toBe(true);
  });
});
