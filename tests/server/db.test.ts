import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import type { DbHandle } from "../../server/db/client.js";
import { catalogVersions, merchants, products } from "../../server/db/schema.js";
import { createLogger } from "../../server/logger.js";
import { createTestDatabase } from "../helpers/db.js";

let database: DbHandle;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();
});

describe("database", () => {
  it("applies migrations and stores a versioned catalog", async () => {
    const { db } = database;
    const [merchant] = await db
      .insert(merchants)
      .values({ slug: "test-shop", name: "Test Shop" })
      .returning();
    expect(merchant).toBeDefined();

    const [version] = await db
      .insert(catalogVersions)
      .values({ merchantId: merchant!.id, version: 1 })
      .returning();

    await db.insert(products).values({
      catalogVersionId: version!.id,
      sku: "MUG-001",
      line: "stoneware",
      title: "Test mug",
      description: "A mug.",
      priceCents: 2800,
      stock: 5,
    });

    const rows = await db.select().from(products).where(eq(products.catalogVersionId, version!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: "MUG-001", currency: "USD", attributes: {} });
  });

  it("rejects duplicate SKUs within one catalog version", async () => {
    const { db } = database;
    const [merchant] = await db
      .insert(merchants)
      .values({ slug: "dup-shop", name: "Dup Shop" })
      .returning();
    const [version] = await db
      .insert(catalogVersions)
      .values({ merchantId: merchant!.id, version: 1 })
      .returning();
    const product = {
      catalogVersionId: version!.id,
      sku: "DUP-1",
      line: "raku" as const,
      title: "Vase",
      description: "A vase.",
      priceCents: 9000,
      stock: 1,
    };
    await db.insert(products).values(product);
    await expect(db.insert(products).values(product)).rejects.toThrow();
  });

  it("reports database health through /healthz", async () => {
    const config = loadConfig({ NODE_ENV: "test" });
    const app = createApp({ config, logger: createLogger(config), database });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.db).toEqual({ driver: "pglite", ok: true });
  });
});
