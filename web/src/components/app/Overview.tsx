import { ArrowRight, CircleCheck, TrendingUp } from "lucide-react";
import type { Dashboard, PanelSummary } from "../../api";
import { CATEGORY_LABEL, lostRequests, opportunities, recoveredRequests } from "../../insights";
import { go } from "../../router";
import { Card, percent } from "../ui";

function OutcomeBar({ panel, label }: { panel: PanelSummary; label: string }) {
  const total = Math.max(panel.totalRuns, 1);
  const parts = [
    { n: panel.boughtOurs, cls: "bg-emerald-500", name: "Chose your shop" },
    { n: panel.boughtCompetitor, cls: "bg-rose-400", name: "Chose a competitor" },
    { n: panel.noPurchase, cls: "bg-stone-300", name: "Bought nowhere" },
  ];
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-stone-600">{percent(panel.pickRate)} PickRate</span>
      </div>
      <div
        className="flex h-4 overflow-hidden rounded-full bg-clay-50"
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.n} ${p.name}`).join(", ")}`}
      >
        {parts.map((p) => (
          <div
            key={p.name}
            className={p.cls}
            style={{ width: `${(p.n / total) * 100}%` }}
            title={`${p.name}: ${p.n}`}
          />
        ))}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "good" | "warn";
}) {
  const color =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-ink";
  return (
    <div className="rounded-xl border border-clay-100 bg-white p-5 shadow-sm">
      <p className="text-sm text-stone-600">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Overview({ data }: { data: Dashboard }) {
  const { baseline, after, comparison, proposals, store, activity } = data;
  const current = after ?? baseline;
  const lost = current ? lostRequests(current) : [];
  const recovered = baseline && after ? recoveredRequests(baseline, after) : [];
  const steps = [
    {
      done: true,
      title: "Connect PayPal",
      text: "Sandbox account connected for checkout and attribution",
      to: "/app/connect",
    },
    {
      done: store.products > 0,
      title: "Import your catalog",
      text: `${store.products} listings imported`,
      to: "/app/fixes",
    },
    {
      done: proposals.length > 0,
      title: "Add your notes",
      text: `${new Set(proposals.map((p) => p.noteTitle)).size} notes used as evidence`,
      to: "/app/fixes",
    },
    {
      done: !!baseline,
      title: "Run your first AI shopper scan",
      text: baseline
        ? `${baseline.totalRuns} shoppers compared you with competitors`
        : "Not run yet",
      to: "/app/results",
    },
    {
      done: proposals.some((p) => p.status === "approved"),
      title: "Approve the fixes",
      text: `${proposals.length} facts approved, catalog v${store.catalogVersion}`,
      to: "/app/fixes",
    },
    {
      done: true,
      title: "Open your store to AI agents",
      text: "MCP server and Cart API are live",
      to: "/app/connect",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const opps = opportunities(lost);

  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Setup</h2>
            <p className="text-sm text-stone-600">
              {done} of {steps.length} steps done. This demo shop is set up for you; with your own
              shop you would connect PayPal, import your catalog and add your notes.
            </p>
          </div>
          <div className="h-2 w-48 rounded-full bg-clay-50" aria-hidden>
            <div
              className="h-2 rounded-full bg-emerald-500"
              style={{ width: `${(done / steps.length) * 100}%` }}
            />
          </div>
        </div>
        <ol className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title}>
              <button
                onClick={() => go(step.to)}
                className="flex w-full items-start gap-3 rounded-lg border border-clay-100 bg-white p-3 text-left transition hover:border-clay-500"
              >
                <CircleCheck
                  className={`mt-0.5 size-5 shrink-0 ${step.done ? "text-emerald-500" : "text-stone-300"}`}
                  aria-hidden
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {i + 1}. {step.title}
                  </span>
                  <span className="block text-xs text-stone-600">{step.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      {current && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="PickRate now"
            value={percent(current.pickRate)}
            hint={
              baseline && after
                ? `was ${percent(baseline.pickRate)} before fixes`
                : "share of shoppers who chose you"
            }
            tone="good"
          />
          <Kpi
            label="Change since fixes"
            value={
              comparison
                ? `${comparison.deltaPoints >= 0 ? "+" : ""}${comparison.deltaPoints} pts`
                : "n/a"
            }
            hint="same 20 requests, same market"
            tone="good"
          />
          <Kpi
            label="Sales won back"
            value={String(recovered.length)}
            hint="lost before, won after the fixes"
          />
          <Kpi
            label="Still losing"
            value={String(lost.length)}
            hint="requests to look at next"
            tone="warn"
          />
        </div>
      )}

      {baseline && after && (
        <Card
          title="Who the AI shoppers chose"
          subtitle="Same 20 requests, run before and after the approved fixes."
        >
          <div className="grid gap-5">
            <OutcomeBar panel={baseline} label="Before fixes" />
            <OutcomeBar panel={after} label="After fixes" />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-stone-600">
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-full bg-emerald-500" />
              Chose your shop
            </span>
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-full bg-rose-400" />
              Chose a competitor
            </span>
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-full bg-stone-300" />
              Bought nowhere
            </span>
          </div>
        </Card>
      )}

      {opps.length > 0 && (
        <Card
          title="Your biggest opportunities"
          subtitle="Where you still lose sales, grouped by what to do about it."
        >
          <ul className="grid gap-3 md:grid-cols-3">
            {opps.slice(0, 3).map((o) => (
              <li key={o.category} className="rounded-xl border border-clay-100 bg-clay-50/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-clay-700">
                  {CATEGORY_LABEL[o.category] ?? "Other"} · {o.items.length}{" "}
                  {o.items.length === 1 ? "request" : "requests"}
                </p>
                <p className="mt-1 font-semibold">{o.action.title}</p>
                <p className="mt-1 text-sm text-stone-600">{o.action.detail}</p>
                <p className="mt-2 line-clamp-2 text-xs text-stone-500">
                  e.g. “{o.items[0]?.result.text}”
                </p>
              </li>
            ))}
          </ul>
          <button
            onClick={() => go("/app/lost")}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-clay-700 hover:underline"
          >
            See every lost sale <ArrowRight className="size-4" aria-hidden />
          </button>
        </Card>
      )}

      <Card title="Agent sales">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <span className="flex items-center gap-2 text-stone-700">
            <TrendingUp className="size-4 text-emerald-600" aria-hidden />
            <b className="tabular-nums">{activity.totals.capturedOrders}</b> captured ·{" "}
            <b className="tabular-nums">${activity.totals.capturedRevenue}</b> sandbox revenue
          </span>
          <span className="text-stone-600">
            {activity.totals.agentOrders} agent orders · {activity.totals.toolCallsLast7Days} agent
            tool calls this week
          </span>
          <button
            onClick={() => go("/app/proof")}
            className="font-semibold text-clay-700 hover:underline"
          >
            View attributed orders
          </button>
        </div>
      </Card>
    </div>
  );
}
