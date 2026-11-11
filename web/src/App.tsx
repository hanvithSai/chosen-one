import { useEffect, useState } from "react";
import { loadDashboard, type Dashboard } from "./api";
import { ConnectTab } from "./components/ConnectTab";
import { FixesTab } from "./components/FixesTab";
import { MeasureTab } from "./components/MeasureTab";
import { PickRateHero } from "./components/PickRateHero";
import { ProveTab } from "./components/ProveTab";

const TABS = [
  { id: "measure", label: "1. Measure" },
  { id: "fix", label: "2. Fix" },
  { id: "prove", label: "3. Prove" },
  { id: "connect", label: "Connect an agent" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function App() {
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<TabId>(() => {
    const fromHash = window.location.hash.slice(1);
    return TABS.some((t) => t.id === fromHash) ? (fromHash as TabId) : "measure";
  });

  useEffect(() => {
    loadDashboard()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="min-h-screen bg-clay-50/40 text-ink">
      <header className="border-b border-clay-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-semibold tracking-tight">
            Chosen<span className="text-clay-500">One</span>
          </span>
          <span className="text-sm text-clay-700">
            {data
              ? `${data.store.merchant.name} · catalog v${data.store.catalogVersion} · ${data.store.mode === "replay" ? "recorded demo" : "live"}`
              : "Loading…"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          When an AI shops for you, it picks one store.
        </h1>
        <p className="mt-2 max-w-2xl text-clay-700">
          ChosenOne shows a small PayPal merchant how often AI shopping agents pick their store, why
          they lose, and how to win the sale.
        </p>

        {error && (
          <p className="mt-8 rounded-lg bg-rose-50 p-4 text-rose-800" role="alert">
            Could not load the dashboard: {error}
          </p>
        )}
        {!data && !error && <p className="mt-8 text-clay-700">Loading the dashboard…</p>}

        {data && (
          <>
            <div className="mt-6">
              <PickRateHero
                baseline={data.baseline}
                after={data.after}
                comparison={data.comparison}
              />
            </div>
            <nav className="mt-8 flex gap-1 border-b border-clay-100" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    window.location.hash = t.id;
                  }}
                  className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium ${
                    tab === t.id
                      ? "border-clay-500 text-clay-700"
                      : "border-transparent text-stone-500 hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="mt-6">
              {tab === "measure" &&
                (data.baseline ? (
                  <MeasureTab baseline={data.baseline} after={data.after} />
                ) : (
                  <p className="text-clay-700">No panel results yet.</p>
                ))}
              {tab === "fix" && <FixesTab proposals={data.proposals} />}
              {tab === "prove" && (
                <ProveTab
                  comparison={data.comparison}
                  after={data.after}
                  activity={data.activity}
                />
              )}
              {tab === "connect" && <ConnectTab />}
            </div>
          </>
        )}
        <footer className="mt-12 border-t border-clay-100 pt-4 text-xs text-stone-500">
          Demo shop Mayabazar is fictional. Shopper decisions are recorded runs of AI models (free
          tiers); competitor listings are anonymised. Payments use the PayPal sandbox.
        </footer>
      </main>
    </div>
  );
}
