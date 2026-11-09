import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  catalogVersions,
  intentSets,
  intents,
  merchants,
  products,
  sourceNotes,
} from "../db/schema.js";
import type { DemoData } from "./data.js";

/** Panel model slots; each intent is pinned to one so before/after panels stay comparable. */
export const PANEL_MODEL_SLOTS = ["gemini", "groq"] as const;
export type PanelModelSlot = (typeof PANEL_MODEL_SLOTS)[number];

export const DEMO_INTENT_SET = "demo-v1";

export function assignModelSlot(position: number): PanelModelSlot {
  return PANEL_MODEL_SLOTS[position % PANEL_MODEL_SLOTS.length]!;
}

export interface SeedSummary {
  merchantId: string;
  catalogVersionId: string;
  intentSetId: string;
  created: { merchant: boolean; catalog: boolean; notes: boolean; intents: boolean };
}

/**
 * Seeds the demo merchant, its first catalog version, source notes and intent set.
 * Idempotent: existing rows are reused and never duplicated.
 */
export async function seedDemo(db: Db, data: DemoData): Promise<SeedSummary> {
  return db.transaction(async (tx) => {
    const created = { merchant: false, catalog: false, notes: false, intents: false };

    let [merchant] = await tx
      .select()
      .from(merchants)
      .where(eq(merchants.slug, data.merchant.slug));
    if (!merchant) {
      [merchant] = await tx
        .insert(merchants)
        .values({
          slug: data.merchant.slug,
          name: data.merchant.name,
          tagline: data.merchant.tagline,
        })
        .returning();
      created.merchant = true;
    }
    const merchantId = merchant!.id;

    let [version] = await tx
      .select()
      .from(catalogVersions)
      .where(and(eq(catalogVersions.merchantId, merchantId), eq(catalogVersions.version, 1)));
    if (!version) {
      [version] = await tx
        .insert(catalogVersions)
        .values({ merchantId, version: 1, note: "Original listings" })
        .returning();
      await tx.insert(products).values(
        data.products.map((p) => ({
          catalogVersionId: version!.id,
          sku: p.sku,
          line: p.line,
          title: p.title,
          description: p.description,
          priceCents: p.priceCents,
          stock: p.stock,
        })),
      );
      created.catalog = true;
    }

    const existingNotes = await tx
      .select({ id: sourceNotes.id })
      .from(sourceNotes)
      .where(eq(sourceNotes.merchantId, merchantId))
      .limit(1);
    if (existingNotes.length === 0) {
      await tx
        .insert(sourceNotes)
        .values(data.sourceNotes.map((n) => ({ merchantId, title: n.title, body: n.body })));
      created.notes = true;
    }

    let [intentSet] = await tx
      .select()
      .from(intentSets)
      .where(and(eq(intentSets.merchantId, merchantId), eq(intentSets.name, DEMO_INTENT_SET)));
    if (!intentSet) {
      [intentSet] = await tx
        .insert(intentSets)
        .values({ merchantId, name: DEMO_INTENT_SET })
        .returning();
      await tx.insert(intents).values(
        data.intents.map((intent, position) => ({
          intentSetId: intentSet!.id,
          position,
          text: intent.text,
          persona: intent.persona,
          constraints: intent.constraints,
          assignedModel: assignModelSlot(position),
        })),
      );
      created.intents = true;
    }

    return {
      merchantId,
      catalogVersionId: version!.id,
      intentSetId: intentSet!.id,
      created,
    };
  });
}
