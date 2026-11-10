import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { Activity, PanelComparison, PanelSummary } from "../api";
import { REASON_LABELS } from "../api";
import { gridTheme } from "./MeasureTab";
import { Card, Pill } from "./ui";

type Order = Activity["orders"][number];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-clay-50 p-4">
      <dt className="text-stone-600">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function ProveTab({
  comparison,
  after,
  activity,
}: {
  comparison?: PanelComparison;
  after?: PanelSummary;
  activity: Activity;
}) {
  const columns = useMemo<ColDef<Order>[]>(
    () => [
      {
        field: "createdAt",
        headerName: "When",
        width: 180,
        valueFormatter: (p) => new Date(p.value as string).toLocaleString(),
      },
      { field: "agent", headerName: "Agent", width: 160 },
      {
        headerName: "Amount",
        width: 120,
        valueGetter: (p) => `${p.data?.amount} ${p.data?.currency}`,
      },
      { field: "status", headerName: "PayPal status", width: 140 },
      { field: "paypalOrderId", headerName: "PayPal order", width: 190 },
      { field: "captureId", headerName: "Capture", width: 190 },
      {
        field: "webhookConfirmed",
        headerName: "Webhook",
        width: 130,
        valueFormatter: (p) => (p.value ? "verified" : "pending"),
      },
    ],
    [],
  );
  return (
    <div className="grid gap-6">
      {comparison && after && (
        <Card
          title="Sales won back after the fixes"
          subtitle={`PickRate moved from ${Math.round(comparison.before.pickRate * 100)}% to ${Math.round(comparison.after.pickRate * 100)}% on the same ${after.totalRuns} requests.`}
        >
          <ul className="space-y-3">
            {comparison.gained.map((g) => (
              <li key={g.position} className="rounded-lg bg-emerald-50 p-3 text-sm">
                <p className="font-medium">{g.text}</p>
                {g.reason && <p className="mt-1 text-stone-700">Shopper: “{g.reason}”</p>}
              </li>
            ))}
            {comparison.lost.map((l) => (
              <li key={l.position} className="rounded-lg bg-rose-50 p-3 text-sm">
                <Pill tone="bad">Lost after the fixes</Pill>
                <p className="mt-1 font-medium">{l.text}</p>
              </li>
            ))}
          </ul>
          {after.lostReasons.length > 0 && (
            <p className="mt-4 text-sm text-stone-600">
              Still missing:{" "}
              {after.lostReasons
                .map((r) => `${REASON_LABELS[r.category] ?? r.category} (${r.count})`)
                .join("; ")}
              .
            </p>
          )}
        </Card>
      )}
      <Card
        title="Real agent sales, attributed through PayPal"
        subtitle="Every order created through the store's Cart API or MCP server carries the calling agent in PayPal's custom_id, confirmed by a verified webhook."
      >
        <dl className="mb-4 grid gap-4 text-sm md:grid-cols-4">
          <Stat label="Agent orders" value={String(activity.totals.agentOrders)} />
          <Stat label="Captured" value={String(activity.totals.capturedOrders)} />
          <Stat label="Agent revenue (sandbox)" value={`$${activity.totals.capturedRevenue}`} />
          <Stat
            label="Agent tool calls, 7 days"
            value={String(activity.totals.toolCallsLast7Days)}
          />
        </dl>
        {activity.orders.length === 0 ? (
          <p className="text-sm text-stone-500">
            No agent has bought yet. Connect an agent from the Connect tab.
          </p>
        ) : (
          <div style={{ height: 320 }}>
            <AgGridReact<Order>
              theme={gridTheme}
              rowData={activity.orders}
              columnDefs={columns}
              defaultColDef={{ sortable: true, resizable: true }}
            />
          </div>
        )}
      </Card>
      <Card title="What agents did in the store">
        {activity.toolCalls.byTool.length === 0 ? (
          <p className="text-sm text-stone-500">No agent tool calls yet.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <ul className="space-y-1 text-sm">
              {activity.toolCalls.byTool.map((t) => (
                <li key={t.tool} className="flex justify-between">
                  <code>{t.tool}</code>
                  <span className="tabular-nums">{t.calls}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1 text-sm">
              {activity.toolCalls.byAgent.map((a) => (
                <li key={a.agent} className="flex justify-between">
                  <span>{a.agent}</span>
                  <span className="tabular-nums">{a.calls}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
