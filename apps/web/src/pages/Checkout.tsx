import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCTS, formatInr } from "@ek/shared";
import { api, errMsg } from "../lib/api";
import { useCatalog } from "../lib/data";
import { Alert, Badge, Button, Card, Input, LinkButton, Spinner } from "../components/ui";
import { fmtDate } from "../lib/format";

declare global { interface Window { Razorpay?: new (o: any) => { open(): void }; Cashfree?: (o: { mode: string }) => { checkout(o: any): Promise<any> } } }
const loadCashfree = () => new Promise<void>((res, rej) => {
  if (window.Cashfree) return res();
  const s = document.createElement("script"); s.src = "https://sdk.cashfree.com/js/v3/cashfree.js"; s.onload = () => res(); s.onerror = () => rej(new Error("Could not load the payment window")); document.body.appendChild(s);
});
const loadRazorpay = () => new Promise<void>((res, rej) => {
  if (window.Razorpay) return res();
  const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => res(); s.onerror = () => rej(new Error("Could not load the payment window")); document.body.appendChild(s);
});

export default function Checkout() {
  const { type, id } = useParams(); const nav = useNavigate(); const qc = useQueryClient();
  const cat = useCatalog();
  const item = type === "bundle" ? cat.data?.bundles.find((b) => b.id === id) : cat.data?.plans.find((p) => p.id === id);
  const plans = type === "bundle" ? (item as any)?.planIds?.map((pid: string) => cat.data?.plans.find((p) => p.id === pid)).filter(Boolean) : item ? [item] : [];
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [sandbox, setSandbox] = useState<null | { orderId: string }>(null);
  const [code, setCode] = useState(""); const [promo, setPromo] = useState<null | { code: string; discountPaise: number; finalPaise: number }>(null); const [promoErr, setPromoErr] = useState(""); const [promoBusy, setPromoBusy] = useState(false);

  if (cat.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!item || (type === "plan" && (item as any).kind === "free")) return <div className="mx-auto max-w-lg px-4 py-16"><Alert tone="bad">This item does not exist or is free.</Alert><LinkButton to="/pricing" className="mt-4">See pricing</LinkButton></div>;
  const available = (item as any).active !== false;
  const total = promo ? promo.finalPaise : item.pricePaise;
  async function applyCode() {
    setPromoErr(""); setPromoBusy(true);
    try { setPromo(await api<any>("/billing/promo", { body: { itemType: type, itemId: id, code } })); } catch (e) { setPromo(null); setPromoErr(errMsg(e)); } finally { setPromoBusy(false); }
  }

  const finish = (orderId: string) => { qc.invalidateQueries({ queryKey: ["access"] }); nav(`/account/orders/${orderId}`, { replace: true }); };
  async function verify(orderId: string, d: { paymentId?: string; signature?: string }) {
    await api("/billing/verify", { body: { orderId, paymentId: d.paymentId, signature: d.signature } });
  }
  async function pay() {
    setErr(""); setBusy(true);
    try {
      const r = await api<any>("/billing/checkout", { body: { itemType: type, itemId: id, code: promo?.code } });
      if (r.provider === "sandbox") { setSandbox({ orderId: r.order.id }); return; }
      if (r.provider === "cashfree") {
        await loadCashfree();
        const cf = window.Cashfree!({ mode: r.checkout.mode });
        const out = await cf.checkout({ paymentSessionId: r.checkout.paymentSessionId, redirectTarget: "_modal" });
        if (out?.error) await api("/billing/cancel", { body: { orderId: r.order.id } }).catch(() => {});
        else { try { await verify(r.order.id, {}); } catch { /* order page will show the real state */ } }
        finish(r.order.id); return;
      }
      await loadRazorpay();
      const rz = new window.Razorpay!({
        key: r.checkout.key, amount: r.checkout.amountPaise, currency: "INR", order_id: r.checkout.providerOrderId, name: "Sahaj", description: r.order.title,
        prefill: { name: r.user.name, email: r.user.email },
        handler: async (resp: any) => { try { await verify(r.order.id, { paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }); } catch { /* order page will show the real state */ } finish(r.order.id); },
        modal: { ondismiss: async () => { await api("/billing/cancel", { body: { orderId: r.order.id } }).catch(() => {}); setBusy(false); } },
      });
      rz.open();
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  async function sandboxPay(outcome: "success" | "fail" | "cancel") {
    if (!sandbox) return; setBusy(true); setErr("");
    try {
      const r = await api<any>("/billing/sandbox/complete", { body: { orderId: sandbox.orderId, outcome } });
      if (outcome === "success") await verify(sandbox.orderId, r);
      finish(sandbox.orderId);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-semibold">Checkout</h1>
      <Card className="p-6">
        <h2 className="text-xl">{(item as any).name}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {plans.map((p: any) => <li key={p.id} className="rounded-xl bg-paper p-3"><b>{PRODUCTS.find((x) => x.slug === p.product)?.name}</b> – {p.name}<br /><span className="text-ink-2">{p.blurb} {p.billing}.</span></li>)}
        </ul>
        <dl className="mt-5 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt>Price</dt><dd>{formatInr(item.pricePaise, { compact: false })}</dd></div>
          {promo && <div className="flex justify-between text-ok"><dt>Code {promo.code}</dt><dd>− {formatInr(promo.discountPaise, { compact: false })}</dd></div>}
          <div className="flex justify-between text-ink-2"><dt>Other charges</dt><dd>None. Any applicable tax is included in this price.</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-lg font-semibold"><dt>You pay</dt><dd>{formatInr(total, { compact: false })}</dd></div>
        </dl>
        {!sandbox && <div className="mt-4 flex items-end gap-2"><Input label="Promo code (optional)" className="flex-1" value={code} onChange={(e) => { setCode(e.target.value); setPromo(null); }} maxLength={30} error={promoErr} /><Button variant="secondary" loading={promoBusy} disabled={!code.trim()} onClick={applyCode}>Apply</Button></div>}
        {err && <div className="mt-4"><Alert tone="bad">{err}</Alert></div>}
        {!available && <div className="mt-4"><Alert tone="warn">This item is not currently available.</Alert></div>}
        {!sandbox ? (
          <Button className="mt-5 w-full" loading={busy} disabled={!available} onClick={pay}>Pay {formatInr(total, { compact: false })}</Button>
        ) : (
          <div className="mt-5 space-y-3 rounded-xl border-2 border-dashed border-warn/40 bg-warn-bg p-4">
            <Badge tone="warn">Sandbox payment – no real money moves</Badge>
            <p className="text-sm">This server is running with the development payment sandbox. Pick an outcome to test the full flow; the result is verified by the server exactly like a real payment.</p>
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={() => sandboxPay("success")}>Simulate successful payment</Button>
              <Button variant="secondary" disabled={busy} onClick={() => sandboxPay("fail")}>Simulate failure</Button>
              <Button variant="ghost" disabled={busy} onClick={() => sandboxPay("cancel")}>Cancel</Button>
            </div>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-2">Nothing renews automatically. See the <Link className="underline" to="/refunds">refund policy</Link>.</p>
      </Card>
    </div>
  );
}

export function OrderResult() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api<{ order: any }>(`/billing/orders/${id}`), refetchInterval: (s) => (s.state.data?.order.status === "pending" ? 3000 : false) });
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  if (q.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (q.error) return <div className="mx-auto max-w-lg px-4 py-16"><Alert tone="bad">{errMsg(q.error)}</Alert></div>;
  const o = q.data!.order;
  const tone = { paid: "ok", pending: "warn", failed: "bad", cancelled: "neutral", refunded: "neutral", disputed: "bad" }[o.status as string] as any;
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card className="p-6 text-center">
        <Badge tone={tone}>{o.status}</Badge>
        <h1 className="mt-3 text-3xl font-semibold">{o.status === "paid" ? "Payment confirmed" : o.status === "pending" ? "Waiting for confirmation" : o.status === "failed" ? "Payment did not go through" : o.status === "cancelled" ? "Checkout cancelled" : `Order ${o.status}`}</h1>
        <p className="mt-2 text-ink-2">{o.title} · {formatInr(o.amountPaise, { compact: false })}{o.receiptNo && <> · Receipt {o.receiptNo}</>}</p>
        {o.status === "pending" && <p className="mt-3 text-sm" aria-live="polite">We are confirming your payment with the provider{secs > 20 ? ". This is taking longer than usual – it will apply automatically once confirmed. If you were charged and nothing changes, contact support with this order number." : "…"}</p>}
        {o.status === "failed" && <p className="mt-3 text-sm">You have not been charged for a failed payment. You can try again.</p>}
        <p className="mt-2 text-xs text-ink-2">Order {o.id} · {fmtDate(o.createdAt)}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {o.status === "paid" && <><LinkButton to="/account/library">Open my library</LinkButton><LinkButton variant="secondary" to="/account/orders">All orders</LinkButton></>}
          {["failed", "cancelled"].includes(o.status) && <LinkButton to={`/checkout/${o.itemType}/${o.itemId}`}>Try again</LinkButton>}
          {["pending", "failed", "disputed"].includes(o.status) && <LinkButton variant="secondary" to="/contact">Contact support</LinkButton>}
        </div>
      </Card>
    </div>
  );
}
