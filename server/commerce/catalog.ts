import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { catalogVersions, merchants, products } from "../db/schema.js";
import type { MarketItem } from "./search.js";

export type Product = typeof products.$inferSelect;
export type Merchant = typeof merchants.$inferSelect;
export type CatalogVersion = typeof catalogVersions.$inferSelect;

export interface Catalog {
  merchant: Merchant;
  version: CatalogVersion;
  products: Product[];
}

export class NotFoundError extends Error {}

export async function getMerchantBySlug(db: Db, slug: string): Promise<Merchant> {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.slug, slug));
  if (!merchant) throw new NotFoundError(`Merchant not found: ${slug}`);
  return merchant;
}

/** Returns the merchant's newest catalog version (or a specific one) with its products. */
export async function getCatalog(db: Db, merchantSlug: string, version?: number): Promise<Catalog> {
  const merchant = await getMerchantBySlug(db, merchantSlug);
  const [catalogVersion] = await db
    .select()
    .from(catalogVersions)
    .where(
      version === undefined
        ? eq(catalogVersions.merchantId, merchant.id)
        : and(eq(catalogVersions.merchantId, merchant.id), eq(catalogVersions.version, version)),
    )
    .orderBy(desc(catalogVersions.version))
    .limit(1);
  if (!catalogVersion) throw new NotFoundError(`No catalog for merchant: ${merchantSlug}`);

  const rows = await db
    .select()
    .from(products)
    .where(eq(products.catalogVersionId, catalogVersion.id))
    .orderBy(products.sku);
  return { merchant, version: catalogVersion, products: rows };
}

export function productRef(merchantSlug: string, sku: string): string {
  return `${merchantSlug}:${sku}`;
}

export function toMarketItems(catalog: Catalog): MarketItem[] {
  return catalog.products.map((p) => ({
    ref: productRef(catalog.merchant.slug, p.sku),
    store: catalog.merchant.name,
    title: p.title,
    description: p.description,
    priceCents: p.priceCents,
    currency: p.currency,
    attributes: p.attributes,
    inStock: p.stock > 0,
  }));
}
