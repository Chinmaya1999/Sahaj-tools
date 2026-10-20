import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatInr, paiseToRupees, rupeesToPaise } from "@ek/shared";
import { Alert, Badge, Button, Card, Empty, Input, Select, Spinner } from "../../components/ui";
import { useToast } from "../../components/toast";
import { api, errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { ErrorNote, Rs, Sheet, StatusBadge, newKey, useMs, useRefreshAll } from "./common";

export function Buying() {
  const re = useMs<any>("/reorder"); const pos = useMs<any>("/purchase-orders?limit=50"); const sup = useMs<any>("/suppliers");
  const [create, setCreate] = useState<any>(null); const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-2xl">Buying</h2><p className="text-sm text-ink-2">Purchase orders do not change stock. Stock rises only when you record what actually arrived.</p></div><Button onClick={() => setCreate({ lines: [] })}>+ Purchase order</Button></div>
      <Card className="p-4"><h3 className="text-lg">What to reorder</h3>{re.isLoading ? <Spinner /> : !re.data?.suggestions.length ? <p className="mt-1 text-sm text-ink-2">Nothing has reached its reorder point.</p> : (<>
        <ul className="mt-2 space-y-2">{re.data.suggestions.map((s: any) => <li key={s.itemId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-2.5 text-sm"><span><b>{s.name}</b> <span className="text-ink-2">{s.sku}</span><br /><span className="text-xs text-ink-2">{s.available} available{s.incoming ? ` + ${s.incoming} on order` : ""} · sells ~{s.avgDailyDemand}/day · reorder at {s.reorderPoint}</span></span><span className="flex items-center gap-2"><b>Buy {s.suggestedQty}</b><Button variant="secondary" className="!min-h-9" onClick={() => setCreate({ lines: [{ itemId: s.itemId, name: s.name, qty: String(s.suggestedQty), cost: paiseToRupees(s.unitCostPaise) }] })}>Order</Button></span></li>)}</ul>
        <p className="mt-2 text-xs text-ink-2">{re.data.note}</p></>)}</Card>
      <div><h3 className="mb-2 text-lg">Purchase orders</h3>{pos.isLoading ? <Spinner /> : !pos.data?.purchaseOrders.length ? <Empty title="No purchase orders yet" /> : <ul className="space-y-2">{pos.data.purchaseOrders.map((p: any) => <li key={p.id}><button type="button" className="w-full text-left" onClick={() => setOpen(p.id)}><Card className="flex flex-wrap items-center justify-between gap-2 p-3.5"><div><p className="font-semibold">{p.number} <StatusBadge status={p.status} /></p><p className="text-sm text-ink-2">{p.supplierName} · {fmtDate(p.createdAt)}</p></div><div className="text-right"><b>{formatInr(p.totalPaise)}</b>{p.balancePaise > 0 && <p className="text-xs font-semibold text-warn">You owe {formatInr(p.balancePaise)}</p>}</div></Card></button></li>)}</ul>}</div>
      {create && <CreatePO init={create} suppliers={sup.data?.suppliers ?? []} onClose={() => setCreate(null)} />}
      {open && <PODetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CreatePO({ init, suppliers, onClose }: { init: any; suppliers: any[]; onClose: () => void }) {
  const refresh = useRefreshAll(); const toast = useToast(); const prods = useMs<any>("/products?limit=200");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? ""); const [lines, setLines] = useState<{ itemId: string; name: string; qty: string; cost: string }[]>(init.lines); const [pick, setPick] = useState("");
  const m = useMutation({ mutationFn: () => api("/ministock/purchase-orders", { body: { supplierId, lines: lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.qty || 0), unitCostPaise: rupeesToPaise(l.cost || "0") })) } }), onSuccess: () => { refresh(); toast("Purchase order created", "ok"); onClose(); } });
  const total = lines.reduce((a, l) => a + Number(l.qty || 0) * rupeesToPaise(l.cost || "0"), 0);
  return <Sheet title="New purchase order" onClose={onClose} wide>
    {!suppliers.length ? <Alert tone="warn">Add a supplier first (People → Suppliers).</Alert> : <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      <Select label="Add product" value={pick} onChange={(e) => { const p = prods.data?.products.find((x: any) => x.id === e.target.value); if (p && !lines.some((l) => l.itemId === p.id)) setLines([...lines, { itemId: p.id, name: p.name, qty: "1", cost: paiseToRupees(p.costPaise) }]); setPick(""); }}><option value="">Choose…</option>{prods.data?.products.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</Select>
      {lines.map((l, i) => <div key={l.itemId} className="grid grid-cols-[1fr_5rem_6rem] items-end gap-2"><p className="text-sm font-semibold">{l.name}</p><Input label="Qty" inputMode="numeric" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))} /><Rs label="Cost ₹" value={l.cost} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: v } : x)))} /></div>)}
      <p className="text-lg font-semibold">Total {formatInr(total)}</p><ErrorNote error={m.error} /><Button type="submit" loading={m.isPending} disabled={!lines.length || !supplierId}>Create purchase order</Button></form>}
  </Sheet>;
}

