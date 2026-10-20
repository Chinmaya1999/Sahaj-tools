import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { daysUntil, formatInr, parseCsv, rupeesToPaise, paiseToRupees } from "@ek/shared";
import { Alert, Badge, Button, Card, Empty, Input, Select, Spinner, Table, Td, Th, cx } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { useToast } from "../components/toast";
import { ApiError, api, errMsg } from "../lib/api";
import { useAccess } from "../lib/data";
import { download, fmtDate } from "../lib/format";
import type { TabId } from "./ministock/common";
import { Today } from "./ministock/Today";
import { Sell } from "./ministock/Sell";
import { Orders } from "./ministock/Orders";
import { Products } from "./ministock/Products";
import { People } from "./ministock/People";
import { Buying } from "./ministock/Buying";
import { Money } from "./ministock/Money";
import { Insights } from "./ministock/Insights";

type Tab = TabId | "dashboard" | "items" | "history" | "reports" | "import";
const TYPES: [string, string][] = [["stock_in", "Stock in (received)"], ["sale", "Sale"], ["stock_out", "Stock out (other)"], ["return", "Customer return"], ["damage", "Damaged / expired"], ["adjustment", "Adjustment"]];

export default function Inventory() {
  const [tab, setTab] = useState<Tab>("today");
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Inventory sections" className="flex gap-1.5 overflow-x-auto">
        {([["today", "Today"], ["sell", "Sell"], ["orders", "Orders"], ["products", "Products"], ["people", "People"], ["buying", "Buying"], ["money", "Money"], ["insights", "Insights"], ["dashboard", "Dashboard"], ["items", "Items"], ["history", "Movements"], ["reports", "Reports"], ["import", "Import / export"]] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-medium", tab === k ? "bg-ink text-white" : "bg-paper-2 hover:bg-line")}>{t}</button>)}
      </div>
      {tab === "today" && <Today go={setTab} />}{tab === "sell" && <Sell go={setTab} />}{tab === "orders" && <Orders go={setTab} />}{tab === "products" && <Products go={setTab} />}{tab === "people" && <People />}{tab === "buying" && <Buying />}{tab === "money" && <Money />}{tab === "insights" && <Insights />}
      {tab === "dashboard" && <Dashboard goItems={() => setTab("items")} />}{tab === "items" && <Items />}{tab === "history" && <History />}{tab === "reports" && <Reports />}{tab === "import" && <ImportExport />}
    </div>
  );
}

function Dashboard({ goItems }: { goItems: () => void }) {
  const q = useQuery({ queryKey: ["inv-dash"], queryFn: () => api<any>("/inventory/dashboard") });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  const d = q.data;
  const stat = (l: string, v: string | number, tone?: string) => <Card className="p-4"><p className="text-sm text-ink-2">{l}</p><p className={cx("text-2xl font-semibold", tone)}>{v}</p></Card>;
  if (!d.totals.skus) return <Empty title="No products yet"><Button onClick={goItems} className="mt-3">Add your first product</Button></Empty>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{stat("Products (SKUs)", d.totals.skus)}{stat("Units in stock", d.totals.units)}{stat("Stock value", formatInr(d.totals.valuePaise))}{stat("Low stock", d.totals.lowStock, d.totals.lowStock ? "text-warn" : "")}{stat("Expiring ≤ 30 days", d.totals.expiringSoon, d.totals.expiringSoon ? "text-warn" : "")}{stat("Expired in stock", d.totals.expired, d.totals.expired ? "text-bad" : "")}</div>
      <p className="text-xs text-ink-2">Valuation: {d.valuationMethod}{d.limit !== null && <> · Plan limit: {d.limit} products. <Link className="underline" to="/tools/inventory/about">Upgrade</Link></>}</p>
      <Alert>Expiry and low-stock lists are shown here when you open the app. Email or WhatsApp notifications are not available.</Alert>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4"><h2 className="mb-2 text-lg">Reorder suggestions</h2>{d.reorder.length ? <ul className="space-y-1 text-sm">{d.reorder.map((i: any) => <li key={i.id} className="flex justify-between gap-2"><span>{i.name} <span className="text-ink-2">({i.sku}) – {i.quantity} left</span></span><b>order ≈ {i.suggestedQty}</b></li>)}</ul> : <p className="text-sm text-ink-2">Nothing below its reorder level.</p>}<p className="mt-2 text-xs text-ink-2">Suggestion = enough to reach twice the reorder level.</p></Card>
        <Card className="p-4"><h2 className="mb-2 text-lg">Expiry watch</h2>{[...d.expired, ...d.expiring].length ? <ul className="space-y-1 text-sm">{[...d.expired, ...d.expiring].map((i: any) => { const days = daysUntil(i.expiryDate); return <li key={i.id} className="flex justify-between gap-2"><span>{i.name} ({i.quantity})</span>{days < 0 ? <Badge tone="bad">expired {-days}d ago</Badge> : <Badge tone="warn">in {days}d</Badge>}</li>; })}</ul> : <p className="text-sm text-ink-2">Nothing expiring in the next 30 days.</p>}</Card>
      </div>
      <Card className="p-4"><h2 className="mb-2 text-lg">Recent movements</h2><ul className="space-y-1 text-sm">{d.recent.map((m: any) => <li key={m.id} className="flex justify-between gap-2"><span>{m.item?.name ?? "—"} · {m.type.replace("_", " ")}</span><span className={m.delta > 0 ? "text-ok" : "text-bad"}>{m.delta > 0 ? "+" : ""}{m.delta} → {m.qtyAfter}</span></li>)}</ul></Card>
    </div>
  );
}

