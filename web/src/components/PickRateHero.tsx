import type { PanelComparison, PanelSummary } from "../api";
import { percent } from "./ui";

export function PickRateHero({
  baseline,
  after,
  comparison,
}: {
  baseline?: PanelSummary;
  after?: PanelSummary;
  comparison?: PanelComparison;
}) {
  if (!baseline) {
    return (
      <div className="rounded-2xl bg-white p-8 text-clay-700 shadow-sm">
        No shopper panel has been run yet.
      </div>
    );
  }
  return (
    <div className="grid gap-6 rounded-2xl bg-ink p-8 text-white shadow-md md:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="text-sm uppercase tracking-widest text-clay-100/70">PickRate</p>
        <div className="mt-2 flex items-end gap-4">
          <span className="text-6xl font-semibold tabular-nums">{percent(baseline.pickRate)}</span>
          {after && (
            <>
              <span aria-hidden className="pb-3 text-3xl text-clay-100/60">
                →
              </span>
              <span className="text-6xl font-semibold tabular-nums text-emerald-300">
                {percent(after.pickRate)}
              </span>
            </>
          )}
        </div>
        <p className="mt-3 max-w-md text-clay-100/80">
          How often an AI shopping agent chose Mayabazar when it compared the shop with competitor
          listings.
          {after ? " Right is after the shop approved the fixes below." : ""}
        </p>
      </div>
      <dl className="grid grid-cols-2 content-center gap-4 text-sm">
        <div>
          <dt className="text-clay-100/60">AI shoppers</dt>
          <dd className="text-2xl font-semibold">{baseline.totalRuns} requests</dd>
        </div>
        <div>
          <dt className="text-clay-100/60">Change</dt>
          <dd className="text-2xl font-semibold text-emerald-300">
            {comparison
              ? `${comparison.deltaPoints >= 0 ? "+" : ""}${comparison.deltaPoints} points`
              : "n/a"}
          </dd>
        </div>
        <div>
          <dt className="text-clay-100/60">Sales won back</dt>
          <dd className="text-2xl font-semibold">
            {comparison ? comparison.gained.length : "n/a"}
          </dd>
        </div>
        <div>
          <dt className="text-clay-100/60">Source</dt>
          <dd className="text-sm">
            {baseline.recorded ? "Recorded run, real models" : "Live run"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
