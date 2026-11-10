import { and, asc, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import type { LlmService, LlmSlot } from "../ai/llm.js";
import { getCatalog, getMerchantBySlug, toMarketItems } from "../commerce/catalog.js";
import { MarketIndex, type MarketItem } from "../commerce/search.js";
import type { Db } from "../db/client.js";
import {
  considerations,
  intents,
  intentSets,
  marketSnapshots,
  panels,
  runs,
  type RunOutcome,
} from "../db/schema.js";
import { DEMO_INTENT_SET } from "../demo/seed.js";
import { loadCompetitorItems } from "../market/snapshot.js";
import { runShopper, type ShopperRun } from "./shopper.js";

export interface PanelRunOptions {
  merchantSlug: string;
  /** Shown in reports, e.g. "Baseline" or "After approved fixes". */
  label: string;
  intentSetName?: string;
  /** Catalog version to shop; defaults to the newest. */
  catalogVersion?: number;
  /** Marks the panel as a committed demo recording. */
  recorded?: boolean;
  onProgress?: (done: number, total: number) => void;
}

function isOurs(ref: string, merchantSlug: string): boolean {
  return ref.startsWith(`${merchantSlug}:`);
}

function outcomeFor(run: ShopperRun, merchantSlug: string): RunOutcome {
  const ref = run.decision.chosen_ref;
  if (!ref) return "no_purchase";
  if (!run.candidates.some((c) => c.ref === ref)) return "no_purchase"; // invented ref
  return isOurs(ref, merchantSlug) ? "bought_ours" : "bought_competitor";
}

/** Runs the AI shopper panel over a merchant's intent set and stores every decision. */
export class PanelService {
  constructor(
    private readonly db: Db,
    private readonly llm: LlmService,
    private readonly logger?: Logger,
  ) {}

  /** Creates the panel row up front so callers can poll it while it runs. */
  async start(options: PanelRunOptions): Promise<{ panelId: string; run: () => Promise<void> }> {
    const { merchantSlug } = options;
    const merchant = await getMerchantBySlug(this.db, merchantSlug);
    const catalog = await getCatalog(this.db, merchantSlug, options.catalogVersion);
    const [snapshot] = await this.db
      .select()
      .from(marketSnapshots)
      .where(eq(marketSnapshots.merchantId, merchant.id))
      .orderBy(desc(marketSnapshots.createdAt))
      .limit(1);
    if (!snapshot) throw new Error("No competitor market snapshot. Run `npm run market:snapshot`.");
    const [intentSet] = await this.db
      .select()
      .from(intentSets)
      .where(
        and(
          eq(intentSets.merchantId, merchant.id),
          eq(intentSets.name, options.intentSetName ?? DEMO_INTENT_SET),
        ),
      );
    if (!intentSet) throw new Error("Intent set not found for this merchant.");

    const [panel] = await this.db
      .insert(panels)
      .values({
        catalogVersionId: catalog.version.id,
        snapshotId: snapshot.id,
        intentSetId: intentSet.id,
        label: options.label,
        status: "queued",
        recorded: options.recorded ?? false,
      })
      .returning({ id: panels.id });
    const panelId = panel!.id;

    const market: MarketItem[] = [
      ...toMarketItems(catalog),
      ...(await loadCompetitorItems(this.db, merchantSlug)),
    ];
    const index = new MarketIndex(market);
    const intentRows = await this.db
      .select()
      .from(intents)
      .where(eq(intents.intentSetId, intentSet.id))
      .orderBy(asc(intents.position));

    const run = async () => {
      await this.db
        .update(panels)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(panels.id, panelId));
      let tokens = 0;
      let failures = 0;
      for (const [i, intent] of intentRows.entries()) {
        try {
          const result = await runShopper(
            this.llm,
            index,
            { text: intent.text, persona: intent.persona, constraints: intent.constraints },
            intent.assignedModel as LlmSlot,
          );
          tokens += result.llm.tokens;
          await this.saveRun(panelId, intent.id, merchantSlug, result);
        } catch (err) {
          failures += 1;
          const message = err instanceof Error ? err.message : String(err);
          this.logger?.error(
            { panelId, intent: intent.position, err: message },
            "Shopper run failed",
          );
          await this.db.insert(runs).values({
            panelId,
            intentId: intent.id,
            model: intent.assignedModel,
            outcome: "error",
            rationale: message.slice(0, 300),
          });
        }
        options.onProgress?.(i + 1, intentRows.length);
      }
      const allFailed = intentRows.length > 0 && failures === intentRows.length;
      await this.db
        .update(panels)
        .set({
          status: allFailed ? "failed" : "completed",
          tokensIn: tokens,
          error: allFailed ? "Every shopper run failed" : null,
          finishedAt: new Date(),
        })
        .where(eq(panels.id, panelId));
    };

    return { panelId, run };
  }

  /** Convenience: create and run to completion. */
  async runToCompletion(options: PanelRunOptions): Promise<string> {
    const { panelId, run } = await this.start(options);
    await run();
    return panelId;
  }

  private async saveRun(
    panelId: string,
    intentId: string,
    merchantSlug: string,
    result: ShopperRun,
  ): Promise<void> {
    const outcome = outcomeFor(result, merchantSlug);
    const chosen =
      outcome === "no_purchase"
        ? undefined
        : result.candidates.find((c) => c.ref === result.decision.chosen_ref);
    const [run] = await this.db
      .insert(runs)
      .values({
        panelId,
        intentId,
        model: result.llm.modelId,
        outcome,
        chosenStore: chosen?.store ?? null,
        chosenProductRef: chosen?.ref ?? null,
        rationale: result.decision.rationale,
        transcript: [
          { role: "user", content: result.prompt },
          { role: "assistant", content: result.decision },
        ],
        tokensIn: result.llm.tokens,
      })
      .returning({ id: runs.id });

    const byRef = new Map(result.candidates.map((c) => [c.ref, c]));
    const rows = result.decision.considerations
      .filter((c) => byRef.has(c.ref))
      .map((c) => ({
        runId: run!.id,
        store: byRef.get(c.ref)!.store,
        productRef: c.ref,
        verdict: c.verdict,
        reason: c.reason,
        reasonCategory: c.reason_category,
      }));
    // Ours that never reached the shopper is a finding too: it could not be found.
    const shown = new Set(result.candidates.map((c) => c.ref));
    const ourShown = [...shown].some((ref) => isOurs(ref, merchantSlug));
    if (rows.length > 0) await this.db.insert(considerations).values(rows);
    if (!ourShown) {
      await this.db.insert(considerations).values({
        runId: run!.id,
        store: merchantSlug,
        productRef: `${merchantSlug}:none`,
        verdict: "not_found",
        reason: "None of the store's listings appeared for this request.",
        reasonCategory: "not_found",
      });
    }
  }
}
