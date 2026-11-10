import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { considerations, intents, panels, runs } from "../db/schema.js";

export interface LostReason {
  category: string;
  count: number;
  examples: string[];
}

export interface IntentResult {
  position: number;
  text: string;
  model: string;
  outcome: string;
  chosenStore: string | null;
  rationale: string | null;
}

export interface PanelSummary {
  panelId: string;
  label: string;
  status: string;
  recorded: boolean;
  /** Share of completed runs where the agent chose this store, 0 to 1. */
  pickRate: number;
  totalRuns: number;
  boughtOurs: number;
  boughtCompetitor: number;
  noPurchase: number;
  errors: number;
  /** Which competitors won the sales this store lost. */
  lostTo: { store: string; count: number }[];
  /** Why this store's listings were rejected, most common first. */
  lostReasons: LostReason[];
  results: IntentResult[];
}

const MAX_EXAMPLES = 3;

/** Turns a stored panel into the numbers and reasons the dashboard shows. */
export async function summarizePanel(
  db: Db,
  panelId: string,
  merchantSlug: string,
): Promise<PanelSummary | undefined> {
  const [panel] = await db.select().from(panels).where(eq(panels.id, panelId));
  if (!panel) return undefined;

  const runRows = await db
    .select({ run: runs, intent: intents })
    .from(runs)
    .innerJoin(intents, eq(runs.intentId, intents.id))
    .where(eq(runs.panelId, panelId))
    .orderBy(asc(intents.position));

  const completed = runRows.filter((r) => r.run.outcome !== "error");
  const count = (outcome: string) => runRows.filter((r) => r.run.outcome === outcome).length;
  const boughtOurs = count("bought_ours");

  const lostToCounts = new Map<string, number>();
  for (const { run } of runRows) {
    if (run.outcome === "bought_competitor" && run.chosenStore) {
      lostToCounts.set(run.chosenStore, (lostToCounts.get(run.chosenStore) ?? 0) + 1);
    }
  }

  // Reasons count only the runs this store did not win.
  const lostRunIds = runRows
    .filter((r) => r.run.outcome === "bought_competitor" || r.run.outcome === "no_purchase")
    .map((r) => r.run.id);
  const reasonRows =
    lostRunIds.length === 0
      ? []
      : await db.select().from(considerations).where(inArray(considerations.runId, lostRunIds));
  const reasons = new Map<string, LostReason>();
  for (const row of reasonRows) {
    const ours = row.productRef.startsWith(`${merchantSlug}:`);
    if (!ours || row.verdict === "chosen" || !row.reasonCategory) continue;
    const entry = reasons.get(row.reasonCategory) ?? {
      category: row.reasonCategory,
      count: 0,
      examples: [],
    };
    entry.count += 1;
    if (
      row.reason &&
      entry.examples.length < MAX_EXAMPLES &&
      !entry.examples.includes(row.reason)
    ) {
      entry.examples.push(row.reason);
    }
    reasons.set(row.reasonCategory, entry);
  }

  return {
    panelId,
    label: panel.label,
    status: panel.status,
    recorded: panel.recorded,
    pickRate: completed.length === 0 ? 0 : boughtOurs / completed.length,
    totalRuns: runRows.length,
    boughtOurs,
    boughtCompetitor: count("bought_competitor"),
    noPurchase: count("no_purchase"),
    errors: count("error"),
    lostTo: [...lostToCounts.entries()]
      .map(([store, n]) => ({ store, count: n }))
      .sort((a, b) => b.count - a.count || a.store.localeCompare(b.store)),
    lostReasons: [...reasons.values()].sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category),
    ),
    results: runRows.map(({ run, intent }) => ({
      position: intent.position,
      text: intent.text,
      model: run.model,
      outcome: run.outcome,
      chosenStore: run.chosenStore,
      rationale: run.rationale,
    })),
  };
}

export interface PanelComparison {
  before: { panelId: string; label: string; pickRate: number };
  after: { panelId: string; label: string; pickRate: number };
  /** Change in PickRate, in percentage points. */
  deltaPoints: number;
  /** Requests the store lost before and won after, with the shopper's new reason. */
  gained: { position: number; text: string; reason: string | null }[];
  /** Requests the store won before and lost after. */
  lost: { position: number; text: string }[];
}

/** Compares two panels over the same requests, to show what the approved fixes changed. */
export function comparePanels(before: PanelSummary, after: PanelSummary): PanelComparison {
  const won = (r: IntentResult) => r.outcome === "bought_ours";
  const beforeByPos = new Map(before.results.map((r) => [r.position, r]));
  const gained: PanelComparison["gained"] = [];
  const lost: PanelComparison["lost"] = [];
  for (const r of after.results) {
    const earlier = beforeByPos.get(r.position);
    if (!earlier) continue;
    if (won(r) && !won(earlier)) {
      gained.push({ position: r.position, text: r.text, reason: r.rationale });
    } else if (!won(r) && won(earlier)) {
      lost.push({ position: r.position, text: r.text });
    }
  }
  return {
    before: { panelId: before.panelId, label: before.label, pickRate: before.pickRate },
    after: { panelId: after.panelId, label: after.label, pickRate: after.pickRate },
    deltaPoints: Math.round((after.pickRate - before.pickRate) * 1000) / 10,
    gained,
    lost,
  };
}
