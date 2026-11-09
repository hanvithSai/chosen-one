import { useEffect, useState } from "react";

type Health = { status: string; mode: string } | null;

export function App() {
  const [health, setHealth] = useState<Health>(null);

  useEffect(() => {
    fetch("/healthz")
      .then((res) => (res.ok ? res.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-clay-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-semibold tracking-tight">
            Chosen<span className="text-clay-500">One</span>
          </span>
          <span className="text-sm text-clay-700">
            {health ? `API ${health.status} · ${health.mode} mode` : "API offline"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">
          When an AI shops for you, it picks one store.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-clay-700">
          ChosenOne shows small PayPal merchants how often AI shopping agents pick them, why they
          lose, and how to win the sale.
        </p>
      </main>
    </div>
  );
}
