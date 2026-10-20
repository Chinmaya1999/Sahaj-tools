import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessProfileSchema, calculateDocument, formatInr, paymentStatus, rupeesToPaise, paiseToRupees, type DiscountInput } from "@ek/shared";
import { Alert, Badge, Button, Card, Empty, Input, LinkButton, Select, Spinner, Table, Td, Textarea, Th, cx } from "../components/ui";
import { useToast } from "../components/toast";
import { api, ApiError, errMsg } from "../lib/api";
import { useAccess } from "../lib/data";
import { download, fmtDate } from "../lib/format";
import { buildInvoicePdf, type BizView, type DocView } from "./invoicePdf";

type View = { mode: "list" } | { mode: "edit"; id?: string; kind: "invoice" | "quotation" } | { mode: "detail"; id: string } | { mode: "business" };

export default function Invoice() {
  const [view, setView] = useState<View>({ mode: "list" });
  const biz = useQuery({ queryKey: ["business"], queryFn: () => api<{ business: BizView | null }>("/invoices/business") });
  if (biz.isLoading) return <Spinner />;
  if (!biz.data?.business && view.mode !== "business") return <BusinessForm first onDone={() => setView({ mode: "list" })} />;
  if (view.mode === "business") return <BusinessForm onDone={() => setView({ mode: "list" })} />;
  if (view.mode === "edit") return <Editor {...view} biz={biz.data!.business!} onDone={(id) => setView(id ? { mode: "detail", id } : { mode: "list" })} />;
  if (view.mode === "detail") return <Detail id={view.id} biz={biz.data!.business!} onBack={() => setView({ mode: "list" })} onEdit={(kind) => setView({ mode: "edit", id: view.id, kind })} onOpen={(id) => setView({ mode: "detail", id })} />;
  return <List onNew={(kind) => setView({ mode: "edit", kind })} onOpen={(id) => setView({ mode: "detail", id })} onBusiness={() => setView({ mode: "business" })} />;
}

function BusinessForm({ first, onDone }: { first?: boolean; onDone: () => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["business"], queryFn: () => api<{ business: any }>("/invoices/business") });
  const [v, setV] = useState<any>({ name: "", address: "", phone: "", email: "", taxId: "", taxLabel: "GSTIN", logoDataUrl: "", invoicePrefix: "INV", quotePrefix: "QT", defaultTaxPercent: 0, defaultNotes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data?.business) setV({ ...v, ...q.data.business }); }, [q.data]);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.value });
  const save = useMutation({ mutationFn: (b: unknown) => api("/invoices/business", { method: "PUT", body: b }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["business"] }); toast("Business details saved"); onDone(); }, onError: (e) => toast(errMsg(e), "bad") });
  function submit(e: React.FormEvent) {
    e.preventDefault(); const r = businessProfileSchema.safeParse({ ...v, defaultTaxPercent: Number(v.defaultTaxPercent) });
    if (!r.success) { const m: Record<string, string> = {}; r.error.issues.forEach((i) => (m[String(i.path[0])] ??= i.message)); setErrors(m); return; }
    setErrors({}); save.mutate(r.data);
  }
  function logo(f?: File) {
    if (!f) return; if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 200 * 1024) return toast("Logo must be a PNG, JPEG or WebP under 200 KB", "bad");
    const r = new FileReader(); r.onload = () => setV({ ...v, logoDataUrl: String(r.result) }); r.readAsDataURL(f);
  }
  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4" noValidate>
      <h2 className="text-2xl">{first ? "First, tell us about your business" : "Business details"}</h2>
      {first && <p className="text-sm text-ink-2">These appear on every invoice and quotation. You can change them later.</p>}
      <Input label="Business name" value={v.name} onChange={set("name")} error={errors.name} />
      <Textarea label="Address" rows={2} value={v.address} onChange={set("address")} /><div className="grid gap-3 sm:grid-cols-2"><Input label="Phone" value={v.phone} onChange={set("phone")} /><Input label="Email" type="email" value={v.email} onChange={set("email")} error={errors.email} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><Input label="Tax label" value={v.taxLabel} onChange={set("taxLabel")} hint="e.g. GSTIN" /><Input label="Tax registration number (optional)" value={v.taxId} onChange={set("taxId")} /></div>
      <div className="grid gap-3 sm:grid-cols-3"><Input label="Invoice prefix" value={v.invoicePrefix} onChange={set("invoicePrefix")} error={errors.invoicePrefix} /><Input label="Quotation prefix" value={v.quotePrefix} onChange={set("quotePrefix")} error={errors.quotePrefix} /><Input label="Default tax %" inputMode="decimal" value={v.defaultTaxPercent} onChange={set("defaultTaxPercent")} hint="Pre-filled on new lines; change per line" /></div>
      <Textarea label="Default notes / payment terms" rows={2} value={v.defaultNotes} onChange={set("defaultNotes")} />
      <div><label htmlFor="logo" className="mb-1 block text-sm font-medium">Logo (optional)</label><input id="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => logo(e.target.files?.[0])} className="text-sm" />{v.logoDataUrl && <img src={v.logoDataUrl} alt="Logo preview" className="mt-2 h-14" />}</div>
      <Alert>The tool does the maths and layout. It cannot confirm that a document meets every legal or tax requirement – please check the rules that apply to you.</Alert>
      <div className="flex gap-2"><Button type="submit" loading={save.isPending}>Save</Button>{!first && <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>}</div>
    </form>
  );
}

