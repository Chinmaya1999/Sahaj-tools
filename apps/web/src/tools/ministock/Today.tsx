import { formatInr } from "@ek/shared";
import { Alert, Button, Card, Spinner } from "../../components/ui";
import { errMsg } from "../../lib/api";
import { stat, useMs, type Nav } from "./common";

export function Today({ go }: Nav) {
  const q = useMs<any>("/dashboard");
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  const d = q.data; const t = d.today;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl">Today</h2><p className="text-sm text-ink-2">{t.date} · {t.orders} sale{t.orders === 1 ? "" : "s"} so far</p></div>
        <Button onClick={() => go("sell")}>+ New sale</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("Today's sales", formatInr(t.salesRevenuePaise), { sub: "Sales revenue (before tax)" })}
        {stat("Gross profit", formatInr(t.grossProfitPaise), { tone: t.grossProfitPaise < 0 ? "text-bad" : undefined, sub: `Before overheads · ${t.marginPercent}% margin` })}
        {stat("Cash received", formatInr(t.cashReceivedPaise), { sub: "Confirmed payments less refunds" })}
        {stat("Customer dues", formatInr(d.customerDuesPaise), { tone: d.customerDuesPaise ? "text-warn" : undefined, sub: d.overdueCount ? `${d.overdueCount} overdue` : "Outstanding receivables" })}
        {stat("Low stock", d.lowStockCount, { tone: d.lowStockCount ? "text-warn" : undefined, sub: "Need review" })}
        {stat("To dispatch", d.awaitingDispatch, { sub: `${d.pendingOrders} open orders` })}
        {stat("You owe suppliers", formatInr(d.supplierDuesPaise))}
        {stat("Stock value", formatInr(d.inventoryValuePaise), { sub: "At cost" })}
      </div>
      <Card className="p-4">
        <h3 className="mb-2 text-lg">Needs your attention</h3>
        {d.alerts.length ? <ul className="space-y-2">{d.alerts.map((a: any, i: number) => (
          <li key={i}><button type="button" onClick={() => go(a.to)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper-2/40 px-3 py-2.5 text-left text-sm hover:border-brand"><span>{a.tone === "bad" ? "🔴" : a.tone === "warn" ? "🟠" : "🔵"} {a.text}</span><span aria-hidden>→</span></button></li>
        ))}</ul> : <p className="text-sm text-ink-2">Nothing urgent. Stock, payments and orders look healthy.</p>}
      </Card>
      <details className="rounded-2xl border border-line bg-card p-4 text-sm text-ink-2"><summary className="cursor-pointer font-semibold text-ink">How these numbers are worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">{Object.values(d.definitions).map((x: any) => <li key={x}>{x}</li>)}</ul></details>
    </div>
  );
}
