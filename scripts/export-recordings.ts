/**
 * Exports a real baseline run, its approved fixes and the re-measured run as the committed
 * demo recording. Run against the database that holds the run:
 *   npm run recordings:export -- <baselinePanelId> <afterPanelId>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { asc, eq, inArray } from "drizzle-orm";
import { loadConfig, loadDotEnvFile } from "../server/config.js";
import { getCatalog } from "../server/commerce/catalog.js";
import { openDatabase, type Db } from "../server/db/client.js";
import {
  considerations,
  intents,
  panels,
  proposals,
  runs,
  sourceNotes,
} from "../server/db/schema.js";
import type { RecordingFile } from "../server/demo/recordings.js";

loadDotEnvFile();
const config = loadConfig();
const [baselineId, afterId] = process.argv.slice(2);
if (!baselineId || !afterId) throw new Error("Pass the baseline and after panel ids.");

const database = await openDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});

async function exportPanel(db: Db, panelId: string): Promise<RecordingFile["baseline"]> {
  const [panel] = await db.select().from(panels).where(eq(panels.id, panelId));
  if (!panel) throw new Error(`Panel not found: ${panelId}`);
  const rows = await db
    .select({ run: runs, intent: intents })
    .from(runs)
    .innerJoin(intents, eq(runs.intentId, intents.id))
    .where(eq(runs.panelId, panelId))
    .orderBy(asc(intents.position));
  const ids = rows.map((r) => r.run.id);
  const cons = ids.length
    ? await db.select().from(considerations).where(inArray(considerations.runId, ids))
    : [];
  return {
    label: panel.label,
    runs: rows.map(({ run, intent }) => ({
      position: intent.position,
      model: run.model,
      outcome: run.outcome,
      chosenStore: run.chosenStore,
      chosenProductRef: run.chosenProductRef,
      rationale: run.rationale,
      tokens: run.tokensIn,
      considerations: cons
        .filter((c) => c.runId === run.id)
        .map((c) => ({
          store: c.store,
          productRef: c.productRef,
          verdict: c.verdict,
          reason: c.reason,
          reasonCategory: c.reasonCategory,
        })),
    })),
  };
}

const v1 = await getCatalog(database.db, config.MERCHANT_SLUG, 1);
const skuById = new Map(v1.products.map((p) => [p.id, p.sku]));
const notes = await database.db.select().from(sourceNotes);
const noteTitle = new Map(notes.map((n) => [n.id, n.title]));
const proposalRows = await database.db
  .select()
  .from(proposals)
  .where(inArray(proposals.productId, [...skuById.keys()]));

const recording: RecordingFile = {
  recordedAt: new Date().toISOString(),
  note: "Real runs of AI shopper agents (Gemini and Groq free tiers) against the demo store and an anonymised competitor snapshot.",
  proposals: proposalRows
    .filter((p) => p.status === "approved" && p.quote && p.sourceNoteId)
    .map((p) => ({
      sku: skuById.get(p.productId)!,
      field: p.field,
      value: String(p.value),
      quote: p.quote!,
      noteTitle: noteTitle.get(p.sourceNoteId!)!,
      reasonCategory: p.reasonCategory,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.field.localeCompare(b.field)),
  baseline: await exportPanel(database.db, baselineId),
  after: await exportPanel(database.db, afterId),
};

const target = path.resolve("data/recordings/demo-run.json");
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(recording, null, 2)}\n`);
console.log(
  `Exported ${recording.proposals.length} fixes and ${recording.baseline.runs.length + recording.after.runs.length} runs to ${path.relative(process.cwd(), target)}`,
);
await database.close();
