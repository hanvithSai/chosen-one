import { CircleCheck, Lightbulb, Quote } from "lucide-react";
import { useState } from "react";
import type { Dashboard, IntentResult } from "../../api";
import { CATEGORY_LABEL, lostRequests, recoveredRequests } from "../../insights";
import { go } from "../../router";
import { Pill } from "../ui";

type View = "still" | "recovered" | "before";

const WHERE_LABEL = {
  fixes: "Open Fixes",
  catalog: "Edit your listings",
  policy: "Edit your policies",
} as const;

function Outcome({ result }: { result: IntentResult }) {
  if (result.outcome === "bought_competitor") {
    return <Pill tone="bad">Chose {result.chosenStore ?? "a competitor"}</Pill>;
  }
  return <Pill tone="neutral">Bought nowhere</Pill>;
}

export function LostSales({ data }: { data: Dashboard }) {
  const { baseline, after } = data;
  const [view, setView] = useState<View>(after ? "still" : "before");
  if (!baseline)
    return <p className="text-stone-600">Run a shopper scan to see where you lose sales.</p>;

  const still = after ? lostRequests(after) : [];
  const before = lostRequests(baseline);
  const recovered = after ? recoveredRequests(baseline, after) : [];
  const tabs: { id: View; label: string; count: number }[] = [
    ...(after ? [{ id: "still" as const, label: "Still losing", count: still.length }] : []),
    ...(after
      ? [{ id: "recovered" as const, label: "Recovered by the fixes", count: recovered.length }]
      : []),
    { id: "before" as const, label: "Lost before the fixes", count: before.length },
  ];

  return (
    <div className="grid gap-6">
      <p className="max-w-3xl text-stone-600">
        Each card is one shopper request your shop did not win. It shows what the shopper asked for,
        what they did, why, and what you can do about it.
      </p>
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={view === t.id}
            onClick={() => setView(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              view === t.id
                ? "border-clay-500 bg-clay-500 text-white"
                : "border-clay-100 bg-white text-stone-700 hover:border-clay-500"
            }`}
          >
            {t.label} <span className="tabular-nums opacity-80">({t.count})</span>
          </button>
        ))}
      </div>

      {view === "recovered" && (
        <ul className="grid gap-3">
          {recovered.map((r) => {
            const now = after?.results.find((x) => x.position === r.position);
            return (
              <li
                key={r.position}
                className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"
              >
                <div className="flex items-start gap-3">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                  <div>
                    <p className="font-semibold">{r.text}</p>
                    <p className="mt-1 text-sm text-stone-700">
                      <b>Before:</b>{" "}
                      {r.outcome === "bought_competitor"
                        ? `chose ${r.chosenStore}`
                        : "bought nowhere"}
                      . {r.ourReason?.reason ?? r.rationale}
                    </p>
                    <p className="mt-1 text-sm text-stone-700">
                      <b>After:</b> chose your shop. {now?.rationale}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view !== "recovered" && (
        <ul className="grid gap-4">
          {(view === "still" ? still : before).map(({ result, action, category }) => (
            <li
              key={result.position}
              className="rounded-xl border border-clay-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-2xl font-semibold">“{result.text}”</p>
                <div className="flex gap-2">
                  <Outcome result={result} />
                  {category && <Pill tone="info">{CATEGORY_LABEL[category] ?? category}</Pill>}
                </div>
              </div>
              <div className="mt-3 flex gap-2 text-sm text-stone-700">
                <Quote className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden />
                <p>
                  <b>The shopper said:</b>{" "}
                  {result.ourReason?.reason ?? result.rationale ?? "No reason given."}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg bg-clay-50 p-3">
                <div className="flex gap-2 text-sm">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-clay-500" aria-hidden />
                  <p>
                    <b>{action.title}.</b> <span className="text-stone-600">{action.detail}</span>
                  </p>
                </div>
                <button
                  onClick={() => go(action.where === "fixes" ? "/app/fixes" : "/app/fixes")}
                  className="shrink-0 rounded-lg border border-clay-500 px-3 py-1 text-xs font-semibold text-clay-700 hover:bg-white"
                >
                  {WHERE_LABEL[action.where]}
                </button>
              </div>
            </li>
          ))}
          {(view === "still" ? still : before).length === 0 && (
            <li className="rounded-xl border border-clay-100 bg-white p-6 text-stone-600">
              Nothing lost here. 🎉
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
