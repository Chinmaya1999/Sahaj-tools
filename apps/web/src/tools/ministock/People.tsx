import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatInr } from "@ek/shared";
import { Alert, Button, Card, Empty, Input, Spinner } from "../../components/ui";
import { ApiError, errMsg, api } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { ErrorNote, Sheet, StatusBadge, useMs, useRefreshAll } from "./common";

export function People() {
  const [kind, setKind] = useState<"customers" | "suppliers">("customers");
  return (
    <div className="space-y-4">
      <div role="group" aria-label="People" className="flex gap-1.5">{(["customers", "suppliers"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-h-10 rounded-full border px-5 text-sm font-semibold capitalize ${kind === k ? "border-brand bg-brand-50 text-brand-700" : "border-line bg-card"}`}>{k}</button>)}</div>
      {kind === "customers" ? <Customers /> : <Suppliers />}
    </div>
  );
}

function Customers() {
  const q = useMs<any>("/customers"); const [form, setForm] = useState<any>(null); const [ledger, setLedger] = useState<string | null>(null);
  return (<div className="space-y-3">
    <Button onClick={() => setForm({})}>+ Add customer</Button>
    {q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{errMsg(q.error)}</Alert> : !q.data.customers.length ? <Empty title="No customers yet">Walk-in sales do not need a customer. Add one to track purchases and dues.</Empty> : (
      <ul className="space-y-2">{q.data.customers.map((c: any) => <li key={c.id}><button type="button" className="w-full text-left" onClick={() => setLedger(c.id)}><Card className="flex flex-wrap items-center justify-between gap-2 p-3.5"><div><p className="font-semibold">{c.name}</p><p className="text-sm text-ink-2">{c.phone || "No phone"} · {c.orders} order{c.orders === 1 ? "" : "s"} · {formatInr(c.purchasesPaise)} bought</p></div>{c.outstandingPaise > 0 ? <span className="font-semibold text-warn">Owes {formatInr(c.outstandingPaise)}</span> : <span className="text-sm text-ok">Settled</span>}</Card></button></li>)}</ul>)}
    {form && <PersonForm title="Add customer" path="/ministock/customers" fields={[["name", "Name"], ["phone", "Phone"], ["address", "Address"], ["notes", "Notes"]]} consent onClose={() => setForm(null)} />}
    {ledger && <Ledger id={ledger} onClose={() => setLedger(null)} />}
  </div>);
}
function Ledger({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useMs<any>(`/customers/${id}/ledger`);
  return <Sheet title={q.data?.customer.name ?? "Customer"} onClose={onClose} wide>{q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{errMsg(q.error)}</Alert> : (<>
    <p className="text-sm text-ink-2">{q.data.customer.phone || "No phone"}{q.data.customer.remindersConsent ? " · agreed to payment reminders" : ""}</p>
    <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Bought", q.data.totals.purchasesPaise], ["Returned", q.data.totals.returnsPaise], ["Paid", q.data.totals.paidPaise], ["Owes", q.data.totals.outstandingPaise]].map(([l, v]) => <Card key={l as string} className="p-3 text-center"><p className="text-xs text-ink-2">{l}</p><b>{formatInr(v as number)}</b></Card>)}</div>
    <h3 className="text-lg">Orders</h3><ul className="mt-1 space-y-1 text-sm">{q.data.orders.map((o: any) => <li key={o.id} className="flex justify-between gap-2"><span>{o.number} · {fmtDate(o.createdAt)} <StatusBadge status={o.status} /></span><span>{formatInr(o.totalPaise)}{o.outstandingPaise > 0 && <b className="ml-1 text-warn">owes {formatInr(o.outstandingPaise)}</b>}</span></li>)}</ul>
    <h3 className="mt-3 text-lg">Payments</h3><ul className="mt-1 space-y-1 text-sm">{q.data.payments.length ? q.data.payments.map((p: any) => <li key={p.id} className="flex justify-between"><span>{fmtDate(p.createdAt)} · {p.kind} · {p.method} <StatusBadge status={p.status} /></span><b>{formatInr(p.amountPaise)}</b></li>) : <li className="text-ink-2">None yet</li>}</ul></>)}</Sheet>;
}

function Suppliers() {
  const q = useMs<any>("/suppliers"); const [form, setForm] = useState(false);
  return (<div className="space-y-3">
    <Button onClick={() => setForm(true)}>+ Add supplier</Button>
    {q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{errMsg(q.error)}</Alert> : !q.data.suppliers.length ? <Empty title="No suppliers yet">Add the people you buy stock from to create purchase orders.</Empty> : (
      <ul className="space-y-2">{q.data.suppliers.map((s: any) => <li key={s.id}><Card className="flex flex-wrap items-center justify-between gap-2 p-3.5"><div><p className="font-semibold">{s.name}{s.businessName ? ` · ${s.businessName}` : ""}</p><p className="text-sm text-ink-2">{s.phone || "No phone"} · delivers in about {s.leadTimeDays} days · pay within {s.paymentTermsDays} days</p></div>{s.balancePaise > 0 ? <span className="font-semibold text-warn">You owe {formatInr(s.balancePaise)}</span> : <span className="text-sm text-ok">Settled</span>}</Card></li>)}</ul>)}
    {form && <PersonForm title="Add supplier" path="/ministock/suppliers" fields={[["name", "Name"], ["businessName", "Business name"], ["phone", "Phone"], ["email", "Email"], ["address", "Address"], ["taxId", "Tax / GST number"]]} numbers={[["leadTimeDays", "Delivery time (days)", "5"], ["paymentTermsDays", "Payment terms (days)", "0"]]} onClose={() => setForm(false)} />}
  </div>);
}

function PersonForm({ title, path, fields, numbers = [], consent, onClose }: { title: string; path: string; fields: [string, string][]; numbers?: [string, string, string][]; consent?: boolean; onClose: () => void }) {
  const refresh = useRefreshAll(); const [v, setV] = useState<Record<string, string>>(Object.fromEntries(numbers.map(([k, , d]) => [k, d]))); const [ok, setOk] = useState(false);
  const m = useMutation({ mutationFn: () => api(path, { body: { ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, numbers.some(([n]) => n === k) ? Number(x || 0) : x])), ...(consent ? { remindersConsent: ok } : {}) } }), onSuccess: () => { refresh(); onClose(); } });
  const f = (m.error as ApiError | null)?.fields ?? {};
  return <Sheet title={title} onClose={onClose}><form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
    {fields.map(([k, l]) => <Input key={k} label={l} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} error={f[k]} className={k === "address" || k === "name" ? "sm:col-span-2" : ""} />)}
    {numbers.map(([k, l]) => <Input key={k} label={l} inputMode="numeric" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, "") })} />)}
    {consent && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Customer agreed to receive payment reminders</label>}
    <div className="sm:col-span-2"><ErrorNote error={m.error} /></div><Button type="submit" loading={m.isPending}>Save</Button></form></Sheet>;
}
