import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { LlmService } from "../ai/llm.js";
import { getCatalog, getMerchantBySlug, type Product } from "../commerce/catalog.js";
import type { Db } from "../db/client.js";
import { catalogVersions, products, proposals, sourceNotes } from "../db/schema.js";

/** Facts a fix may add. Price and stock are deliberately not here: they are never AI-written. */
export const FIX_FIELDS = [
  "dishwasher safe",
  "microwave safe",
  "oven safe",
  "food safe",
  "lead free",
  "materials",
  "size",
  "capacity",
  "drainage hole",
  "saucer included",
  "holds water",
  "handle",
  "durability",
  "ships from",
  "ships within",
  "delivery time",
  "shipping cost",
  "ships to",
  "returns",
  "breakage replacement",
  "gift wrap",
  "bulk and wholesale",
] as const;

const REASON_FOR_FIELD: Record<string, string> = {
  "ships from": "delivery_unknown",
  "ships within": "delivery_unknown",
  "delivery time": "delivery_unknown",
  "ships to": "delivery_unknown",
  "shipping cost": "shipping_cost",
  returns: "returns_unknown",
  "breakage replacement": "returns_unknown",
};

export const ProposalBatchSchema = z.object({
  proposals: z.array(
    z.object({
      skus: z.array(z.string()).min(1).describe("SKUs this fact is true for"),
      field: z.enum(FIX_FIELDS),
      value: z.string().min(1).max(160).describe("The fact, in plain words"),
      quote: z.string().min(8).describe("Exact words copied from one note that support the fact"),
    }),
  ),
});

export const PROPOSE_SYSTEM = `You help a small shop make its product listings clearer for AI shopping agents.
You are given the shop's own notes and its product list. Write facts that are stated in the notes.

Rules:
- Every fact must be supported by words in the notes. Copy those words exactly into "quote" (a short span from one note).
- Never invent facts, numbers, materials or promises. If the notes do not say it, leave it out.
- Never touch price or stock.
- One entry can apply to many products: list every SKU the fact is true for.
- Write "value" as a short plain-language fact, for example "yes", "12 oz, 4 in tall" or "within 2 business days".
- Cover the facts shoppers ask about: care (dishwasher, microwave, oven, food safe, lead free), size and capacity, drainage and saucer, holding water, handle, durability, shipping, delivery time, returns, breakage, gift wrap, and bulk orders.
- Reply with JSON only.`;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function numbersIn(text: string): string[] {
  return normalize(text).match(/\d+(?:\.\d+)?/g) ?? [];
}

export interface RejectedProposal {
  skus: string[];
  field: string;
  value: string;
  why: string;
}

export interface GenerateResult {
  created: number;
  rejected: RejectedProposal[];
  modelId: string;
}

/** Checks a drafted fact against the merchant's own notes. Returns the supporting note id. */
export function verifyAgainstNotes(
  draft: { value: string; quote: string },
  notes: { id: string; body: string }[],
): { ok: true; noteId: string } | { ok: false; why: string } {
  const quote = normalize(draft.quote);
  const note = notes.find((n) => normalize(n.body).includes(quote));
  if (!note) return { ok: false, why: "quote not found in any note" };
  const supported = new Set(numbersIn(quote));
  const unsupported = numbersIn(draft.value).filter((n) => !supported.has(n));
  if (unsupported.length > 0) {
    return { ok: false, why: `value has numbers not in the quote: ${unsupported.join(", ")}` };
  }
  return { ok: true, noteId: note.id };
}

function productLine(p: Product): string {
  return `${p.sku} | ${p.title} | ${p.line} | ${p.description}`;
}

/**
 * Drafts catalog fixes with the stronger model, keeps only those whose quotes are found in
 * the merchant's notes, and stores them as proposals for the merchant to approve.
 */
export async function generateProposals(
  db: Db,
  llm: LlmService,
  merchantSlug: string,
): Promise<GenerateResult> {
  const merchant = await getMerchantBySlug(db, merchantSlug);
  const catalog = await getCatalog(db, merchantSlug);
  const notes = await db.select().from(sourceNotes).where(eq(sourceNotes.merchantId, merchant.id));
  const skus = new Map(catalog.products.map((p) => [p.sku, p]));

  const prompt = [
    "Shop notes:",
    ...notes.map((n) => `## ${n.title}\n${n.body}`),
    "",
    "Products (sku | title | line | current description):",
    ...catalog.products.map(productLine),
  ].join("\n");

  const result = await llm.generateStructured({
    slot: "main",
    system: PROPOSE_SYSTEM,
    prompt,
    schema: ProposalBatchSchema,
    maxOutputTokens: 8000,
    estimatedTokens: 5000,
  });

  const rejected: RejectedProposal[] = [];
  const seen = new Set<string>();
  const rows: (typeof proposals.$inferInsert)[] = [];
  for (const draft of result.data.proposals) {
    const check = verifyAgainstNotes(draft, notes);
    if (!check.ok) {
      rejected.push({ skus: draft.skus, field: draft.field, value: draft.value, why: check.why });
      continue;
    }
    for (const sku of new Set(draft.skus)) {
      const product = skus.get(sku);
      const key = `${sku}|${draft.field}`;
      if (!product || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        productId: product.id,
        field: draft.field,
        value: draft.value,
        sourceNoteId: check.noteId,
        quote: draft.quote,
        reasonCategory: REASON_FOR_FIELD[draft.field] ?? "missing_fact",
        status: "proposed",
      });
    }
  }
  if (rows.length > 0) await db.insert(proposals).values(rows);
  return { created: rows.length, rejected, modelId: result.modelId };
}

export interface ProposalView {
  id: string;
  sku: string;
  productTitle: string;
  field: string;
  value: unknown;
  quote: string | null;
  noteTitle: string | null;
  reasonCategory: string | null;
  status: string;
}

/** All of the merchant's proposals (every catalog version), ready to show the merchant. */
export async function listProposals(
  db: Db,
  merchantSlug: string,
  status?: string,
): Promise<ProposalView[]> {
  const merchant = await getMerchantBySlug(db, merchantSlug);
  const rows = await db
    .select({ proposal: proposals, product: products })
    .from(proposals)
    .innerJoin(products, eq(proposals.productId, products.id))
    .innerJoin(catalogVersions, eq(products.catalogVersionId, catalogVersions.id))
    .where(
      status === undefined
        ? eq(catalogVersions.merchantId, merchant.id)
        : and(eq(catalogVersions.merchantId, merchant.id), eq(proposals.status, status as never)),
    );
  const notes = await db.select().from(sourceNotes).where(eq(sourceNotes.merchantId, merchant.id));
  const noteTitle = new Map(notes.map((n) => [n.id, n.title]));
  return rows
    .map(({ proposal, product }) => ({
      id: proposal.id,
      sku: product.sku,
      productTitle: product.title,
      field: proposal.field,
      value: proposal.value,
      quote: proposal.quote,
      noteTitle: proposal.sourceNoteId ? (noteTitle.get(proposal.sourceNoteId) ?? null) : null,
      reasonCategory: proposal.reasonCategory,
      status: proposal.status,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.field.localeCompare(b.field));
}
