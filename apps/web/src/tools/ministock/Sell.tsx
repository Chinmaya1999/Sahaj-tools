import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CHANNELS, PAYMENT_METHODS, calcSale, formatInr, paiseToRupees, rupeesToPaise } from "@ek/shared";
import { Alert, Button, Card, Input, Select, Spinner } from "../../components/ui";
import { ApiError, api, errMsg } from "../../lib/api";
import { ErrorNote, Rs, newKey, useDebounced, useMs, useRefreshAll, type Nav } from "./common";
import { Receipt } from "./Orders";
import { ScanButton } from "../../components/ScanButton";

interface Line { id: string; name: string; sku: string; available: number; qty: number; price: string; discount: string; taxPercent: number }

export function Sell({ go }: Nav) {
  const refresh = useRefreshAll();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const found = useMs<any>(`/products?limit=8${dq ? `&q=${encodeURIComponent(dq)}` : ""}`, !!dq);
  const customers = useMs<any>("/customers");
  const [cart, setCart] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState(""); const [channel, setChannel] = useState("shop"); const [fulfil, setFulfil] = useState<"now" | "later">("now");
  const [orderDisc, setOrderDisc] = useState(""); const [shipping, setShipping] = useState(""); const [cod, setCod] = useState(false); const [notes, setNotes] = useState("");
  const [payMethod, setPayMethod] = useState("cash"); const [received, setReceived] = useState(""); const [ref, setRef] = useState("");
  const [code, setCode] = useState(""); const [scanMsg, setScanMsg] = useState("");
  const key = useRef(newKey()); const [done, setDone] = useState<any>(null);

  const addProduct = (p: any) => { setCart((c) => (c.some((l) => l.id === p.id) ? c.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { id: p.id, name: p.name, sku: p.sku, available: p.available, qty: 1, price: paiseToRupees(p.pricePaise), discount: "", taxPercent: p.taxPercent ?? 0 }])); setQ(""); };
  async function addByCode(raw: string) {
    setScanMsg(""); const c = raw.trim(); if (!c) return;
    try { addProduct((await api<any>(`/ministock/products/barcode/${encodeURIComponent(c)}`)).product); setCode(""); }
    catch (err) { setScanMsg(err instanceof ApiError && err.code === "PRODUCT_NOT_FOUND" ? "Product not found. Retry the scan, or add it from Products." : errMsg(err)); }
  }
  const scan = (e: React.FormEvent) => { e.preventDefault(); void addByCode(code); };
  const upd = (id: string, patch: Partial<Line>) => setCart((c) => c.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // Preview only. The server recalculates every amount and its result is what is saved and shown on the receipt.
  const preview = useMemo(() => {
    if (!cart.length) return null;
    try { return calcSale(cart.map((l) => ({ quantity: l.qty, unitPricePaise: rupeesToPaise(l.price || "0"), discountPaise: rupeesToPaise(l.discount || "0"), taxPercent: l.taxPercent })), rupeesToPaise(orderDisc || "0"), rupeesToPaise(shipping || "0")); }
    catch (e: any) { return { error: e.message as string }; }
  }, [cart, orderDisc, shipping]);
  const total = preview && "totalPaise" in preview ? preview.totalPaise : 0;
  const receivedPaise = rupeesToPaise(received || "0");

  const m = useMutation({
    mutationFn: () => api<any>("/ministock/orders", {
      body: {
        lines: cart.map((l) => ({ itemId: l.id, quantity: l.qty, unitPricePaise: rupeesToPaise(l.price || "0"), discountPaise: rupeesToPaise(l.discount || "0") })),
        customerId: customerId || null, channel, fulfilment: fulfil, discountPaise: rupeesToPaise(orderDisc || "0"), shippingPaise: rupeesToPaise(shipping || "0"), cod, notes,
        payments: receivedPaise > 0 && payMethod !== "credit" ? [{ method: payMethod, amountPaise: receivedPaise, reference: ref }] : [], key: key.current,
      },
    }),
    onSuccess: (r) => { refresh(); setDone(r.order); },
  });
  const reset = () => { setDone(null); setCart([]); setReceived(""); setRef(""); setOrderDisc(""); setShipping(""); setNotes(""); setCustomerId(""); setCod(false); key.current = newKey(); m.reset(); };

  if (done) return <div className="space-y-4"><Alert tone="ok" title={`${done.number} saved`}>{done.status === "delivered" ? "Stock updated and sale recorded." : "Order confirmed and stock held for it."}</Alert><Receipt orderId={done.id} /><div className="flex gap-2"><Button onClick={reset}>New sale</Button><Button variant="secondary" onClick={() => go("orders")}>View orders</Button></div></div>;

  const err = m.error as ApiError | null;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-4">
        <Input label="Search product" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name, SKU, colour…" />
        {dq && (found.isLoading ? <Spinner /> : <ul className="space-y-1.5">{found.data?.products.length ? found.data.products.map((p: any) => (
          <li key={p.id}><button type="button" onClick={() => addProduct(p)} disabled={p.available < 1} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-card p-3 text-left hover:border-brand disabled:opacity-50"><span><b>{p.name}</b> <span className="text-sm text-ink-2">{[p.size, p.colour].filter(Boolean).join(" · ")} · {p.sku}</span></span><span className="text-right text-sm"><b>{formatInr(p.pricePaise)}</b><br /><span className="text-ink-2">{p.available} left</span></span></button></li>
        )) : <li className="text-sm text-ink-2">No match. Check the spelling or add it in Products.</li>}</ul>)}
        <form onSubmit={scan} className="flex items-end gap-2"><Input label="Scan barcode / QR" value={code} onChange={(e) => setCode(e.target.value)} className="flex-1" /><Button type="submit" variant="secondary">Add</Button><ScanButton onCode={(c) => void addByCode(c)} /></form>
        {scanMsg && <Alert tone="warn">{scanMsg}</Alert>}
        <h2 className="text-xl">Cart</h2>
        {!cart.length ? <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-2">Search or scan a product to start a sale.</p> : (
          <ul className="space-y-2">{cart.map((l) => (
            <li key={l.id}><Card className="p-3.5">
              <div className="flex justify-between gap-2"><p className="font-semibold">{l.name} <span className="text-xs font-normal text-ink-2">{l.sku}</span></p><button type="button" aria-label={`Remove ${l.name}`} className="h-8 w-8 rounded-lg text-ink-2 hover:bg-paper-2" onClick={() => setCart(cart.filter((x) => x.id !== l.id))}>✕</button></div>
              <div className="mt-2 grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                <div><span className="mb-1 block text-sm font-medium">Qty</span><div className="flex items-center gap-1"><button type="button" aria-label="Less" className="h-11 w-11 rounded-xl border border-line text-lg" onClick={() => upd(l.id, { qty: Math.max(1, l.qty - 1) })}>−</button><span className="w-9 text-center font-semibold">{l.qty}</span><button type="button" aria-label="More" className="h-11 w-11 rounded-xl border border-line text-lg" onClick={() => upd(l.id, { qty: l.qty + 1 })}>+</button></div></div>
                <Rs label="Price ₹" value={l.price} onChange={(v) => upd(l.id, { price: v })} /><Rs label="Discount ₹" value={l.discount} onChange={(v) => upd(l.id, { discount: v })} />
              </div>
              {fulfil === "now" && l.qty > l.available && <p className="mt-2 text-xs font-semibold text-bad">Only {l.available} available</p>}
            </Card></li>
          ))}</ul>
        )}
      </div>
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card className="space-y-3 p-4">
          <h2 className="text-xl">Checkout</h2>
          <Select label="Customer (optional)" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.data?.customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}</Select>
          <div className="grid grid-cols-2 gap-2"><Select label="Sold via" value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</Select>
            <Select label="Stock" value={fulfil} onChange={(e) => setFulfil(e.target.value as "now" | "later")}><option value="now">Hand over now</option><option value="later">Online order (hold stock)</option></Select></div>
          <div className="grid grid-cols-2 gap-2"><Rs label="Order discount ₹" value={orderDisc} onChange={setOrderDisc} /><Rs label="Shipping ₹" value={shipping} onChange={setShipping} /></div>
          {fulfil === "later" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} /> Cash on delivery (not counted as received until collected)</label>}
          <div className="rounded-xl bg-paper-2/60 p-3 text-sm">
            {preview && "error" in preview ? <p className="font-semibold text-bad">{preview.error}</p> : preview ? (<>
              <div className="flex justify-between"><span>Items</span><span>{formatInr(preview.subtotalPaise)}</span></div>
              {preview.orderDiscountPaise > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatInr(preview.orderDiscountPaise)}</span></div>}
              {preview.taxPaise > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatInr(preview.taxPaise)}</span></div>}
              {preview.shippingPaise > 0 && <div className="flex justify-between"><span>Shipping</span><span>{formatInr(preview.shippingPaise)}</span></div>}
              <div className="mt-1 flex justify-between border-t border-line pt-1 text-lg font-bold"><span>Total</span><span>{formatInr(preview.totalPaise)}</span></div>
              <p className="mt-1 text-xs text-ink-2">The server re-checks the total when you confirm.</p></>) : <p className="text-ink-2">Add products to see the total.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2"><Select label="Payment" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p === "credit" ? "Pay later (credit)" : p.toUpperCase()}</option>)}</Select>
            <Rs label="Amount received ₹" value={received} onChange={setReceived} /></div>
          {payMethod !== "cash" && payMethod !== "credit" && <Input label="Transaction reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />}
          <div className="flex flex-wrap gap-2"><Button variant="secondary" className="!min-h-9" onClick={() => setReceived(paiseToRupees(total))} disabled={!total}>Full amount</Button>{total > 0 && receivedPaise < total && <span className="self-center text-sm font-semibold text-warn">Customer will owe {formatInr(total - receivedPaise)}</span>}</div>
          {err && <Alert tone="bad">{err.message}{err.code === "INSUFFICIENT_STOCK" ? ` (asked ${err.body.requested}, only ${err.body.available} available)` : ""}</Alert>}
          <Button className="w-full" loading={m.isPending} disabled={!cart.length || !preview || "error" in preview} onClick={() => m.mutate()}>{fulfil === "now" ? "Confirm sale" : "Confirm order"}</Button>
          <ErrorNote error={null} />
        </Card>
      </div>
    </div>
  );
}
