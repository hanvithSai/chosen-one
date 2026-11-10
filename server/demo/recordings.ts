import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCatalog, getMerchantBySlug } from "../commerce/catalog.js";
import type { Db } from "../db/client.js";
import {
  considerations,
  intents,
  intentSets,
  marketSnapshots,
  panels,
  proposals,
  runs,
  sourceNotes,
} from "../db/schema.js";
import { approveProposals } from "../enrichment/apply.js";
import { DEMO_INTENT_SET } from "./seed.js";

export const DEFAULT_RECORDINGS_FILE = path.resolve(process.cwd(), "data/recordings/demo-run.json");

const RecordedConsiderationSchema = z.object({
  store: z.string(),
  productRef: z.string(),
  verdict: z.enum(["not_found", "viewed", "shortlisted", "rejected", "chosen"]),
  reason: z.string().nullable(),
  reasonCategory: z.string().nullable(),
});

const RecordedRunSchema = z.object({
  position: z.number().int().nonnegative(),
  model: z.string(),
  outcome: z.enum(["bought_ours", "bought_competitor", "no_purchase", "error"]),
  chosenStore: z.string().nullable(),
  chosenProductRef: z.string().nullable(),
  rationale: z.string().nullable(),
  tokens: z.number().int().nonnegative(),
  considerations: z.array(RecordedConsiderationSchema),
});

const RecordedProposalSchema = z.object({
  sku: z.string(),
  field: z.string(),
  value: z.string(),
  quote: z.string(),
  noteTitle: z.string(),
  reasonCategory: z.string().nullable(),
});

export const RecordingFileSchema = z.object({
  recordedAt: z.string(),
  note: z.string(),
  proposals: z.array(RecordedProposalSchema),
  /** Panel measured on the original catalog, before any fix was approved. */
  baseline: z.object({ label: z.string(), runs: z.array(RecordedRunSchema) }),
  /** Panel measured after the proposals above were approved. */
  after: z.object({ label: z.string(), runs: z.array(RecordedRunSchema) }),
});
export type RecordingFile = z.infer<typeof RecordingFileSchema>;

export interface SeedRecordingsResult {
  seeded: boolean;
  panels: number;
}

/**
 * Loads the committed demo recording: the baseline panel, the AI-drafted fixes (approved into
 * catalog v2) and the re-measured panel. Idempotent; it does nothing if recordings exist.
 */
export async function seedRecordings(
  db: Db,
  merchantSlug: string,
  file: string = DEFAULT_RECORDINGS_FILE,
): Promise<SeedRecordingsResult> {
  if (!existsSync(file)) return { seeded: false, panels: 0 };
  const recording = RecordingFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));

  const merchant = await getMerchantBySlug(db, merchantSlug);
  const v1 = await getCatalog(db, merchantSlug, 1);
  const existing = await db
    .select({ id: panels.id })
    .from(panels)
    .where(and(eq(panels.catalogVersionId, v1.version.id), eq(panels.recorded, true)));
  if (existing.length > 0) return { seeded: false, panels: existing.length };

  const [snapshot] = await db
    .select()
    .from(marketSnapshots)
    .where(eq(marketSnapshots.merchantId, merchant.id));
  if (!snapshot) throw new Error("Seed the market snapshot before the recordings.");
  const [intentSet] = await db
    .select()
    .from(intentSets)
    .where(and(eq(intentSets.merchantId, merchant.id), eq(intentSets.name, DEMO_INTENT_SET)));
  if (!intentSet) throw new Error("Seed the demo intents before the recordings.");
  const intentRows = await db.select().from(intents).where(eq(intents.intentSetId, intentSet.id));
  const intentByPosition = new Map(intentRows.map((i) => [i.position, i]));

  const notes = await db.select().from(sourceNotes).where(eq(sourceNotes.merchantId, merchant.id));
  const noteByTitle = new Map(notes.map((n) => [n.title, n.id]));
  const productBySku = new Map(v1.products.map((p) => [p.sku, p]));

  const saveRuns = async (panelId: string, recorded: RecordingFile["baseline"]) => {
    for (const run of recorded.runs) {
      const intent = intentByPosition.get(run.position);
      if (!intent) throw new Error(`Recording references unknown request #${run.position}`);
      const [row] = await db
        .insert(runs)
        .values({
          panelId,
          intentId: intent.id,
          model: run.model,
          outcome: run.outcome,
          chosenStore: run.chosenStore,
          chosenProductRef: run.chosenProductRef,
          rationale: run.rationale,
          tokensIn: run.tokens,
        })
        .returning({ id: runs.id });
      if (run.considerations.length > 0) {
        await db
          .insert(considerations)
          .values(run.considerations.map((c) => ({ ...c, runId: row!.id })));
      }
    }
  };
  const addPanel = async (catalogVersionId: string, recorded: RecordingFile["baseline"]) => {
    const [panel] = await db
      .insert(panels)
      .values({
        catalogVersionId,
        snapshotId: snapshot.id,
        intentSetId: intentSet.id,
        label: recorded.label,
        status: "completed",
        recorded: true,
        tokensIn: recorded.runs.reduce((sum, r) => sum + r.tokens, 0),
        startedAt: new Date(recording.recordedAt),
        finishedAt: new Date(recording.recordedAt),
      })
      .returning({ id: panels.id });
    await saveRuns(panel!.id, recorded);
  };

  await addPanel(v1.version.id, recording.baseline);

  const proposalRows = recording.proposals.flatMap((p) => {
    const product = productBySku.get(p.sku);
    if (!product) return [];
    return [
      {
        productId: product.id,
        field: p.field,
        value: p.value,
        sourceNoteId: noteByTitle.get(p.noteTitle) ?? null,
        quote: p.quote,
        reasonCategory: p.reasonCategory,
        status: "proposed" as const,
      },
    ];
  });
  if (proposalRows.length > 0) await db.insert(proposals).values(proposalRows);
  const applied = await approveProposals(db, merchantSlug);
  const v2 = await getCatalog(db, merchantSlug, applied.version);
  await addPanel(v2.version.id, recording.after);

  return { seeded: true, panels: 2 };
}