interface ItemForm { name: string; sku: string; barcode: string; category: string; supplier: string; price: string; cost: string; reorderLevel: string; expiryDate: string; size: string; colour: string; variant: string; openingQty: string }
const emptyForm: ItemForm = { name: "", sku: "", barcode: "", category: "", supplier: "", price: "", cost: "", reorderLevel: "0", expiryDate: "", size: "", colour: "", variant: "", openingQty: "0" };

function Items() {
  const qc = useQueryClient(); const toast = useToast();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all"); const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<null | { id?: string; v: ItemForm }>(null); const [move, setMove] = useState<any>(null);
  const items = useQuery({ queryKey: ["inv-items", q, filter, archived], queryFn: () => api<{ items: any[] }>(`/inventory/items?q=${encodeURIComponent(q)}&filter=${filter}&archived=${archived}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["inv-items"] }); qc.invalidateQueries({ queryKey: ["inv-dash"] }); qc.invalidateQueries({ queryKey: ["inv-mv"] }); qc.invalidateQueries({ queryKey: ["access"] }); };
  async function archive(i: any) { try { await api(`/inventory/items/${i.id}/archive`, { body: { archived: !i.archived } }); refresh(); } catch (e) { toast(errMsg(e), "bad"); } }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3"><Input label="Search name, SKU, barcode, category" className="min-w-60 flex-1" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All</option><option value="low">Low stock</option><option value="expiring">Expiring ≤ 30 days</option><option value="expired">Expired</option></Select>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived</label>
        <Button onClick={() => setForm({ v: emptyForm })}>+ New product</Button></div>
      {items.isLoading ? <Spinner /> : !items.data!.items.length ? <Empty title="No products match" /> : (
        <Table label="Products"><thead><tr><Th>Product</Th><Th>SKU</Th><Th>Qty</Th><Th>Price</Th><Th>Expiry</Th><Th>Actions</Th></tr></thead><tbody>
          {items.data!.items.map((i) => { const low = i.reorderLevel > 0 && i.quantity <= i.reorderLevel; const days = i.expiryDate ? daysUntil(i.expiryDate) : null; return (
            <tr key={i.id}><Td><p className="font-medium">{i.name}</p><p className="text-xs text-ink-2">{[i.category, i.size, i.colour, i.variant].filter(Boolean).join(" · ")}</p></Td><Td>{i.sku}</Td>
              <Td><b className={low ? "text-warn" : ""}>{i.quantity}</b> {low && <Badge tone="warn">low</Badge>}</Td><Td>{formatInr(i.pricePaise, { compact: false })}</Td>
              <Td>{i.expiryDate ? <>{fmtDate(i.expiryDate)} {days! < 0 ? <Badge tone="bad">expired</Badge> : days! <= 30 ? <Badge tone="warn">{days}d</Badge> : null}</> : "—"}</Td>
              <Td><div className="flex flex-wrap gap-1.5">{!i.archived && <Button variant="secondary" onClick={() => setMove(i)}>Update stock</Button>}<Button variant="ghost" onClick={() => setForm({ id: i.id, v: { ...emptyForm, name: i.name, sku: i.sku, barcode: i.barcode ?? "", category: i.category ?? "", supplier: i.supplier ?? "", price: paiseToRupees(i.pricePaise), cost: paiseToRupees(i.costPaise), reorderLevel: String(i.reorderLevel ?? 0), expiryDate: i.expiryDate?.slice(0, 10) ?? "", size: i.size ?? "", colour: i.colour ?? "", variant: i.variant ?? "" } })}>Edit</Button><Button variant="ghost" onClick={() => archive(i)}>{i.archived ? "Restore" : "Archive"}</Button></div></Td></tr>); })}</tbody></Table>)}
      {form && <ItemModal init={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
      {move && <MoveModal item={move} onClose={() => setMove(null)} onSaved={() => { setMove(null); refresh(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
    <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-t-3xl bg-paper p-5 shadow-lift sm:rounded-3xl"><div className="mb-3 flex items-center justify-between"><h2 className="text-2xl">{title}</h2><button aria-label="Close" className="h-10 w-10 rounded-lg hover:bg-paper-2" onClick={onClose}>✕</button></div>{children}</div></div>;
}

function ItemModal({ init, onClose, onSaved }: { init: { id?: string; v: ItemForm }; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(init.v); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [upgrade, setUpgrade] = useState(false);
  const set = (k: keyof ItemForm) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const body: any = { name: v.name, sku: v.sku, barcode: v.barcode, category: v.category, supplier: v.supplier, pricePaise: rupeesToPaise(v.price || "0"), costPaise: rupeesToPaise(v.cost || "0"), reorderLevel: Number(v.reorderLevel || 0), expiryDate: v.expiryDate || null, size: v.size, colour: v.colour, variant: v.variant };
      if (!init.id) body.openingQty = Number(v.openingQty || 0);
      await (init.id ? api(`/inventory/items/${init.id}`, { method: "PUT", body }) : api("/inventory/items", { body }));
      onSaved();
    } catch (x) { setUpgrade(x instanceof ApiError && x.status === 402); setErr(x instanceof Error && /Invalid|decimal/i.test(x.message) ? "Check the price and cost – use numbers like 249.50." : errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Modal title={init.id ? "Edit product" : "New product"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {err && <Alert tone={upgrade ? "warn" : "bad"}>{err} {upgrade && <Link className="font-semibold underline" to="/tools/inventory/about">See plans</Link>}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Name" value={v.name} onChange={set("name")} required /><Input label="SKU" value={v.sku} onChange={set("sku")} required hint="Unique per account" /><Input label="Selling price ₹" inputMode="decimal" value={v.price} onChange={set("price")} /><Input label="Cost price ₹" inputMode="decimal" value={v.cost} onChange={set("cost")} />
          {!init.id && <Input label="Opening stock" inputMode="numeric" value={v.openingQty} onChange={set("openingQty")} />}<Input label="Reorder level" inputMode="numeric" value={v.reorderLevel} onChange={set("reorderLevel")} hint="Low-stock warning at or below this" />
          <Input label="Category" value={v.category} onChange={set("category")} /><Input label="Supplier" value={v.supplier} onChange={set("supplier")} /><Input label="Barcode" value={v.barcode} onChange={set("barcode")} /><Input label="Expiry date (optional)" type="date" value={v.expiryDate} onChange={set("expiryDate")} />
          <Input label="Size" value={v.size} onChange={set("size")} /><Input label="Colour" value={v.colour} onChange={set("colour")} /><Input className="sm:col-span-2" label="Variant" value={v.variant} onChange={set("variant")} /></div>
        {init.id && <p className="text-xs text-ink-2">Quantity changes are made with “Update stock” so the history stays accurate.</p>}
        <div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button></div>
      </form>
    </Modal>
  );
}

function MoveModal({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState("sale"); const [qty, setQty] = useState("1"); const [note, setNote] = useState(""); const [cost, setCost] = useState(paiseToRupees(item.costPaise)); const [dir, setDir] = useState("increase");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api(`/inventory/items/${item.id}/movements`, { body: { type, quantity: Number(qty), note, ...(type === "stock_in" ? { unitCostPaise: rupeesToPaise(cost || "0") } : {}), ...(type === "adjustment" ? { direction: dir } : {}) } }); onSaved(); }
    catch (x) { setErr(x instanceof ApiError && x.code === "insufficient_stock" ? `Not enough stock – only ${item.quantity} on hand.` : errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Update stock – ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-sm text-ink-2">On hand now: <b className="text-ink">{item.quantity}</b></p>{err && <Alert tone="bad">{err}</Alert>}
        <Select label="What happened?" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select>
        {type === "adjustment" && <Select label="Direction" value={dir} onChange={(e) => setDir(e.target.value)}><option value="increase">Increase (found extra)</option><option value="decrease">Decrease (count was lower)</option></Select>}
        <Input label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />{type === "stock_in" && <Input label="Unit cost ₹ (updates average cost)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />}
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <div className="flex gap-2"><Button type="submit" loading={busy}>Record</Button><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button></div>
      </form>
    </Modal>
  );
}

function History() {
  const q = useQuery({ queryKey: ["inv-mv"], queryFn: () => api<{ movements: any[] }>("/inventory/movements?limit=200") });
  const toast = useToast();
  async function csv() { try { const r = await fetch("/api/inventory/movements.csv", { credentials: "include" }); download(await r.blob(), "stock-movements.csv"); } catch (e) { toast(errMsg(e), "bad"); } }
  if (q.isLoading) return <Spinner />;
  return <div className="space-y-3"><div className="flex justify-between"><p className="text-sm text-ink-2">Every stock change is recorded and cannot be edited.</p><Button variant="secondary" onClick={csv}>Export CSV</Button></div>
    {!q.data!.movements.length ? <Empty title="No movements yet" /> : <Table label="Stock movements"><thead><tr><Th>When</Th><Th>Product</Th><Th>Type</Th><Th>Change</Th><Th>After</Th><Th>Note</Th></tr></thead><tbody>{q.data!.movements.map((m) => <tr key={m.id}><Td>{new Date(m.at).toLocaleString("en-IN")}</Td><Td>{m.item?.name} <span className="text-xs text-ink-2">{m.item?.sku}</span></Td><Td>{m.type.replace("_", " ")}</Td><Td className={m.delta > 0 ? "text-ok" : "text-bad"}>{m.delta > 0 ? "+" : ""}{m.delta}</Td><Td>{m.qtyAfter}</Td><Td>{m.note}</Td></tr>)}</tbody></Table>}</div>;
}

function Reports() {
  const [days, setDays] = useState(30);
  const acc = useAccess(); const allowed = !!acc.get("inventory")?.limits.reports;
  const q = useQuery({ queryKey: ["inv-reports", days], queryFn: () => api<any>(`/inventory/reports?days=${days}`), retry: false, enabled: allowed });
  if (acc.isLoading || (allowed && q.isLoading)) return <Spinner />;
  if (!allowed || (q.error instanceof ApiError && q.error.status === 402)) return (
    <Card className="mx-auto max-w-xl space-y-3 p-6 text-center"><span aria-hidden className="text-4xl">📈</span><h2 className="text-2xl">Know what makes you money</h2>
      <p className="text-ink-2">Sales and profit reports show your best sellers, what is sitting unsold, and where your stock money is tied up.</p>
      <ul className="mx-auto max-w-sm space-y-1 text-left text-sm"><li>✓ Top sellers by profit</li><li>✓ Dead stock you can discount or stop buying</li><li>✓ Stock value by category</li></ul>
      <Link to="/tools/inventory/about" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-(--color-on-brand)">Unlock reports with Pro</Link></Card>);
  if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  const d = q.data; const max = Math.max(1, ...d.categories.map((c: any) => c.valuePaise));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><Select label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}</Select><p className="max-w-md text-xs text-ink-2">{d.note}</p></div>
      <div className="grid grid-cols-3 gap-3"><Card className="p-4"><p className="text-sm text-ink-2">Units sold</p><p className="text-2xl font-semibold">{d.totals.units}</p></Card><Card className="p-4"><p className="text-sm text-ink-2">Est. revenue</p><p className="text-2xl font-semibold">{formatInr(d.totals.revenuePaise)}</p></Card><Card className="p-4"><p className="text-sm text-ink-2">Est. profit</p><p className="text-2xl font-semibold text-ok">{formatInr(d.totals.profitPaise)}</p></Card></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4"><h2 className="mb-2 text-lg">Top sellers</h2>{d.top.length ? <ul className="space-y-1 text-sm">{d.top.map((t: any) => <li key={t.id} className="flex justify-between gap-2"><span>{t.name} <span className="text-ink-2">× {t.units}</span></span><b className="text-ok">{formatInr(t.profitPaise)}</b></li>)}</ul> : <p className="text-sm text-ink-2">No sales recorded in this period.</p>}</Card>
        <Card className="p-4"><h2 className="mb-2 text-lg">Not selling (money sitting on the shelf)</h2>{d.dead.length ? <ul className="space-y-1 text-sm">{d.dead.map((t: any) => <li key={t.id} className="flex justify-between gap-2"><span>{t.name} <span className="text-ink-2">({t.quantity} in stock)</span></span><b>{formatInr(t.valuePaise)}</b></li>)}</ul> : <p className="text-sm text-ink-2">Everything in stock sold at least once. 🎉</p>}</Card>
      </div>
      <Card className="p-4"><h2 className="mb-3 text-lg">Stock value by category</h2><ul className="space-y-2 text-sm">{d.categories.map((c: any) => <li key={c.name}><div className="flex justify-between"><span>{c.name}</span><b>{formatInr(c.valuePaise)}</b></div><div className="mt-1 h-2 rounded bg-paper-2"><div className="h-2 rounded bg-brand" style={{ width: `${(c.valuePaise / max) * 100}%` }} /></div></li>)}</ul></Card>
    </div>
  );
}

const FIELDS = ["name", "sku", "barcode", "category", "supplier", "price", "cost", "quantity", "reorder_level", "expiry_date", "size", "colour", "variant"] as const;
const ALIASES: Record<string, string[]> = { name: ["name", "product", "item", "product name"], sku: ["sku", "code", "item code"], price: ["price", "mrp", "selling price", "sp"], cost: ["cost", "cost price", "cp"], quantity: ["quantity", "qty", "stock", "opening stock"], reorder_level: ["reorder_level", "reorder level", "min", "min stock"], expiry_date: ["expiry_date", "expiry", "expiry date", "exp"], colour: ["colour", "color"] };

function ImportExport() {
  const toast = useToast(); const qc = useQueryClient();
  const [csv, setCsv] = useState<string[][] | null>(null); const [map, setMap] = useState<Record<string, number>>({}); const [report, setReport] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function onFile(files: File[]) {
    const f = files[0]; if (!f) return; setReport(null); setErr("");
    if (f.size > 2 * 1024 * 1024) return setErr("That file is over 2 MB. Split it into smaller files.");
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return setErr("The file needs a header row and at least one data row.");
    const head = rows[0].map((h) => h.trim().toLowerCase()); const m: Record<string, number> = {};
    for (const field of FIELDS) { const idx = head.findIndex((h) => h === field || (ALIASES[field] ?? []).includes(h)); if (idx >= 0) m[field] = idx; }
    setMap(m); setCsv(rows);
  }
  const rowsPayload = () => csv!.slice(1).map((r) => Object.fromEntries(FIELDS.filter((f) => map[f] !== undefined && map[f] >= 0).map((f) => [f, r[map[f]] ?? ""])));
  async function run(commit: boolean) {
    setBusy(true); setErr("");
    try { const r = await api<any>("/inventory/import", { body: { rows: rowsPayload(), commit } }); setReport(r); if (commit) { toast(`Imported ${r.created} product(s)`); qc.invalidateQueries({ queryKey: ["inv-items"] }); qc.invalidateQueries({ queryKey: ["inv-dash"] }); qc.invalidateQueries({ queryKey: ["access"] }); } }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  async function exportCsv() { try { const r = await fetch("/api/inventory/export.csv", { credentials: "include" }); download(await r.blob(), "inventory.csv"); } catch (e) { toast(errMsg(e), "bad"); } }
  return (
    <div className="space-y-5">
      <Card className="space-y-2 p-4"><h2 className="text-lg">Export / backup</h2><p className="text-sm text-ink-2">Download all active products as a CSV that opens in Excel or Google Sheets. The same file can be imported again to restore your product list into an empty account (quantities are restored as opening stock; movement history is exported separately).</p><Button variant="secondary" onClick={exportCsv}>Download inventory.csv</Button></Card>
      <Card className="space-y-3 p-4"><h2 className="text-lg">Import CSV</h2><p className="text-sm text-ink-2">Required columns: <b>name</b>, <b>sku</b>. Existing SKUs are skipped, never overwritten. Prices are in rupees; dates are YYYY-MM-DD. Starter templates come with <Link className="underline" to="/tools/inventory/about">Inventory Pro</Link>.</p>
        <Dropzone accept=".csv,text/csv" onFiles={onFile} label="Choose a CSV file" />{err && <Alert tone="bad">{err}</Alert>}
        {csv && <><h3 className="text-base">1. Match columns</h3><div className="grid gap-2 sm:grid-cols-3">{FIELDS.map((f) => <Select key={f} label={f.replace("_", " ") + (f === "name" || f === "sku" ? " *" : "")} value={map[f] ?? -1} onChange={(e) => setMap({ ...map, [f]: Number(e.target.value) })}><option value={-1}>— not in file —</option>{csv[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</Select>)}</div>
          <Button loading={busy} disabled={map.name === undefined || map.sku === undefined || map.name < 0 || map.sku < 0} onClick={() => run(false)}>2. Check file (preview)</Button></>}
        {report && <div className="space-y-3"><p className="text-sm" aria-live="polite"><b>{report.summary.ok}</b> ready · <b className="text-bad">{report.summary.errors}</b> with errors · <b>{report.summary.skipped}</b> skipped {report.committed && <> · <b className="text-ok">{report.created} imported</b></>}</p>
          {report.report.some((r: any) => r.status !== "ok") && <Table label="Rows needing attention"><thead><tr><Th>Row</Th><Th>SKU</Th><Th>Problem</Th></tr></thead><tbody>{report.report.filter((r: any) => r.status !== "ok").slice(0, 100).map((r: any) => <tr key={r.row}><Td>{r.row}</Td><Td>{r.sku}</Td><Td className={r.status === "error" ? "text-bad" : "text-ink-2"}>{r.message}</Td></tr>)}</tbody></Table>}
          {!report.committed && report.summary.ok > 0 && <Button loading={busy} onClick={() => run(true)}>3. Import {report.summary.ok} product(s){report.summary.errors ? " (rows with errors are left out)" : ""}</Button>}</div>}
      </Card>
    </div>
  );
}
