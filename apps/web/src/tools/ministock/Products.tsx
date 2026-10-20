import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ADJUST_REASONS, formatInr, paiseToRupees, rupeesToPaise, suggestSku } from "@ek/shared";
import { Alert, Badge, Button, Card, Empty, Input, Select, Spinner } from "../../components/ui";
import { useToast } from "../../components/toast";
import { ApiError, api, errMsg } from "../../lib/api";
import { ErrorNote, Rs, Sheet, useDebounced, useMs, useRefreshAll, type Nav } from "./common";

const blank = { name: "", category: "", productType: "", ageGroup: "", colour: "", sku: "", barcode: "", supplier: "", cost: "", price: "", openingQty: "0", reorderLevel: "0", taxPercent: "0" };

export function Products({ go }: Nav) {
  const [q, setQ] = useState(""); const [low, setLow] = useState(false); const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useMs<any>(`/products?limit=25&page=${page}&low=${low}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`);
  const [form, setForm] = useState(false); const [adjust, setAdjust] = useState<any>(null); const [counting, setCounting] = useState(false); const [scan, setScan] = useState<any>(null);
  const [code, setCode] = useState(""); const [scanErr, setScanErr] = useState("");
  async function lookup(e: React.FormEvent) {
    e.preventDefault(); setScanErr(""); if (!code.trim()) return;
    try { setScan(await api(`/ministock/products/barcode/${encodeURIComponent(code.trim())}`)); }
    catch (err) { setScan(null); setScanErr(err instanceof ApiError && err.code === "PRODUCT_NOT_FOUND" ? "Product not found. Try the scan again, or add it as a new product. Nothing was created." : errMsg(err)); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input label="Search products" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, SKU, colour, size…" className="min-w-[12rem] flex-1" />
        <Button onClick={() => setForm(true)}>+ Add product</Button>
        <Button variant="secondary" onClick={() => setCounting(true)}>Count stock</Button>
      </div>
      <form onSubmit={lookup} className="flex items-end gap-2"><Input label="Scan barcode / QR or type SKU" value={code} onChange={(e) => setCode(e.target.value)} className="flex-1" /><Button type="submit" variant="secondary">Find</Button></form>
      {scanErr && <Alert tone="warn">{scanErr} <button type="button" className="font-semibold underline" onClick={() => setForm(true)}>Add product</button></Alert>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={low} onChange={(e) => { setLow(e.target.checked); setPage(1); }} /> Show only low stock</label>
      {list.isLoading ? <Spinner /> : list.error ? <Alert tone="bad">{errMsg(list.error)}</Alert> : !list.data.products.length ? <Empty title={q || low ? "No products match" : "No products yet"}>{!q && !low && <Button className="mt-3" onClick={() => setForm(true)}>Add your first product</Button>}</Empty> : (
        <ul className="space-y-2">
          {list.data.products.map((p: any) => (
            <li key={p.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
              <div className="min-w-0"><p className="font-semibold">{p.name} <span className="text-sm font-normal text-ink-2">{[p.size, p.colour, p.variant].filter(Boolean).join(" · ")}</span></p>
                <p className="text-xs text-ink-2">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""} · {formatInr(p.pricePaise)} <span className="opacity-70">(cost {formatInr(p.costPaise)})</span></p></div>
              <div className="flex items-center gap-2">
                <div className="text-right text-sm"><p className="text-lg font-semibold leading-none">{p.available}</p><p className="text-xs text-ink-2">available{p.reserved ? ` · ${p.reserved} held` : ""}</p></div>
                {p.reorderLevel > 0 && p.available <= p.reorderLevel && <Badge tone="warn">Low</Badge>}
                <Button variant="secondary" onClick={() => setAdjust(p)}>Adjust</Button>
              </div></Card></li>
          ))}
        </ul>
      )}
      {list.data && list.data.pages > 1 && <div className="flex items-center justify-center gap-3 text-sm"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button>Page {page} of {list.data.pages}<Button variant="ghost" disabled={page >= list.data.pages} onClick={() => setPage(page + 1)}>Next →</Button></div>}
      {form && <ProductForm onClose={() => setForm(false)} />}
      {adjust && <AdjustSheet product={adjust} onClose={() => setAdjust(null)} />}
      {counting && <CountSheet onClose={() => setCounting(false)} />}
      {scan && <Sheet title={scan.product.name} onClose={() => setScan(null)}>
        <p className="text-sm text-ink-2">{scan.product.sku} · {[scan.product.size, scan.product.colour].filter(Boolean).join(" · ")}</p>
        <div className="my-3 grid grid-cols-3 gap-2 text-center"><Card className="p-3"><p className="text-xs text-ink-2">On hand</p><p className="text-xl font-semibold">{scan.product.onHand}</p></Card><Card className="p-3"><p className="text-xs text-ink-2">Reserved</p><p className="text-xl font-semibold">{scan.product.reserved}</p></Card><Card className="p-3"><p className="text-xs text-ink-2">Available</p><p className="text-xl font-semibold">{scan.product.available}</p></Card></div>
        <p className="text-sm">Price {formatInr(scan.product.pricePaise)} · Cost {formatInr(scan.product.costPaise)}</p>
        <h3 className="mt-3 text-lg">Recent stock movements</h3><ul className="mt-1 space-y-1 text-sm">{scan.movements.map((m: any, i: number) => <li key={i} className="flex justify-between"><span>{m.type.replace(/_/g, " ")}{m.reason ? ` · ${m.reason}` : ""}</span><span className="font-semibold">{m.delta > 0 ? "+" : ""}{m.delta} → {m.qtyAfter}</span></li>)}</ul>
        <div className="mt-4 flex gap-2"><Button onClick={() => { setAdjust(scan.product); setScan(null); }}>Adjust stock</Button><Button variant="secondary" onClick={() => { go("sell"); }}>Sell</Button></div>
      </Sheet>}
    </div>
  );
}

function ProductForm({ onClose }: { onClose: () => void }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [f, setF] = useState(blank); const set = (k: keyof typeof blank) => (v: string) => setF({ ...f, [k]: v });
  const suggested = suggestSku({ name: f.name, ageGroup: f.ageGroup, size: "", colour: f.colour, productType: f.productType, variant: "" });
  const m = useMutation({
    mutationFn: () => api("/ministock/products", { body: { name: f.name, category: f.category, productType: f.productType, ageGroup: f.ageGroup, colour: f.colour, sku: f.sku || suggested, barcode: f.barcode, supplier: f.supplier, costPaise: rupeesToPaise(f.cost || "0"), pricePaise: rupeesToPaise(f.price || "0"), openingQty: Number(f.openingQty || 0), reorderLevel: Number(f.reorderLevel || 0), taxPercent: Number(f.taxPercent || 0) } }),
    onSuccess: () => { refresh(); toast("Product added", "ok"); onClose(); },
  });
  const fields = (m.error as ApiError | null)?.fields ?? {};
  const profit = f.cost && f.price ? rupeesToPaise(f.price) - rupeesToPaise(f.cost) : null;
  return (
    <Sheet title="Add product" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="grid gap-3 sm:grid-cols-2">
        <Input label="Product / design name" value={f.name} onChange={(e) => set("name")(e.target.value)} error={fields.name} className="sm:col-span-2" required />
        <Input label="Category" value={f.category} onChange={(e) => set("category")(e.target.value)} placeholder="e.g. Kids clothing" />
        <Input label="Product type" value={f.productType} onChange={(e) => set("productType")(e.target.value)} placeholder="e.g. Full sleeve shirt" />
        <Input label="Age / size / variant" value={f.ageGroup} onChange={(e) => set("ageGroup")(e.target.value)} placeholder="e.g. 0–6 months" />
        <Input label="Colour" value={f.colour} onChange={(e) => set("colour")(e.target.value)} placeholder="e.g. White" />
        <Rs label="Cost per unit (₹)" value={f.cost} onChange={set("cost")} error={fields.costPaise} />
        <Rs label="Selling price (₹)" value={f.price} onChange={set("price")} error={fields.pricePaise} hint={profit !== null ? `Margin ₹${paiseToRupees(profit)} per unit` : undefined} />
        <Input label="Opening stock" inputMode="numeric" value={f.openingQty} onChange={(e) => set("openingQty")(e.target.value.replace(/\D/g, ""))} error={fields.openingQty} />
        <Input label="Low-stock threshold" inputMode="numeric" value={f.reorderLevel} onChange={(e) => set("reorderLevel")(e.target.value.replace(/\D/g, ""))} hint="Also used as safety stock for reorder suggestions" />
        <Input label="SKU" value={f.sku} onChange={(e) => set("sku")(e.target.value)} placeholder={suggested || "Suggested automatically"} error={fields.sku} hint={suggested ? `Suggested: ${suggested}` : "Fill name, age/size, colour and type to get a suggestion"} />
        <Input label="Barcode / QR (optional)" value={f.barcode} onChange={(e) => set("barcode")(e.target.value)} hint="Must identify this exact variant" />
        <Input label="Supplier (optional)" value={f.supplier} onChange={(e) => set("supplier")(e.target.value)} />
        <Input label="Tax % on sale" inputMode="decimal" value={f.taxPercent} onChange={(e) => set("taxPercent")(e.target.value.replace(/[^0-9.]/g, ""))} />
        <div className="sm:col-span-2"><ErrorNote error={m.error} /></div>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={m.isPending}>Save product</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </Sheet>
  );
}

const REASON_LABEL: Record<string, string> = { correction: "Count correction", damage: "Damaged", loss: "Lost / stolen", found: "Found extra", expired: "Expired", other: "Other" };
function AdjustSheet({ product, onClose }: { product: any; onClose: () => void }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const [mode, setMode] = useState<"add" | "remove" | "set">("add"); const [qty, setQty] = useState(""); const [reason, setReason] = useState("correction"); const [note, setNote] = useState("");
  const reasons = ADJUST_REASONS.filter((r) => (mode === "add" ? r !== "damage" && r !== "loss" && r !== "expired" : mode === "remove" ? r !== "found" : r === "correction" || r === "other"));
  const m = useMutation({ mutationFn: () => api("/ministock/stock/adjust", { body: { itemId: product.id, mode, quantity: Number(qty || 0), reason, note } }), onSuccess: (r: any) => { refresh(); toast(`Stock now ${r.movement.qtyAfter} (was ${r.movement.before})`, "ok"); onClose(); } });
  return (
    <Sheet title={`Update stock · ${product.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-ink-2">{product.sku} · On hand {product.onHand}, held for orders {product.reserved}, available {product.available}. A reason is required and every change is recorded.</p>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="grid gap-3 sm:grid-cols-2">
        <Select label="What happened?" value={mode} onChange={(e) => { const v = e.target.value as typeof mode; setMode(v); setReason(v === "add" ? "correction" : v === "remove" ? "damage" : "correction"); }}><option value="add">Add stock</option><option value="remove">Remove stock</option><option value="set">Set to counted quantity</option></Select>
        <Input label={mode === "set" ? "Counted quantity" : "Quantity"} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} required />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}</Select>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="sm:col-span-2"><ErrorNote error={m.error} /></div>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={m.isPending}>Save change</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </Sheet>
  );
}

function CountSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast(); const refresh = useRefreshAll();
  const all = useMs<any>("/products?limit=200");
  const [counts, setCounts] = useState<Record<string, string>>({}); const [draft, setDraft] = useState<any>(null);
  const create = useMutation({ mutationFn: () => api<any>("/ministock/stock-counts", { body: { lines: Object.entries(counts).filter(([, v]) => v !== "").map(([itemId, v]) => ({ itemId, counted: Number(v) })) } }), onSuccess: (r) => setDraft(r.count) });
  const post = useMutation({ mutationFn: () => api<any>(`/ministock/stock-counts/${draft._id}/post`, { body: { confirm: true } }), onSuccess: (r) => { refresh(); toast(r.failed.length ? `Posted with ${r.failed.length} problem(s)` : "Stock count posted", r.failed.length ? "bad" : "ok"); onClose(); } });
  return (
    <Sheet title="Count stock" onClose={onClose} wide>
      {!draft ? (<>
        <p className="mb-3 text-sm text-ink-2">Enter what you physically counted. Leave a product blank to skip it. Nothing changes until you review and confirm.</p>
        {all.isLoading ? <Spinner /> : <ul className="space-y-1.5">{all.data.products.map((p: any) => <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-2"><span className="min-w-0 text-sm"><b>{p.name}</b> <span className="text-ink-2">{p.sku} · recorded {p.onHand}</span></span><input aria-label={`Counted ${p.name}`} inputMode="numeric" className="h-10 w-20 rounded-lg border border-line bg-paper/70 px-2 text-right" value={counts[p.id] ?? ""} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value.replace(/\D/g, "") })} /></li>)}</ul>}
        <div className="mt-3"><ErrorNote error={create.error} /></div>
        <Button className="mt-3" onClick={() => create.mutate()} loading={create.isPending} disabled={!Object.values(counts).some((v) => v !== "")}>Review differences</Button>
      </>) : (<>
        <p className="mb-3 text-sm text-ink-2">Count {draft.number}. Review each difference, then confirm to record it as stock movements.</p>
        <ul className="space-y-1.5 text-sm">{draft.lines.map((l: any) => <li key={l.sku} className="flex justify-between gap-2 rounded-xl border border-line p-2"><span>{l.name} <span className="text-ink-2">{l.sku}</span></span><span>{l.systemQty} → {l.countedQty} <b className={l.variance === 0 ? "" : l.variance < 0 ? "text-bad" : "text-ok"}>({l.variance > 0 ? "+" : ""}{l.variance})</b></span></li>)}</ul>
        <div className="mt-3"><ErrorNote error={post.error} /></div>
        <div className="mt-3 flex gap-2"><Button onClick={() => post.mutate()} loading={post.isPending}>Confirm and post</Button><Button variant="ghost" onClick={onClose}>Discard</Button></div>
      </>)}
    </Sheet>
  );
}
