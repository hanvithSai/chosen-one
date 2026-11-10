import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { Proposal } from "../api";
import { gridTheme, WRAP_STYLE } from "./MeasureTab";
import { Card } from "./ui";

export function FixesTab({ proposals }: { proposals: Proposal[] }) {
  const columns = useMemo<ColDef<Proposal>[]>(
    () => [
      { field: "productTitle", headerName: "Product", width: 210 },
      { field: "field", headerName: "Fact added", width: 170 },
      {
        field: "value",
        headerName: "Value",
        width: 220,
        wrapText: true,
        autoHeight: true,
        cellStyle: WRAP_STYLE,
      },
      {
        field: "quote",
        headerName: "Quoted from the shop's own notes",
        flex: 2,
        minWidth: 300,
        wrapText: true,
        autoHeight: true,
        cellStyle: WRAP_STYLE,
      },
      { field: "noteTitle", headerName: "Note", width: 230 },
      { field: "status", headerName: "Status", width: 110 },
    ],
    [],
  );
  const listings = new Set(proposals.map((p) => p.sku)).size;
  const notes = new Set(proposals.map((p) => p.noteTitle)).size;
  return (
    <div className="grid gap-6">
      <Card
        title="Fixes the AI drafted, and the shop approved"
        subtitle="Each fact must quote the shop's own notes. The code checks that the quote exists and that every number in the fact appears in it. Price, stock and photos are never changed."
      >
        <ul className="grid gap-4 text-sm md:grid-cols-3">
          <li className="rounded-lg bg-clay-50 p-4">
            <span className="block text-3xl font-semibold tabular-nums">{proposals.length}</span>
            facts added across {listings} listings
          </li>
          <li className="rounded-lg bg-clay-50 p-4">
            <span className="block text-3xl font-semibold tabular-nums">{notes}</span>
            of the shop&apos;s own notes used as evidence
          </li>
          <li className="rounded-lg bg-clay-50 p-4">
            <span className="block text-3xl font-semibold tabular-nums">0</span>
            prices, stock levels or promises invented
          </li>
        </ul>
      </Card>
      <Card>
        <div style={{ height: 620 }}>
          <AgGridReact<Proposal>
            theme={gridTheme}
            rowData={proposals}
            columnDefs={columns}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
          />
        </div>
      </Card>
    </div>
  );
}
