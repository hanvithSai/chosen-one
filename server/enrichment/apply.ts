import { and, eq, inArray } from "drizzle-orm";
import { getCatalog } from "../commerce/catalog.js";
import type { Db } from "../db/client.js";
import { catalogVersions, products, proposals } from "../db/schema.js";

export interface ApplyResult {
  version: number;
  approved: number;
  /** Products whose listing changed in the new version. */
  productsChanged: number;
}

/** Attribute keys are stored with underscores so they read the same everywhere. */
export function attributeKey(field: string): string {
  return field.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Approves proposals and publishes them as a new catalog version. Nothing else about the
 * products changes: title, description, price and stock are copied exactly.
 * Without `ids`, every pending proposal for the current catalog is approved.
 */
export async function approveProposals(
  db: Db,
  merchantSlug: string,
  ids?: string[],
): Promise<ApplyResult> {
  const catalog = await getCatalog(db, merchantSlug);
  const productIds = catalog.products.map((p) => p.id);

  return db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(proposals)
      .where(and(inArray(proposals.productId, productIds), eq(proposals.status, "proposed")));
    const chosen = ids ? pending.filter((p) => ids.includes(p.id)) : pending;
    if (chosen.length === 0) {
      return { version: catalog.version.version, approved: 0, productsChanged: 0 };
    }

    const byProduct = new Map<string, Record<string, unknown>>();
    for (const row of chosen) {
      const facts = byProduct.get(row.productId) ?? {};
      facts[attributeKey(row.field)] = row.value;
      byProduct.set(row.productId, facts);
    }

    const [version] = await tx
      .insert(catalogVersions)
      .values({
        merchantId: catalog.merchant.id,
        version: catalog.version.version + 1,
        note: `Approved ${chosen.length} fixes`,
      })
      .returning();
    await tx.insert(products).values(
      catalog.products.map((p) => ({
        catalogVersionId: version!.id,
        sku: p.sku,
        line: p.line,
        title: p.title,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        stock: p.stock,
        attributes: { ...p.attributes, ...(byProduct.get(p.id) ?? {}) },
        imageUrl: p.imageUrl,
      })),
    );
    await tx
      .update(proposals)
      .set({ status: "approved", decidedAt: new Date() })
      .where(
        inArray(
          proposals.id,
          chosen.map((c) => c.id),
        ),
      );
    return {
      version: version!.version,
      approved: chosen.length,
      productsChanged: byProduct.size,
    };
  });
}

export async function rejectProposals(db: Db, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await db
    .update(proposals)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(inArray(proposals.id, ids), eq(proposals.status, "proposed")))
    .returning({ id: proposals.id });
  return updated.length;
}