const statusTone = (s: string) => ({ paid: "ok", partial: "warn", overdue: "bad", unpaid: "neutral", accepted: "ok", void: "neutral", draft: "neutral", issued: "brand", rejected: "bad" } as const)[s as "paid"] ?? "neutral";

function List({ onNew, onOpen, onBusiness }: { onNew: (k: "invoice" | "quotation") => void; onOpen: (id: string) => void; onBusiness: () => void }) {
  const [kind, setKind] = useState<"invoice" | "quotation">("invoice"); const [q, setQ] = useState(""); const [status, setStatus] = useState("all");
  const access = useAccess().get("invoice"); const toast = useToast();
  const list = useQuery({ queryKey: ["invoices", kind, q, status], queryFn: () => api<{ items: any[] }>(`/invoices?kind=${kind}&q=${encodeURIComponent(q)}&status=${status}`) });
  async function exportCsv() { try { const r = await fetch("/api/invoices/export.csv", { credentials: "include" }); download(await r.blob(), "documents.csv"); } catch (e) { toast(errMsg(e), "bad"); } }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Document type" className="flex gap-1.5">{(["invoice", "quotation"] as const).map((k) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setStatus("all"); }} className={cx("min-h-10 rounded-lg px-4 text-sm font-medium", kind === k ? "bg-ink text-white" : "bg-paper-2 hover:bg-line")}>{k === "invoice" ? "Invoices" : "Quotations"}</button>)}</div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => onNew(kind)}>+ New {kind}</Button><Button variant="secondary" onClick={exportCsv}>Export CSV</Button><Button variant="ghost" onClick={onBusiness}>Business details</Button></div>
      </div>
      <Summary />
      {access && <p className="text-sm text-ink-2">{access.limits.docsPerMonth === null ? "Unlimited documents on your plan." : <>Free allowance: <b>{String(access.limits.docsPerMonth)}</b> new documents per month{access.credits > 0 && <> + <b>{access.credits}</b> purchased credits</>}. <Link className="font-semibold text-brand underline" to="/tools/invoice/about">Get more</Link></>}</p>}
      <div className="flex flex-wrap gap-3"><Input label="Search number or customer" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-56 flex-1" />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All</option>{kind === "invoice" ? ["unpaid", "partial", "paid", "overdue", "draft", "void"].map((s) => <option key={s}>{s}</option>) : ["draft", "issued", "accepted", "void"].map((s) => <option key={s}>{s}</option>)}</Select></div>
      {list.isLoading ? <Spinner /> : !list.data!.items.length ? <Empty title={`No ${kind}s yet`}>Create your first one – it takes about a minute.</Empty> : (
        <Table label={`${kind}s`}><thead><tr><Th>Number</Th><Th>Customer</Th><Th>Date</Th><Th>Total</Th><Th>Status</Th></tr></thead><tbody>
          {list.data!.items.map((d) => <tr key={d.id}><Td><button className="font-semibold text-brand underline" onClick={() => onOpen(d.id)}>{d.number}</button></Td><Td>{d.customer?.name}</Td><Td>{fmtDate(d.issueDate)}</Td><Td>{formatInr(d.totalPaise, { compact: false })}</Td>
            <Td><Badge tone={statusTone(d.kind === "invoice" && d.status !== "void" && d.status !== "draft" ? d.paymentStatus : d.status)}>{d.kind === "invoice" && d.status !== "void" && d.status !== "draft" ? d.paymentStatus : d.status}</Badge></Td></tr>)}</tbody></Table>)}
    </div>
  );
}

