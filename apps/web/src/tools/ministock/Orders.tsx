import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PAYMENT_METHODS, RETURN_CONDITIONS, RETURN_REASONS, formatInr, paiseToRupees, rupeesToPaise } from "@ek/shared";
import { Alert, Badge, Button, Card, Empty, Input, Select, Spinner } from "../../components/ui";
import { useToast } from "../../components/toast";
import { ApiError, api, errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { ScanButton } from "../../components/ScanButton";
import { canShare, shareText } from "../../lib/native";
import { ErrorNote, Rs, Sheet, StatusBadge, newKey, useDebounced, useMs, useRefreshAll, type Nav } from "./common";

const FILTERS: [string, string][] = [["", "All"], ["draft,confirmed,packed", "To dispatch"], ["shipped", "Shipped"], ["unpaid", "Unpaid"], ["delivered", "Delivered"], ["partially_returned,returned", "Returns"], ["cancelled", "Cancelled"]];

export function Orders({ go }: Nav) {
  const [f, setF] = useState(""); const [q, setQ] = useState(""); const dq = useDebounced(q); const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const qs = `?limit=20&page=${page}${f === "unpaid" ? "&unpaid=true" : f ? `&status=${f}` : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`;
  const list = useMs<any>(`/orders${qs}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3"><Input label="Search orders" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Order number or customer" className="min-w-[12rem] flex-1" /><Button onClick={() => go("sell")}>+ New sale</Button></div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="Order filter">{FILTERS.map(([k, t]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => { setF(k); setPage(1); }} className={`min-h-10 whitespace-nowrap rounded-full border px-4 text-sm font-semibold ${f === k ? "border-brand bg-brand-50 text-brand-700" : "border-line bg-card"}`}>{t}</button>)}</div>
      {list.isLoading ? <Spinner /> : list.error ? <Alert tone="bad">{errMsg(list.error)}</Alert> : !list.data.orders.length ? <Empty title="No orders here yet" /> : (
        <ul className="space-y-2">{list.data.orders.map((o: any) => (
          <li key={o.id}><button type="button" onClick={() => setOpen(o.id)} className="w-full text-left"><Card className="flex flex-wrap items-center justify-between gap-2 p-3.5">
            <div><p className="font-semibold">{o.number} <StatusBadge status={o.status} /></p><p className="text-sm text-ink-2">{o.customerName} · {fmtDate(o.createdAt)} · {o.lines.length} item{o.lines.length === 1 ? "" : "s"}</p></div>
            <div className="text-right"><p className="font-semibold">{formatInr(o.totalPaise)}</p>{o.outstandingPaise > 0 ? <p className="text-xs font-semibold text-warn">Owes {formatInr(o.outstandingPaise)}</p> : o.status !== "cancelled" && o.status !== "draft" && <p className="text-xs text-ok">Paid</p>}</div></Card></button></li>
        ))}</ul>
      )}
      {list.data && list.data.pages > 1 && <div className="flex items-center justify-center gap-3 text-sm"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button>Page {page} of {list.data.pages}<Button variant="ghost" disabled={page >= list.data.pages} onClick={() => setPage(page + 1)}>Next →</Button></div>}
      {open && <OrderSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Printable / shareable receipt. */
export function Receipt({ orderId }: { orderId: string }) {
  const q = useMs<any>(`/orders/${orderId}`);
  if (q.isLoading) return <Spinner />; if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  const { order: o, payments } = q.data;
  const text = `${o.number}\n${o.lines.map((l: any) => `${l.name} × ${l.quantity} = ${formatInr(l.totalPaise)}`).join("\n")}\nTotal ${formatInr(o.totalPaise)}\nPaid ${formatInr(o.paidPaise)}${o.outstandingPaise ? `\nBalance due ${formatInr(o.outstandingPaise)}` : ""}`;
  return (
    <div>
      <div className="print-area rounded-2xl border border-line bg-white p-5 text-sm">
        <div className="flex justify-between"><b className="text-lg">{o.number}</b><span>{fmtDate(o.createdAt)}</span></div><p className="text-ink-2">{o.customerName}</p>
        <table className="mt-3 w-full"><tbody>{o.lines.map((l: any) => <tr key={l.itemId} className="border-t border-line"><td className="py-1.5">{l.name}<br /><span className="text-xs text-ink-2">{l.sku} · {l.quantity} × {formatInr(l.unitPricePaise)}</span></td><td className="text-right">{formatInr(l.totalPaise)}</td></tr>)}</tbody></table>
        <div className="mt-2 space-y-0.5 border-t border-line pt-2">{o.discountPaise > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatInr(o.discountPaise)}</span></div>}{o.taxPaise > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatInr(o.taxPaise)}</span></div>}{o.shippingPaise > 0 && <div className="flex justify-between"><span>Shipping</span><span>{formatInr(o.shippingPaise)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatInr(o.totalPaise)}</span></div><div className="flex justify-between"><span>Paid</span><span>{formatInr(o.paidPaise)}</span></div>{o.outstandingPaise > 0 && <div className="flex justify-between font-semibold"><span>Balance due</span><span>{formatInr(o.outstandingPaise)}</span></div>}</div>
        {payments.length > 0 && <p className="mt-2 text-xs text-ink-2">{payments.map((p: any) => `${p.kind === "refund" ? "Refund" : "Paid"} ${formatInr(p.amountPaise)} by ${p.method}${p.status === "pending" ? " (pending)" : ""}`).join(" · ")}</p>}
      </div>
      <div className="no-print mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => window.print()}>Print</Button>{canShare() ? <Button variant="secondary" onClick={() => void shareText(text, o.number).catch(() => undefined)}>Share</Button> : null}<a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold hover:bg-paper-2" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>Share on WhatsApp</a></div>
    </div>
  );
}

function OrderSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast(); const refresh = useRefreshAll(); const q = useMs<any>(`/orders/${id}`);
  const [mode, setMode] = useState<"" | "pay" | "ship" | "cancel" | "return" | "pack" | "receipt">("");
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/ministock/orders/${id}/${path}`, { body: body ?? {} }), onSuccess: () => { refresh(); setMode(""); toast("Done", "ok"); } });
  if (q.isLoading) return <Sheet title="Order" onClose={onClose}><Spinner /></Sheet>;
  if (q.error) return <Sheet title="Order" onClose={onClose}><Alert tone="bad">{errMsg(q.error)}</Alert></Sheet>;
  const { order: o, payments, returns } = q.data; const st = o.status;
  return (
    <Sheet title={`${o.number}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2"><StatusBadge status={st} /><span className="text-sm text-ink-2">{o.customerName} · {o.channel} · {fmtDate(o.createdAt)}</span>{o.cod && <Badge tone="warn">COD</Badge>}</div>
      <ul className="divide-y divide-line rounded-xl border border-line text-sm">{o.lines.map((l: any) => <li key={l.itemId} className="flex justify-between gap-2 p-2.5"><span>{l.name} <span className="text-ink-2">{l.sku} · {l.quantity} × {formatInr(l.unitPricePaise)}{l.returnedQty ? ` · ${l.returnedQty} returned` : ""}</span></span><b>{formatInr(l.totalPaise)}</b></li>)}</ul>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><Card className="p-2.5"><p className="text-xs text-ink-2">Total</p><b>{formatInr(o.totalPaise)}</b></Card><Card className="p-2.5"><p className="text-xs text-ink-2">Paid</p><b>{formatInr(o.paidPaise - o.refundedPaise)}</b></Card><Card className="p-2.5"><p className="text-xs text-ink-2">{o.creditDuePaise ? "You owe" : "Owes you"}</p><b className={o.outstandingPaise ? "text-warn" : ""}>{formatInr(o.creditDuePaise || o.outstandingPaise)}</b></Card></div>
      {payments.length > 0 && <div className="mt-3"><h3 className="text-lg">Payments</h3><ul className="mt-1 space-y-1 text-sm">{payments.map((p: any) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span>{p.kind === "refund" ? "Refund" : "Payment"} · {p.method.toUpperCase()}{p.reference ? ` · ${p.reference}` : ""} · <StatusBadge status={p.status} /> <span className="text-xs text-ink-2">{p.verifiedByGateway ? "verified by gateway" : "recorded by you"}</span></span><span className="flex items-center gap-2"><b>{formatInr(p.amountPaise)}</b>{p.status === "pending" && <Button variant="secondary" className="!min-h-9" onClick={async () => { try { await api(`/ministock/payments/${p.id}/confirm`, { body: {} }); refresh(); } catch (e) { toast(errMsg(e), "bad"); } }}>{p.kind === "refund" ? "Mark refunded" : "Mark received"}</Button>}</span></li>)}</ul></div>}
      {returns.length > 0 && <div className="mt-3"><h3 className="text-lg">Returns</h3>{returns.map((r: any) => <ReturnRow key={r.id} r={r} />)}</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {st === "draft" && <Button onClick={() => act.mutate({ path: "confirm" })} loading={act.isPending}>Confirm order</Button>}
        {st === "confirmed" && <Button onClick={() => setMode("pack")}>Pack</Button>}
        {st === "packed" && <Button onClick={() => setMode("ship")}>Dispatch</Button>}
        {st === "shipped" && <Button onClick={() => act.mutate({ path: "deliver" })} loading={act.isPending}>Mark delivered</Button>}
        {o.outstandingPaise > 0 && !["cancelled", "draft"].includes(st) && <Button variant="secondary" onClick={() => setMode("pay")}>Record payment</Button>}
        {["shipped", "delivered", "partially_returned"].includes(st) && <Button variant="secondary" onClick={() => setMode("return")}>Return items</Button>}
        {!["cancelled", "returned", "partially_returned"].includes(st) && <Button variant="ghost" onClick={() => setMode("cancel")}>Cancel order</Button>}
        <Button variant="ghost" onClick={() => setMode("receipt")}>Receipt</Button>
      </div>
      <div className="mt-3"><ErrorNote error={act.error} /></div>
      {mode === "pay" && <PayForm order={o} onDone={() => { refresh(); setMode(""); }} />}
      {mode === "ship" && <ShipForm onSubmit={(b) => act.mutate({ path: "ship", body: b })} loading={act.isPending} />}
      {mode === "pack" && <PackForm order={o} onSubmit={(scans) => act.mutate({ path: "pack", body: { scans } })} loading={act.isPending} err={act.error as ApiError | null} />}
      {mode === "cancel" && <CancelForm onSubmit={(reason) => act.mutate({ path: "cancel", body: { reason } })} loading={act.isPending} />}
      {mode === "return" && <ReturnForm order={o} onDone={() => { refresh(); setMode(""); }} />}
      {mode === "receipt" && <div className="mt-4"><Receipt orderId={id} /></div>}
      <details className="mt-4 text-sm text-ink-2"><summary className="cursor-pointer">History</summary><ul className="mt-1 space-y-0.5">{o.history.map((h: any, i: number) => <li key={i}>{fmtDate(h.at)} · {h.status.replace(/_/g, " ")}{h.note ? ` · ${h.note}` : ""}</li>)}</ul></details>
    </Sheet>
  );
}

function ReturnRow({ r }: { r: any }) {
  const refresh = useRefreshAll(); const toast = useToast();
  const decide = async (index: number, condition: string) => { try { await api(`/ministock/returns/${r.id}/inspect`, { body: { decisions: [{ index, condition }] } }); refresh(); } catch (e) { toast(errMsg(e), "bad"); } };
  return <div className="mt-1 rounded-xl border border-line p-2.5 text-sm"><p className="font-semibold">{r.number} · {formatInr(r.returnedValuePaise)}</p>{r.lines.map((l: any) => <div key={l.index} className="mt-1 flex flex-wrap items-center justify-between gap-2"><span>{l.name} × {l.quantity} · {l.reason.replace(/_/g, " ")}</span>{l.condition === "pending" ? <span className="flex gap-1"><Button variant="secondary" className="!min-h-9" onClick={() => decide(l.index, "restockable")}>Put back in stock</Button><Button variant="ghost" className="!min-h-9" onClick={() => decide(l.index, "damaged")}>Damaged</Button></span> : <Badge tone={l.condition === "restockable" ? "ok" : "bad"}>{l.condition === "restockable" ? "restocked" : "damaged, not restocked"}</Badge>}</div>)}</div>;
}

function PayForm({ order, onDone }: { order: any; onDone: () => void }) {
  const [method, setMethod] = useState("cash"); const [amt, setAmt] = useState(paiseToRupees(order.outstandingPaise)); const [ref, setRef] = useState(""); const [pending, setPending] = useState(false);
  const m = useMutation({ mutationFn: () => api(`/ministock/orders/${order.id}/payments`, { body: { method, amountPaise: rupeesToPaise(amt || "0"), reference: ref, status: pending ? "pending" : "confirmed" } }), onSuccess: onDone });
  return <form className="mt-4 grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}><Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.filter((p) => p !== "credit").map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}</Select><Rs label="Amount ₹" value={amt} onChange={setAmt} /><Input label="Reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} /><label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} /> Not received yet (pending)</label><div className="sm:col-span-2"><ErrorNote error={m.error} /></div><Button type="submit" loading={m.isPending}>Save payment</Button></form>;
}
function ShipForm({ onSubmit, loading }: { onSubmit: (b: any) => void; loading: boolean }) {
  const [courier, setCourier] = useState(""); const [tracking, setTracking] = useState("");
  return <form className="mt-4 grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSubmit({ courier, tracking }); }}><Input label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} /><Input label="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} /><Button type="submit" loading={loading}>Dispatch order</Button></form>;
}
function PackForm({ order, onSubmit, loading, err }: { order: any; onSubmit: (scans: string[]) => void; loading: boolean; err: ApiError | null }) {
  const [scans, setScans] = useState<string[]>([]); const [c, setC] = useState("");
  return <div className="mt-4 rounded-2xl border border-line p-3"><p className="mb-2 text-sm text-ink-2">Scan each item to check the parcel (optional). Needed: {order.lines.map((l: any) => `${l.sku} × ${l.quantity}`).join(", ")}.</p>
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (c.trim()) { setScans([...scans, c.trim()]); setC(""); } }}><Input label="Scan item" value={c} onChange={(e) => setC(e.target.value)} className="flex-1" /><Button type="submit" variant="secondary">Add</Button><ScanButton onCode={(c) => setScans((x) => [...x, c])} /></form>
    {scans.length > 0 && <p className="mt-2 text-sm">Scanned {scans.length}: {scans.join(", ")} <button type="button" className="underline" onClick={() => setScans([])}>clear</button></p>}
    {err?.code === "PACK_MISMATCH" && <Alert tone="bad" title="Scans do not match this order">{err.body.missing?.length ? `Missing: ${err.body.missing.map((m: any) => `${m.sku} ×${m.missing}`).join(", ")}. ` : ""}{err.body.extra?.length ? `Extra: ${err.body.extra.map((m: any) => `${m.sku} ×${m.extra}`).join(", ")}. ` : ""}{err.body.wrongVariant?.length ? `Wrong item: ${err.body.wrongVariant.join(", ")}. ` : ""}{err.body.unknown?.length ? `Unknown code: ${err.body.unknown.join(", ")}.` : ""}</Alert>}
    <Button className="mt-3" onClick={() => onSubmit(scans)} loading={loading}>{scans.length ? "Verify and mark packed" : "Mark packed without scanning"}</Button></div>;
}
function CancelForm({ onSubmit, loading }: { onSubmit: (r: string) => void; loading: boolean }) {
  const [r, setR] = useState("");
  return <form className="mt-4 grid gap-3 rounded-2xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); onSubmit(r); }}><Input label="Reason for cancelling" value={r} onChange={(e) => setR(e.target.value)} required /><p className="text-xs text-ink-2">Held stock is released, shipped stock is put back with a record, and any money received becomes a pending refund.</p><Button type="submit" variant="danger" loading={loading}>Cancel this order</Button></form>;
}
function ReturnForm({ order, onDone }: { order: any; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, { qty: string; reason: string; condition: string }>>({}); const [refund, setRefund] = useState(true); const [method, setMethod] = useState("cash"); const key = useState(newKey)[0];
  const lines = order.lines.filter((l: any) => l.quantity - l.returnedQty > 0);
  const m = useMutation({ mutationFn: () => api("/ministock/returns", { body: { orderId: order.id, key, refund: refund ? { method } : null, lines: Object.entries(rows).filter(([, r]) => Number(r.qty) > 0).map(([itemId, r]) => ({ itemId, quantity: Number(r.qty), reason: r.reason, condition: r.condition })) } }), onSuccess: onDone });
  const set = (id: string, patch: Partial<{ qty: string; reason: string; condition: string }>) => setRows({ ...rows, [id]: { ...({ qty: "", reason: "defective", condition: "pending" } as { qty: string; reason: string; condition: string }), ...rows[id], ...patch } });
  return <form className="mt-4 space-y-3 rounded-2xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
    <h3 className="text-lg">Return items</h3>
    {lines.map((l: any) => <div key={l.itemId} className="grid grid-cols-[1fr_5rem] items-end gap-2 sm:grid-cols-[1fr_5rem_9rem_9rem]"><p className="col-span-2 text-sm font-semibold sm:col-span-1">{l.name} <span className="font-normal text-ink-2">(up to {l.quantity - l.returnedQty})</span></p>
      <Input label="Qty" inputMode="numeric" value={rows[l.itemId]?.qty ?? ""} onChange={(e) => set(l.itemId, { qty: e.target.value.replace(/\D/g, "") })} />
      <Select label="Reason" value={rows[l.itemId]?.reason ?? "defective"} onChange={(e) => set(l.itemId, { reason: e.target.value })}>{RETURN_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</Select>
      <Select label="Condition" value={rows[l.itemId]?.condition ?? "pending"} onChange={(e) => set(l.itemId, { condition: e.target.value })}>{RETURN_CONDITIONS.map((r) => <option key={r} value={r}>{r === "pending" ? "to inspect" : r}</option>)}</Select></div>)}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Refund money the customer has overpaid</label>
    {refund && <Select label="Refund method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.filter((p) => p !== "credit").map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}</Select>}
    <p className="text-xs text-ink-2">A refund does not put items back on the shelf. Only items you mark “restockable” (or approve after inspection) are added to stock.</p>
    <ErrorNote error={m.error} /><Button type="submit" loading={m.isPending} disabled={!Object.values(rows).some((r) => Number(r.qty) > 0)}>Record return</Button></form>;
}
