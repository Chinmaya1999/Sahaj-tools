import { useState } from "react";
import { formatInr } from "@ek/shared";
import { Alert, Button, Input, Select, Spinner, Table, Td, Th } from "../../components/ui";
import { errMsg } from "../../lib/api";
import { monthStartIst, todayIst, useMs } from "./common";

const KINDS: [string, string][] = [["sales", "Daily sales"], ["products", "Product performance"], ["stock", "Stock valuation"], ["receivables", "Customer dues"], ["payables", "Supplier dues"], ["expenses", "Expenses"], ["returns", "Returns & refunds"], ["movements", "Inventory movement"]];

export function Insights() {
  const [kind, setKind] = useState("sales"); const [from, setFrom] = useState(monthStartIst()); const [to, setTo] = useState(todayIst()); const [search, setSearch] = useState("");
  const q = useMs<any>(`/reports/${kind}?from=${from}&to=${to}`);
  const rows = (q.data?.rows ?? []).filter((r: any) => !search || Object.values(r).some((v) => String(v).toLowerCase().includes(search.toLowerCase())));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><Select label="Report" value={kind} onChange={(e) => setKind(e.target.value)} className="sm:col-span-2">{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select><Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <div className="flex flex-wrap items-end gap-3"><Input label="Search this report" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[12rem] flex-1" /><a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold hover:bg-paper-2" href={`/api/ministock/reports/${kind}?format=csv&from=${from}&to=${to}`}>Download CSV</a><Button variant="secondary" onClick={() => window.print()}>Print</Button></div>
      {q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{errMsg(q.error)}</Alert> : (<>
        <Alert>{q.data.note}</Alert>
        {!rows.length ? <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-2">No data for this period.</p> : (
          <Table label={q.data.title}><thead><tr>{q.data.columns.map((c: any) => <Th key={c.key}>{c.label}</Th>)}</tr></thead>
            <tbody>{rows.slice(0, 500).map((r: any, i: number) => <tr key={i}>{q.data.columns.map((c: any) => <Td key={c.key} className={c.money || typeof r[c.key] === "number" ? "text-right tabular-nums" : ""}>{c.money ? formatInr(r[c.key]) : String(r[c.key] ?? "")}</Td>)}</tr>)}
              {q.data.totals && <tr className="font-bold">{q.data.columns.map((c: any, i: number) => <Td key={c.key} className={c.money ? "text-right tabular-nums" : ""}>{i === 0 ? "Total" : q.data.totals[c.key] !== undefined ? (c.money ? formatInr(q.data.totals[c.key]) : q.data.totals[c.key]) : ""}</Td>)}</tr>}</tbody></Table>)}
      </>)}
    </div>
  );
}