function Summary() {
  const q = useQuery({ queryKey: ["inv-summary"], queryFn: () => api<any>("/invoices/summary") });
  if (!q.data) return null;
  const d = q.data; const stat = (l: string, v: string, tone = "") => <Card className="p-4"><p className="text-sm text-ink-2">{l}</p><p className={cx("text-2xl font-semibold", tone)}>{v}</p></Card>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stat("Waiting to be paid", formatInr(d.outstandingPaise))}{stat("Overdue", formatInr(d.overduePaise), d.overduePaise ? "text-bad" : "")}{stat("Billed this month", formatInr(d.billedThisMonthPaise))}{stat("Drafts", String(d.drafts))}</div>
      {d.late.length > 0 && <Alert tone="warn" title={`${d.overdueCount} overdue invoice(s) – follow up today`}><ul className="mt-1 list-disc pl-5">{d.late.map((l: any) => <li key={l.id}>{l.number} · {l.customer} · {formatInr(l.owedPaise, { compact: false })} (due {fmtDate(l.dueDate)})</li>)}</ul></Alert>}
    </div>
  );
}

interface LineState { description: string; quantity: string; rate: string; taxPercent: string }
function Editor({ id, kind, biz, onDone }: { id?: string; kind: "invoice" | "quotation"; biz: BizView & { defaultTaxPercent?: number; defaultNotes?: string }; onDone: (id?: string) => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["invoice", id], queryFn: () => api<{ item: any }>(`/invoices/${id}`), enabled: !!id });
  const today = new Date().toISOString().slice(0, 10);
  const [c, setC] = useState({ name: "", phone: "", email: "", address: "", taxId: "" });
  const [issueDate, setIssueDate] = useState(today); const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<LineState[]>([{ description: "", quantity: "1", rate: "", taxPercent: String(biz.defaultTaxPercent ?? 0) }]);
  const [dtype, setDtype] = useState<"none" | "percent" | "amount">("none"); const [dval, setDval] = useState("");
  const [paid, setPaid] = useState("0"); const [notes, setNotes] = useState(biz.defaultNotes ?? ""); const [template, setTemplate] = useState("classic");
  const [err, setErr] = useState(""); const [upgrade, setUpgrade] = useState(false);
  const premiumTpl = !!useAccess().get("invoice")?.limits.premiumTemplates;
  useEffect(() => {
    const d = existing.data?.item; if (!d) return;
    setC({ name: d.customer.name ?? "", phone: d.customer.phone ?? "", email: d.customer.email ?? "", address: d.customer.address ?? "", taxId: d.customer.taxId ?? "" });
    setIssueDate(d.issueDate.slice(0, 10)); setDueDate(d.dueDate?.slice(0, 10) ?? ""); setNotes(d.notes ?? ""); setTemplate(d.template ?? "classic"); setPaid(paiseToRupees(d.paidPaise));
    setLines(d.lines.map((l: any) => ({ description: l.description, quantity: String(l.quantity), rate: paiseToRupees(l.ratePaise), taxPercent: String(l.taxPercent) })));
    setDtype(d.discount?.type ?? "none"); setDval(d.discount?.type === "percent" ? String(d.discount.value) : d.discount?.type === "amount" ? paiseToRupees(d.discount.valuePaise) : "");
  }, [existing.data]);

  const discount: DiscountInput = dtype === "percent" ? { type: "percent", value: dval || "0" } : dtype === "amount" ? { type: "amount", valuePaise: safePaise(dval) } : { type: "none" };
  let totals = null as ReturnType<typeof calculateDocument> | null; let calcErr = "";
  try { totals = calculateDocument(lines.map((l) => ({ description: l.description, quantity: l.quantity || "0", ratePaise: safePaise(l.rate), taxPercent: l.taxPercent || "0" })), discount); } catch (e) { calcErr = (e as Error).message; }
  const setLine = (i: number, k: keyof LineState) => (e: React.ChangeEvent<HTMLInputElement>) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));

  const save = useMutation({
    mutationFn: (issue: boolean) => {
      const body = { kind, customer: c, issueDate, dueDate: dueDate || null, lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), ratePaise: safePaise(l.rate), taxPercent: Number(l.taxPercent) })), discount: dtype === "percent" ? { type: "percent", value: Number(dval || 0) } : dtype === "amount" ? { type: "amount", valuePaise: safePaise(dval) } : { type: "none" }, paidPaise: kind === "invoice" ? safePaise(paid) : 0, notes, template, issue };
      return id ? api<{ item: any }>(`/invoices/${id}`, { method: "PUT", body }) : api<{ item: any }>("/invoices", { body });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["inv-summary"] }); qc.invalidateQueries({ queryKey: ["invoice", id] }); qc.invalidateQueries({ queryKey: ["access"] }); toast("Saved"); onDone(r.item.id); },
    onError: (e) => { setUpgrade(e instanceof ApiError && e.status === 402); setErr(e instanceof ApiError && e.fields && Object.keys(e.fields).length ? Object.entries(e.fields).map(([k, v]) => `${k}: ${v}`).join(" · ") : errMsg(e)); },
  });
  const valid = c.name.trim() && lines.every((l) => l.description.trim() && Number(l.quantity) > 0) && !calcErr;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h2 className="text-2xl">{id ? "Edit" : "New"} {kind}</h2><Button variant="ghost" onClick={() => onDone(id)}>Cancel</Button></div>
      {err && <Alert tone={upgrade ? "warn" : "bad"}>{err} {upgrade && <LinkButton to="/tools/invoice/about" className="mt-2">See plans</LinkButton>}</Alert>}
      <Card className="grid gap-3 p-4 sm:grid-cols-2"><h3 className="text-lg sm:col-span-2">Customer</h3>
        <Input label="Customer name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /><Input label="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /><Input label="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /><Input label="Tax ID (optional)" value={c.taxId} onChange={(e) => setC({ ...c, taxId: e.target.value })} />
        <Textarea className="sm:col-span-2" label="Billing address (optional)" rows={2} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></Card>
      <Card className="grid gap-3 p-4 sm:grid-cols-3"><Input label="Issue date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /><Input label={kind === "invoice" ? "Due date" : "Valid until"} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <Select label="PDF template" value={template} onChange={(e) => setTemplate(e.target.value)}><option value="classic">Classic</option><option value="modern" disabled={!premiumTpl}>Modern{premiumTpl ? "" : " 🔒 paid"}</option><option value="minimal" disabled={!premiumTpl}>Minimal{premiumTpl ? "" : " 🔒 paid"}</option></Select></Card>
      <Card className="space-y-3 p-4"><h3 className="text-lg">Items</h3>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-line p-3 md:grid-cols-[2fr_80px_110px_80px_auto]">
            <Input className="col-span-2 md:col-span-1" label={`Description ${i + 1}`} value={l.description} onChange={setLine(i, "description")} /><Input label="Qty" inputMode="decimal" value={l.quantity} onChange={setLine(i, "quantity")} /><Input label="Rate ₹" inputMode="decimal" value={l.rate} onChange={setLine(i, "rate")} /><Input label="Tax %" inputMode="decimal" value={l.taxPercent} onChange={setLine(i, "taxPercent")} />
            <Button variant="ghost" aria-label={`Remove item ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</Button></div>))}
        <Button variant="secondary" onClick={() => setLines([...lines, { description: "", quantity: "1", rate: "", taxPercent: String(biz.defaultTaxPercent ?? 0) }])}>+ Add item</Button>
        <div className="grid gap-3 sm:grid-cols-3"><Select label="Discount" value={dtype} onChange={(e) => setDtype(e.target.value as any)}><option value="none">None</option><option value="percent">Percent</option><option value="amount">Fixed amount</option></Select>{dtype !== "none" && <Input label={dtype === "percent" ? "Discount %" : "Discount ₹"} inputMode="decimal" value={dval} onChange={(e) => setDval(e.target.value)} />}
          {kind === "invoice" && <Input label="Already paid ₹" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />}</div></Card>
      <Textarea label="Notes / payment terms" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Card className="p-4">{totals ? <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatInr(totals.subtotalPaise, { compact: false })}</dd></div>{totals.discountPaise > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>− {formatInr(totals.discountPaise, { compact: false })}</dd></div>}
        <div className="flex justify-between"><dt>Tax</dt><dd>{formatInr(totals.taxPaise, { compact: false })}</dd></div><div className="flex justify-between border-t border-line pt-1 text-lg font-semibold"><dt>Total</dt><dd>{formatInr(totals.totalPaise, { compact: false })}</dd></div>
        {kind === "invoice" && <div className="flex justify-between"><dt>Balance due</dt><dd>{formatInr(Math.max(totals.totalPaise - safePaise(paid), 0), { compact: false })}</dd></div>}</dl> : <p className="text-sm text-bad" role="alert">{calcErr}</p>}
        <p className="mt-2 text-xs text-ink-2">Totals are recalculated and checked by the server when you save.</p></Card>
      <div className="flex flex-wrap gap-2"><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(true)}>{id ? "Save changes" : `Create ${kind}`}</Button>{!id && <Button variant="secondary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate(false)}>Save as draft</Button>}</div>
    </div>
  );
}
function safePaise(s: string) { try { return s.trim() ? rupeesToPaise(s) : 0; } catch { return 0; } }

function Detail({ id, biz, onBack, onEdit, onOpen }: { id: string; biz: BizView; onBack: () => void; onEdit: (k: "invoice" | "quotation") => void; onOpen: (id: string) => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api<{ item: any }>(`/invoices/${id}`) });
  const [pay, setPay] = useState(""); const [busy, setBusy] = useState("");
  const access = useAccess().get("invoice");
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  const d = q.data!.item; const ps = paymentStatus(d.totalPaise, d.paidPaise, d.dueDate);
  const act = async (name: string, fn: () => Promise<any>, ok: string) => { setBusy(name); try { const r = await fn(); qc.invalidateQueries({ queryKey: ["invoice", id] }); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["access"] }); toast(ok); return r; } catch (e) { toast(errMsg(e), "bad"); } finally { setBusy(""); } };
  const pdf = () => act("pdf", async () => download(new Blob([(await buildInvoicePdf(d as DocView, biz, { branding: !access?.limits.removeBranding })) as BlobPart], { type: "application/pdf" }), `${d.number}.pdf`), "PDF downloaded");
  const wa = `https://wa.me/${(d.customer.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${d.customer.name}, ${d.kind === "invoice" ? "invoice" : "quotation"} ${d.number} from ${biz.name}: total ${formatInr(d.totalPaise, { compact: false })}${d.kind === "invoice" && d.totalPaise - d.paidPaise > 0 ? `, balance due ${formatInr(d.totalPaise - d.paidPaise, { compact: false })}` : ""}.`)}`;
  const remind = `https://wa.me/${(d.customer.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${d.customer.name}, a gentle reminder from ${biz.name}: invoice ${d.number} has ${formatInr(d.totalPaise - d.paidPaise, { compact: false })} pending${ps === "overdue" ? ` and was due on ${fmtDate(d.dueDate)}` : ""}. Please let us know once paid. Thank you!`)}`;
  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={onBack}>← All documents</Button>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === "pdf"} onClick={pdf}>Download PDF</Button><Button variant="secondary" onClick={() => window.print()}>Print</Button>
          <a className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-paper-2" href={wa} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
          {d.kind === "invoice" && d.status !== "void" && d.totalPaise > d.paidPaise && <a className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-paper-2" href={remind} target="_blank" rel="noopener noreferrer">Send payment reminder</a>}
          {d.status !== "void" && <Button variant="secondary" onClick={() => onEdit(d.kind)}>Edit</Button>}
          <Button variant="secondary" loading={busy === "dup"} onClick={async () => { const r = await act("dup", () => api<any>(`/invoices/${id}/duplicate`, { body: {} }), "Duplicated as a draft"); if (r) onOpen(r.item.id); }}>Duplicate</Button>
        </div></div>
      <div className="no-print flex flex-wrap gap-2 text-sm"><Badge tone={statusTone(d.kind === "invoice" ? ps : d.status)}>{d.kind === "invoice" ? ps : d.status}</Badge><Badge>Revision {d.revision}</Badge>{d.convertedFrom && <Badge tone="brand">From quotation</Badge>}{d.convertedTo && <Badge tone="ok">Converted to invoice</Badge>}</div>
      {d.kind === "quotation" && !d.convertedTo && d.status !== "void" && <div className="no-print flex flex-wrap gap-2">
        {d.status !== "accepted" && <Button variant="secondary" loading={busy === "acc"} onClick={() => act("acc", () => api(`/invoices/${id}/accept`, { body: {} }), "Quotation accepted")}>Mark accepted</Button>}
        {d.status === "accepted" && <Button loading={busy === "conv"} onClick={async () => { const r = await act("conv", () => api<any>(`/invoices/${id}/convert`, { body: {} }), "Invoice created"); if (r) onOpen(r.item.id); }}>Convert to invoice</Button>}</div>}
      {d.kind === "invoice" && d.status !== "void" && d.totalPaise > d.paidPaise && <Card className="no-print flex flex-wrap items-end gap-3 p-4"><Input label="Record a payment ₹" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} className="w-48" /><Button loading={busy === "pay"} disabled={!pay} onClick={async () => { await act("pay", () => api(`/invoices/${id}/payments`, { body: { amountPaise: safePaise(pay) } }), "Payment recorded"); setPay(""); }}>Add payment</Button><p className="text-sm text-ink-2">Outstanding: {formatInr(d.totalPaise - d.paidPaise, { compact: false })}</p></Card>}
      <Paper d={d} biz={biz} />
      <div className="no-print flex gap-2">{d.status === "draft" && <Button variant="danger" onClick={() => confirm("Delete this draft?") && act("del", () => api(`/invoices/${id}`, { method: "DELETE" }), "Deleted").then(onBack)}>Delete draft</Button>}{d.status !== "void" && d.status !== "draft" && <Button variant="ghost" onClick={() => confirm("Void this document? It will be kept for your records but marked void.") && act("void", () => api(`/invoices/${id}/void`, { body: {} }), "Voided")}>Void</Button>}</div>
      {d.history?.length > 0 && <details className="no-print rounded-xl border border-line bg-card p-4"><summary className="cursor-pointer font-semibold">Revision history ({d.history.length})</summary><ul className="mt-2 space-y-1 text-sm text-ink-2">{d.history.map((h: any) => <li key={h.revision}>Revision {h.revision} · {new Date(h.at).toLocaleString("en-IN")} · total was {formatInr(h.totalPaise, { compact: false })}</li>)}</ul></details>}
    </div>
  );
}

function Paper({ d, biz }: { d: any; biz: BizView }) {
  const m = (p: number) => formatInr(p, { compact: false });
  const accent = d.template === "modern" ? "#4f46e5" : d.template === "minimal" ? "#1f1d1a" : "#334155";
  return (
    <div className="print-area rounded-2xl border border-line bg-white p-6 text-sm text-ink shadow-soft sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div>{biz.logoDataUrl && <img src={biz.logoDataUrl} alt="" className="mb-2 h-14" />}<p className="font-display text-xl font-semibold">{biz.name}</p><p className="whitespace-pre-line text-ink-2">{[biz.address, biz.phone, biz.email, biz.taxId && `${biz.taxLabel || "Tax ID"}: ${biz.taxId}`].filter(Boolean).join("\n")}</p></div>
        <div className="text-right"><p className="font-display text-2xl font-semibold" style={{ color: accent }}>{d.kind === "invoice" ? "INVOICE" : "QUOTATION"}</p><p># {d.number}</p><p className="text-ink-2">Issued {fmtDate(d.issueDate)}{d.dueDate && <><br />{d.kind === "invoice" ? "Due" : "Valid until"} {fmtDate(d.dueDate)}</>}</p></div></div>
      <div className="mt-4"><p className="text-xs font-semibold text-ink-2">BILL TO</p><p className="font-semibold">{d.customer.name}</p><p className="whitespace-pre-line text-ink-2">{[d.customer.address, d.customer.phone, d.customer.email].filter(Boolean).join("\n")}</p></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left"><thead><tr style={{ background: d.template === "minimal" ? "#f0f0f0" : accent, color: d.template === "minimal" ? "#111" : "#fff" }}><th className="p-2">Description</th><th className="p-2">Qty</th><th className="p-2">Rate</th><th className="p-2">Tax</th><th className="p-2 text-right">Amount</th></tr></thead>
        <tbody>{d.lines.map((l: any, i: number) => <tr key={i} className="border-b border-line"><td className="p-2">{l.description}</td><td className="p-2">{l.quantity}</td><td className="p-2">{m(l.ratePaise)}</td><td className="p-2">{l.taxPercent}%</td><td className="p-2 text-right">{m(l.totalPaise - l.taxPaise)}</td></tr>)}</tbody></table></div>
      <dl className="ml-auto mt-4 max-w-xs space-y-1"><div className="flex justify-between"><dt>Subtotal</dt><dd>{m(d.subtotalPaise)}</dd></div>{d.discountPaise > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>− {m(d.discountPaise)}</dd></div>}<div className="flex justify-between"><dt>Tax</dt><dd>{m(d.taxPaise)}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Total</dt><dd>{m(d.totalPaise)}</dd></div>{d.kind === "invoice" && <><div className="flex justify-between"><dt>Paid</dt><dd>{m(d.paidPaise)}</dd></div><div className="flex justify-between text-base font-semibold"><dt>Balance due</dt><dd>{m(d.totalPaise - d.paidPaise)}</dd></div></>}</dl>
      {d.notes && <p className="mt-4 whitespace-pre-line text-ink-2"><b className="text-ink">Notes: </b>{d.notes}</p>}
    </div>
  );
}
