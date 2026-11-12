import { useEffect, useState } from "react";
import { loadDashboard, type Dashboard } from "./api";
import { LostSales } from "./components/app/LostSales";
import { Overview } from "./components/app/Overview";
import { Shell } from "./components/app/Shell";
import { ChittiTab } from "./components/ChittiTab";
import { ConnectTab } from "./components/ConnectTab";
import { FixesTab } from "./components/FixesTab";
import { Landing } from "./components/landing/Landing";
import { MeasureTab } from "./components/MeasureTab";
import { ProveTab } from "./components/ProveTab";
import { useRoute } from "./router";

export function App() {
  const path = useRoute();
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadDashboard()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (!path.startsWith("/app")) return <Landing data={data} />;

  return (
    <Shell path={path} store={data?.store}>
      {error && (
        <p className="rounded-lg bg-rose-50 p-4 text-rose-800" role="alert">
          Could not load the dashboard: {error}
        </p>
      )}
      {!data && !error && <p className="text-stone-600">Loading your dashboard…</p>}
      {data && (
        <>
          {path === "/app" && <Overview data={data} />}
          {path === "/app/lost" && <LostSales data={data} />}
          {path === "/app/results" &&
            (data.baseline ? (
              <MeasureTab baseline={data.baseline} after={data.after} />
            ) : (
              <p className="text-stone-600">No shopper results yet.</p>
            ))}
          {path === "/app/fixes" && <FixesTab proposals={data.proposals} />}
          {path === "/app/proof" && (
            <ProveTab comparison={data.comparison} after={data.after} activity={data.activity} />
          )}
          {path === "/app/shopper" && <ChittiTab />}
          {path === "/app/connect" && <ConnectTab />}
          {![
            "/app",
            "/app/lost",
            "/app/results",
            "/app/fixes",
            "/app/proof",
            "/app/shopper",
            "/app/connect",
          ].includes(path) && <p className="text-stone-600">That page does not exist.</p>}
        </>
      )}
    </Shell>
  );
}
