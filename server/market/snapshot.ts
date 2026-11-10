import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { competitorProducts, marketSnapshots } from "../db/schema.js";
import { getMerchantBySlug } from "../commerce/catalog.js";
import type { MarketItem } from "../commerce/search.js";
import type { Channel3Client, Channel3Product } from "./channel3.js";

/** Searches that stand in for what the demo shop's shoppers ask for. */
export const MARKET_QUERIES = [
  "handmade stoneware coffee mug",
  "handmade ceramic tea cup and saucer set",
  "clay chai cups kulhad set",
  "large terracotta planter with drainage hole and saucer",
  "handmade ceramic soup bowls microwave safe",
  "raku fired ceramic vase",
  "lead-free ceramic dinner plates set",
  "ceramic pet water bowl heavy",
  "handmade ceramic serving platter oven safe",
  "ceramic tea light holders",
] as const;

const SnapshotProductSchema = z.object({
  storeLabel: z.string(),
  externalId: z.string(),
  title: z.string(),
  description: z.string(),
  priceCents: z.number().int().positive(),
  currency: z.string(),
  attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

export const SnapshotFileSchema = z.object({
  capturedAt: z.string(),
  source: z.string(),
  queries: z.array(z.string()),
  products: z.array(SnapshotProductSchema),
});

export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;
export type SnapshotProduct = z.infer<typeof SnapshotProductSchema>;

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GENERIC_WORDS = new Set([
  "the",
  "and",
  "handmade",
  "ceramic",
  "ceramics",
  "pottery",
  "studio",
  "home",
  "shop",
  "store",
  "design",
  "designs",
  "co",
  "company",
  "goods",
  "house",
  "stoneware",
  "clay",
]);
const MAX_COMPETITORS = 12;
const MAX_PER_COMPETITOR = 8;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Names that identify a seller: its full name plus a distinctive first word. */
function identityTerms(seller: string): string[] {
  const terms = [seller];
  const first = seller.split(/[\s&.,-]+/)[0] ?? "";
  if (first.length >= 4 && !GENERIC_WORDS.has(first.toLowerCase())) terms.push(first);
  return terms.filter((t) => t.length >= 3);
}

/** Replaces a seller's identifying names wherever they appear, so competitors stay anonymous. */
function scrub(text: string, terms: string[]): string {
  let out = text;
  for (const term of terms) out = out.replace(new RegExp(escapeRegExp(term), "gi"), "the maker");
  return out;
}

/**
 * Turns raw products into anonymised snapshot products: the sellers with the most products
 * become "Competitor A" to "Competitor L", their names are removed from the text, and repeat
 * listings of the same product are dropped.
 */
export function anonymize(products: Channel3Product[]): SnapshotProduct[] {
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.seller, (counts.get(p.seller) ?? 0) + 1);
  const order = [...counts.keys()];
  const chosen = [...order]
    .sort((a, b) => counts.get(b)! - counts.get(a)! || order.indexOf(a) - order.indexOf(b))
    .slice(0, MAX_COMPETITORS);
  const labels = new Map(chosen.map((seller, i) => [seller, `Competitor ${LABELS[i]}`]));
  const terms = new Map(order.map((seller) => [seller, identityTerms(seller)]));
  const allTerms = [...new Set(order.flatMap((seller) => terms.get(seller)!))];

  const seen = new Set<string>();
  const perSeller = new Map<string, number>();
  const out: SnapshotProduct[] = [];
  for (const product of products) {
    const label = labels.get(product.seller);
    if (!label) continue;
    const key = `${product.seller}|${product.title.toLowerCase()}`;
    if (seen.has(product.id) || seen.has(key)) continue;
    if ((perSeller.get(product.seller) ?? 0) >= MAX_PER_COMPETITOR) continue;
    seen.add(product.id);
    seen.add(key);
    perSeller.set(product.seller, (perSeller.get(product.seller) ?? 0) + 1);

    const attributes: SnapshotProduct["attributes"] = {};
    if (product.category) attributes.category = product.category;
    if (product.materials.length > 0) attributes.materials = product.materials;
    if (product.keyFeatures.length > 0) {
      attributes.features = product.keyFeatures.map((f) => scrub(f, allTerms));
    }
    for (const [name, values] of Object.entries(product.attributes)) attributes[name] = values;
    out.push({
      storeLabel: label,
      externalId: product.id,
      title: scrub(product.title, allTerms),
      description: scrub(product.description, allTerms),
      priceCents: product.priceCents,
      currency: product.currency,
      attributes,
    });
  }
  return out.sort((a, b) => a.storeLabel.localeCompare(b.storeLabel));
}

/** Runs the market searches and returns an anonymised snapshot ready to save. */
export async function fetchSnapshot(
  client: Channel3Client,
  queries: readonly string[] = MARKET_QUERIES,
  perQuery = 10,
): Promise<SnapshotFile> {
  const found: Channel3Product[] = [];
  for (const query of queries) found.push(...(await client.search(query, perQuery)));
  return {
    capturedAt: new Date().toISOString(),
    source: "Channel3 product search API",
    queries: [...queries],
    products: anonymize(found),
  };
}

/** Saves a snapshot for the merchant once; an identical query set is not saved twice. */
export async function saveSnapshot(
  db: Db,
  merchantSlug: string,
  file: SnapshotFile,
): Promise<{ id: string; created: boolean }> {
  const merchant = await getMerchantBySlug(db, merchantSlug);
  const existing = await db
    .select()
    .from(marketSnapshots)
    .where(eq(marketSnapshots.merchantId, merchant.id));
  const same = existing.find((s) => JSON.stringify(s.querySet) === JSON.stringify(file.queries));
  if (same) return { id: same.id, created: false };

  return db.transaction(async (tx) => {
    const [snapshot] = await tx
      .insert(marketSnapshots)
      .values({ merchantId: merchant.id, querySet: file.queries })
      .returning({ id: marketSnapshots.id });
    if (file.products.length > 0) {
      await tx.insert(competitorProducts).values(
        file.products.map((p) => ({
          snapshotId: snapshot!.id,
          storeLabel: p.storeLabel,
          externalId: p.externalId,
          data: p as unknown as Record<string, unknown>,
        })),
      );
    }
    return { id: snapshot!.id, created: true };
  });
}

/** Competitor products from the merchant's newest snapshot, as searchable market items. */
export async function loadCompetitorItems(db: Db, merchantSlug: string): Promise<MarketItem[]> {
  const merchant = await getMerchantBySlug(db, merchantSlug);
  const [snapshot] = await db
    .select()
    .from(marketSnapshots)
    .where(eq(marketSnapshots.merchantId, merchant.id))
    .orderBy(desc(marketSnapshots.createdAt))
    .limit(1);
  if (!snapshot) return [];
  const rows = await db
    .select()
    .from(competitorProducts)
    .where(eq(competitorProducts.snapshotId, snapshot.id));
  return rows.map((row) => {
    const p = SnapshotProductSchema.parse(row.data);
    return {
      ref: `${p.storeLabel.toLowerCase().replace(/\s+/g, "-")}:${p.externalId}`,
      store: p.storeLabel,
      title: p.title,
      description: p.description,
      priceCents: p.priceCents,
      currency: p.currency,
      attributes: p.attributes,
      inStock: true,
    };
  });
}
