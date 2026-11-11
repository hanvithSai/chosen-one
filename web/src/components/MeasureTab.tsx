import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import { REASON_LABELS, type IntentResult, type PanelSummary } from "../api";
import { Card, Pill } from "./ui";

ModuleRegistry.registerModules([AllCommunityModule]);

export const WRAP_STYLE = { lineHeight: "1.4", paddingTop: "8px", paddingBottom: "8px" };

export const gridTheme = themeQuartz.withParams({
  accentColor: "#b5653a",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  headerBackgroundColor: "#fbf6f1",
});

export function OutcomeCell({ outcome, store }: { outcome?: string; store?: string | null }) {
  if (!outcome) return <span className="text-stone-400">-</span>;
  if (outcome === "bought_ours") return <Pill tone="good">Chose Mayabazar</Pill>;
  if (outcome === "bought_competitor") {
    return <Pill tone="bad">Chose {store ?? "a competitor"}</Pill>;
  }
  return <Pill tone="neutral">Bought nowhere</Pill>;
}

interface Row {
  position: number;
  text: string;
  before: string;
  beforeStore: string | null;
  beforeWhy: string | null;
  after?: string;
  afterStore?: string | null;
}

function rowsFor(before: IntentResult[], after?: IntentResult[]): Row[] {
  const afterByPos = new Map((after ?? []).map((r) => [r.position, r]));
  return before.map((r) => ({
    position: r.position + 1,
    text: r.text,
    before: r.outcome,
    beforeStore: r.chosenStore,
    beforeWhy: r.rationale,
    after: afterByPos.get(r.position)?.outcome,
    afterStore: afterByPos.get(r.position)?.chosenStore,
  }));
}

export function MeasureTab({ baseline, after }: { baseline: PanelSummary; after?: PanelSummary }) {
  const rows = useMemo(() => rowsFor(baseline.results, after?.results), [baseline, after]);
  const columns = useMemo<ColDef<Row>[]>(() => {
    const cols: ColDef<Row>[] = [
      { field: "position", headerName: "#", width: 70 },
      {
        field: "text",
        headerName: "What the shopper asked for",
        flex: 2,
        minWidth: 260,
        wrapText: true,
        autoHeight: true,
        cellStyle: WRAP_STYLE,
      },
      {
        field: "before",
        headerName: "Before fixes",
        width: 190,
        cellRenderer: (p: ICellRendererParams<Row>) => (
          <OutcomeCell outcome={p.data?.before} store={p.data?.beforeStore} />
        ),
      },
    ];
    if (after) {
      cols.push({
        field: "after",
        headerName: "After fixes",
        width: 190,
        cellRenderer: (p: ICellRendererParams<Row>) => (
          <OutcomeCell outcome={p.data?.after} store={p.data?.afterStore} />
        ),
      });
    }
    cols.push({
      field: "beforeWhy",
      headerName: "Why the shopper decided that (before fixes)",
      flex: 3,
      minWidth: 320,
      wrapText: true,
      autoHeight: true,
    });
    return cols;
  }, [after]);

  const max = Math.max(1, ...baseline.lostReasons.map((r) => r.count));
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card
          title="Why shoppers did not choose Mayabazar"
          subtitle="Reasons the AI shoppers gave about the shop's own listings, before any fix."
        >
          <ul className="space-y-3">
            {baseline.lostReasons.map((r) => (
              <li key={r.category}>
                <div className="flex justify-between text-sm">
                  <span>{REASON_LABELS[r.category] ?? r.category}</span>
                  <span className="tabular-nums text-clay-700">{r.count}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-clay-50">
                  <div
                    className="h-2 rounded bg-clay-500"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </div>
                {r.examples[0] && <p className="mt-1 text-xs text-stone-500">“{r.examples[0]}”</p>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Who won the sales instead" subtitle="Competitor names are anonymised.">
          {baseline.lostTo.length === 0 ? (
            <p className="text-sm text-stone-500">No competitor won a sale.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {baseline.lostTo.map((l) => (
                <li key={l.store} className="flex justify-between">
                  <span>{l.store}</span>
                  <span className="tabular-nums text-clay-700">
                    {l.count} {l.count === 1 ? "sale" : "sales"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-stone-600">
            {baseline.noPurchase} of {baseline.totalRuns} shoppers bought nowhere, because no store
            stated what they needed.
          </p>
        </Card>
      </div>
      <Card
        title={`All ${baseline.totalRuns} shopper requests`}
        subtitle="Every AI shopper compared Mayabazar with competitor listings and picked one store, or none."
      >
        <div style={{ height: 560 }}>
          <AgGridReact<Row>
            theme={gridTheme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
          />
        </div>
      </Card>
    </div>
  );
}