function PODetail({ id, onClose }: { id: string; onClose: () => void }) {
  const refresh = useRefreshAll(); const toast = useToast(); const q = useMs<any>(`/purchase-orders/${id}`);
  const [mode, setMode] = useState<"" | "receive" | "pay">(""); const key = useState(newKey)[0];
  const [rec, setRec] = useState<Record<string, { a: string; r: string }>>({}); const [inv, setInv] = useState(""); const [amt, setAmt] = useState(""); const [method, setMethod] = useState("bank");
  const receive = useMutation({ mutationFn: () => api(`/ministock/purchase-orders/${id}/receive`, { body: { key, supplierInvoice: inv, lines: Object.entries(rec).map(([itemId, v]) => ({ itemId, accepted: Number(v.a || 0), rejected: Number(v.r || 0) })).filter((l) => l.accepted + l.rejected > 0) } }), onSuccess: () => { refresh(); toast("Stock received", "ok"); setMode(""); setRec({}); } });
  const pay = useMutation({ mutationFn: () => api(`/ministock/purchase-orders/${id}/payments`, { body: { amountPaise: rupeesToPaise(amt || "0"), method } }), onSuccess: () => { refresh(); toast("Payment recorded", "ok"); setMode(""); setAmt(""); } });
  const cancel = useMutation({ mutationFn: () => api(`/ministock/purchase-orders/${id}/cancel`, { body: {} }), onSuccess: () => { refresh(); onClose(); } });
  if (q.isLoading) return <Sheet title="Purchase order" onClose={onClose}><Spinner /></Sheet>; if (q.error) return <Sheet title="Purchase order" onClose={onClose}><Alert tone="bad">{errMsg(q.error)}</Alert></Sheet>;
  const p = q.data.purchaseOrder; const canReceive = ["ordered", "partially_received"].includes(p.status);
  return <Sheet title={p.number} onClose={onClose} wide>
    <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-ink-2"><StatusBadge status={p.status} /> {p.supplierName} · total {formatInr(p.totalPaise)} · received value {formatInr(p.receivedValuePaise)} · paid {formatInr(p.paidPaise)}{p.dueDate && ` · due ${fmtDate(p.dueDate)}`}</p>
    <ul className="divide-y divide-line rounded-xl border border-line text-sm">{p.lines.map((l: any) => <li key={l.itemId} className="flex flex-wrap justify-between gap-2 p-2.5"><span>{l.name} <span className="text-ink-2">{l.sku} · {formatInr(l.unitCostPaise)} each</span></span><span>ordered {l.orderedQty} · accepted {l.acceptedQty}{l.rejectedQty ? ` · rejected ${l.rejectedQty}` : ""} {l.outstandingQty > 0 && <Badge tone="warn">{l.outstandingQty} outstanding</Badge>}</span></li>)}</ul>
    <div className="mt-3 flex flex-wrap gap-2">{canReceive && <Button onClick={() => setMode("receive")}>Receive goods</Button>}{p.status !== "cancelled" && p.paidPaise < p.totalPaise && <Button variant="secondary" onClick={() => setMode("pay")}>Pay supplier</Button>}{["draft", "ordered"].includes(p.status) && !p.receivedValuePaise && <Button variant="ghost" onClick={() => cancel.mutate()}>Cancel order</Button>}</div>
    {mode === "receive" && <form className="mt-4 space-y-3 rounded-2xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); receive.mutate(); }}>
      <p className="text-sm text-ink-2">Enter what actually arrived. Only accepted goods go into stock; rejected (damaged, wrong) goods do not. Partial deliveries are fine.</p>
      {p.lines.filter((l: any) => l.outstandingQty > 0).map((l: any) => <div key={l.itemId} className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2"><p className="text-sm font-semibold">{l.name} <span className="font-normal text-ink-2">({l.outstandingQty} expected)</span></p><Input label="Accepted" inputMode="numeric" value={rec[l.itemId]?.a ?? ""} onChange={(e) => setRec({ ...rec, [l.itemId]: { a: e.target.value.replace(/\D/g, ""), r: rec[l.itemId]?.r ?? "" } })} /><Input label="Rejected" inputMode="numeric" value={rec[l.itemId]?.r ?? ""} onChange={(e) => setRec({ ...rec, [l.itemId]: { a: rec[l.itemId]?.a ?? "", r: e.target.value.replace(/\D/g, "") } })} /></div>)}
      <Input label="Supplier invoice number (optional)" value={inv} onChange={(e) => setInv(e.target.value)} /><ErrorNote error={receive.error} /><Button type="submit" loading={receive.isPending} disabled={!Object.values(rec).some((v) => Number(v.a) + Number(v.r) > 0)}>Add to stock</Button></form>}
    {mode === "pay" && <form className="mt-4 grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); pay.mutate(); }}><Rs label="Amount ₹" value={amt} onChange={setAmt} /><Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>{["bank", "upi", "cash", "card"].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select><div className="sm:col-span-2"><ErrorNote error={pay.error} /></div><Button type="submit" loading={pay.isPending}>Record payment</Button></form>}
    <ErrorNote error={cancel.error} />
  </Sheet>;
}
