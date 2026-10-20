import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCTS, planById, formatInr } from "@ek/shared";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { download, fmtDate } from "../lib/format";
import { Alert, Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Spinner, Table, Td, Th, cx } from "../components/ui";
import { useToast } from "../components/toast";

const NAV: [string, string, string, boolean][] = [["/account", "Dashboard", "🏠", true], ["/account/orders", "Orders", "🧾", false], ["/account/library", "Software library", "📚", false], ["/account/downloads", "Download history", "⬇️", false], ["/account/settings", "Settings", "⚙️", false]];

export function AccountLayout() {
  const { user } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) => cx("flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors hover:bg-paper-2", isActive && "bg-ink text-white hover:bg-ink");
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6"><h1 className="text-3xl font-semibold sm:text-4xl">Hello, {user?.name.split(" ")[0]}</h1><p className="text-ink-2">{user?.email}</p></div>
      <div className="grid gap-6 md:grid-cols-[210px_1fr]">
        <nav aria-label="Account" className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-20 md:flex-col md:self-start md:overflow-visible">
          {NAV.map(([to, t, icon, end]) => <NavLink key={to} end={end} to={to} className={link}><span aria-hidden>{icon}</span>{t}</NavLink>)}
          <div className="mt-3 hidden rounded-2xl border border-line bg-card p-3 text-xs text-ink-2 md:block">Need help? <Link className="font-semibold text-brand underline" to="/contact">Contact support</Link></div>
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number | null }) {
  if (max === null) return <p className="text-sm text-ink-2">{label}: <b className="text-ink">{value}</b> · unlimited</p>;
  const pct = Math.min(1, value / Math.max(max, 1)); const hot = pct >= 0.8;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-ink-2">{label}</span><b className={hot ? "text-warn" : ""}>{value} / {max}</b></div>
      <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="mt-1 h-2 overflow-hidden rounded-full bg-paper-2"><div className={cx("h-full rounded-full transition-all", hot ? "bg-warn" : "bg-brand")} style={{ width: `${pct * 100}%` }} /></div>
    </div>
  );
}

export function Overview() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<any>("/account/dashboard") });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  const d = q.data; const acc = (slug: string) => d.access.find((a: any) => a.product === slug);
  const paidCount = d.access.filter((a: any) => a.paid).length;
  const inv = acc("invoice"), invt = acc("inventory"), res = acc("resume");

  const attention: { tone: "bad" | "warn" | "info"; text: string; to: string; cta: string }[] = [];
  if (d.money.overdueCount) attention.push({ tone: "bad", text: `${d.money.overdueCount} overdue invoice(s) worth ${formatInr(d.money.overduePaise)}${d.money.late[0] ? ` – ${d.money.late[0].customer} owes ${formatInr(d.money.late[0].owedPaise)}` : ""}`, to: "/tools/invoice", cta: "Send reminders" });
  if (d.stock.low) attention.push({ tone: "warn", text: `${d.stock.low} product(s) running low: ${d.stock.lowNames.join(", ")}`, to: "/tools/inventory", cta: "Restock" });
  if (d.stock.expired) attention.push({ tone: "bad", text: `${d.stock.expired} expired product(s) still in stock`, to: "/tools/inventory", cta: "Review" });
  if (d.stock.expiring) attention.push({ tone: "warn", text: `${d.stock.expiring} product(s) expire within 30 days`, to: "/tools/inventory", cta: "See list" });
  for (const e of d.expiringPlans) attention.push({ tone: "warn", text: `Your ${planById(e.planId)?.name ?? e.planId} plan ${e.daysLeft <= 0 ? "ends today" : `ends in ${e.daysLeft} day(s)`}`, to: `/checkout/plan/${e.planId}`, cta: "Renew" });

  const tips: { title: string; body: string; to: string; cta: string }[] = [];
  const lim = inv?.limits.docsPerMonth;
  if (!inv?.paid && typeof lim === "number" && d.usage.docsMonth >= lim) tips.push({ title: "You've used your free documents this month", body: "Add 10 more invoices for ₹29, or go unlimited for 30 days.", to: "/tools/invoice/about", cta: "See invoice plans" });
  const maxI = invt?.limits.maxItems;
  if (typeof maxI === "number" && d.usage.items >= maxI * 0.8) tips.push({ title: "You're nearly out of product slots", body: `You are using ${d.usage.items} of ${maxI}. Upgrade to track more products.`, to: "/tools/inventory/about", cta: "Add more products" });
  if (d.usage.items > 0 && !invt?.limits.reports) tips.push({ title: "See which products make you money", body: "Profit reports show best sellers and stock that isn't selling.", to: "/tools/inventory/about", cta: "Unlock reports" });
  if (!res?.paid && d.usage.resumes >= 1) tips.push({ title: "Stand out with premium resume templates", body: "Modern and Compact layouts plus an application package.", to: "/tools/resume/about", cta: "See Premium" });
  if (!paidCount && !tips.length) tips.push({ title: "Start with the Student or Small shop bundle", body: "Get several tools together at a lower price.", to: "/bundles", cta: "See bundles" });

  const stat = (label: string, value: string, sub: string, tone = "") => <Card className="p-4"><p className="text-sm text-ink-2">{label}</p><p className={cx("mt-1 text-2xl font-semibold", tone)}>{value}</p><p className="text-xs text-ink-2">{sub}</p></Card>;
  const quick: [string, string, string][] = [["🧾", "New invoice", "/tools/invoice"], ["📦", "Update stock", "/tools/inventory"], ["📄", "Build resume", "/tools/resume"], ["🔳", "Make QR code", "/tools/qr-business"], ["🖼️", "Resize photo", "/tools/photo-tools"], ["🗂️", "Merge PDFs", "/tools/pdf-tools"]];

  return (
    <div className="space-y-6">
      <section aria-label="Quick actions" className="relative overflow-hidden rounded-3xl bg-ink p-5 text-white sm:p-6">
        <div aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand/60 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-white/75">Your plan</p><p className="font-display text-2xl font-semibold">{paidCount ? `${paidCount} tool${paidCount > 1 ? "s" : ""} on a paid plan` : "Free plan"}</p></div>{!paidCount && <LinkButton to="/pricing" className="bg-white !text-ink hover:bg-paper-2">Compare plans</LinkButton>}</div>
        <ul className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{quick.map(([i, t, to]) => <li key={t}><Link to={to} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-white/10 px-2 text-center text-xs font-semibold transition hover:bg-white/20"><span aria-hidden className="text-lg">{i}</span>{t}</Link></li>)}</ul>
      </section>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat("Waiting to be paid", formatInr(d.money.outstandingPaise), "from open invoices")}
        {stat("Overdue", String(d.money.overdueCount), d.money.overdueCount ? formatInr(d.money.overduePaise) + " late" : "nothing late", d.money.overdueCount ? "text-bad" : "text-ok")}
        {stat("Low stock", String(d.stock.low), `${d.usage.items} product${d.usage.items === 1 ? "" : "s"} tracked`, d.stock.low ? "text-warn" : "")}
        {stat("Documents this month", String(d.usage.docsMonth), `${d.usage.docsTotal} created in total`)}
      </section>

      <section aria-labelledby="att-h"><h2 id="att-h" className="mb-2 text-xl">Needs your attention</h2>
        {attention.length ? <ul className="space-y-2">{attention.map((a, i) => <li key={i} className={cx("flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm", a.tone === "bad" ? "border-bad/30 bg-bad-bg text-bad" : "border-warn/30 bg-warn-bg text-warn")}><span className="font-medium">{a.text}</span><Link to={a.to} className="min-h-9 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-bold text-ink hover:bg-white">{a.cta} →</Link></li>)}</ul>
          : <div className="rounded-xl border border-ok/20 bg-ok-bg px-4 py-3 text-sm font-medium text-ok">✓ All clear. Nothing needs your attention right now.</div>}
      </section>

      {tips.length > 0 && <section aria-labelledby="tip-h"><h2 id="tip-h" className="mb-2 text-xl">Recommended for you</h2>
        <div className="grid gap-3 md:grid-cols-2">{tips.slice(0, 2).map((t) => <Card key={t.title} className="flex flex-col justify-between gap-3 border-brand/20 bg-brand-50/50 p-4"><div><p className="font-semibold">{t.title}</p><p className="text-sm text-ink-2">{t.body}</p></div><LinkButton to={t.to} className="self-start">{t.cta}</LinkButton></Card>)}</div></section>}

      <section aria-labelledby="tools-h"><h2 id="tools-h" className="mb-2 text-xl">Your tools</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PRODUCTS.map((p) => {
            const a = acc(p.slug); const days = a?.expiresAt ? Math.max(0, Math.ceil((+new Date(a.expiresAt) - Date.now()) / 86400000)) : null;
            return (
              <Card key={p.slug} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2"><h3 className="flex items-center gap-2 text-lg"><span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg text-lg" style={{ background: `${p.accent}18` }}>{p.icon}</span>{p.name.split(" & ")[0].replace("Regional-Language ", "")}</h3>{a?.paid ? <Badge tone="brand">Paid</Badge> : <Badge>Free</Badge>}</div>
                <div className="mt-3 space-y-2">
                  {p.slug === "invoice" && typeof a?.limits.docsPerMonth === "number" && <Meter label="Documents this month" value={d.usage.docsMonth} max={a.limits.docsPerMonth as number} />}
                  {p.slug === "inventory" && <Meter label="Products tracked" value={d.usage.items} max={(a?.limits.maxItems as number) ?? null} />}
                  {p.slug === "resume" && <Meter label="Saved resumes" value={d.usage.resumes} max={(a?.limits.maxResumes as number | null) ?? null} />}
                  {p.slug === "qr-business" && <p className="text-sm text-ink-2">Page: <b className="text-ink">{d.usage.page ? (d.usage.page.published ? `live at /p/${d.usage.page.slug}` : "draft") : "not created"}</b></p>}
                  {p.slug === "invitation" && <p className="text-sm text-ink-2">Saved designs: <b className="text-ink">{d.usage.designs}</b></p>}
                </div>
                <ul className="mt-2 flex-1 space-y-0.5 text-sm text-ink-2">
                  {Object.entries(a?.limits ?? {}).map(([k, v]) => <li key={k}>{label(k)}: <b className="text-ink">{v === null ? "unlimited" : v === true ? "yes" : v === false ? "no" : String(v)}</b></li>)}
                  {a && a.credits > 0 && <li>Credits left: <b className="text-ink">{a.credits}</b></li>}
                  {days !== null && <li>Active until <b className="text-ink">{fmtDate(a.expiresAt)}</b> <span className={days <= 7 ? "font-semibold text-warn" : ""}>({days} day{days === 1 ? "" : "s"} left)</span></li>}
                </ul>
                <div className="mt-3 flex gap-2"><LinkButton to={`/tools/${p.slug}`} variant="secondary" className="flex-1">Open</LinkButton><LinkButton to={`/tools/${p.slug}/about`} variant={a?.paid ? "secondary" : "primary"} className="flex-1">{a?.paid ? "Plans" : "Upgrade"}</LinkButton></div>
              </Card>
            );
          })}
        </div></section>

      <section aria-labelledby="ord-h"><div className="mb-2 flex items-center justify-between"><h2 id="ord-h" className="text-xl">Recent orders</h2><Link to="/account/orders" className="text-sm font-semibold text-brand underline">View all</Link></div>
        {d.orders.length ? <ul className="divide-y divide-line rounded-2xl border border-line bg-card">{d.orders.map((o: any) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><Link className="font-medium underline" to={`/account/orders/${o.id}`}>{o.title}</Link><span className="flex items-center gap-3 text-ink-2">{fmtDate(o.createdAt)} · <b className="text-ink">{formatInr(o.amountPaise, { compact: false })}</b><Badge tone={tone(o.status)}>{o.status}</Badge></span></li>)}</ul> : <Empty title="No orders yet">Your purchases will show up here.</Empty>}</section>
    </div>
  );
}
const LABELS: Record<string, string> = { docsPerMonth: "Documents / month", maxResumes: "Saved resumes", premiumTemplates: "Premium templates", maxItems: "Products", clean: "Clean downloads", maxFileMb: "Max file (MB)", maxFiles: "Files per batch", hostedPages: "Hosted pages", poster: "Poster designs", reports: "Sales & profit reports", removeBranding: "Remove Sahaj footer" };
const label = (k: string) => LABELS[k] ?? k;

const tone = (s: string) => ({ paid: "ok", pending: "warn", failed: "bad", cancelled: "neutral", refunded: "neutral", disputed: "bad" } as const)[s as "paid"] ?? "neutral";

export function Orders() {
  const q = useQuery({ queryKey: ["orders"], queryFn: () => api<{ orders: any[] }>("/billing/orders") });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  if (!q.data!.orders.length) return <Empty title="No orders yet">When you buy a plan it will show up here with its receipt. <Link className="text-brand underline" to="/pricing">See pricing</Link></Empty>;
  return (
    <Table label="Orders">
      <thead><tr><Th>Date</Th><Th>Item</Th><Th>Amount</Th><Th>Status</Th><Th>Receipt</Th></tr></thead>
      <tbody>{q.data!.orders.map((o) => (
        <tr key={o.id}><Td>{fmtDate(o.createdAt)}</Td><Td><Link className="font-medium underline" to={`/account/orders/${o.id}`}>{o.title}</Link></Td><Td>{formatInr(o.amountPaise, { compact: false })}</Td><Td><Badge tone={tone(o.status)}>{o.status}</Badge></Td>
          <Td>{o.status === "paid" || o.status === "refunded" ? <button className="text-brand underline" onClick={() => printReceipt(o)}>{o.receiptNo}</button> : "—"}</Td></tr>
      ))}</tbody>
    </Table>
  );
}
function printReceipt(o: any) {
  const w = window.open("", "_blank", "width=640,height=800"); if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  w.document.write(`<title>Receipt ${esc(o.receiptNo)}</title><body style="font-family:sans-serif;max-width:520px;margin:40px auto"><h1>Sahaj receipt</h1><p>Receipt: <b>${esc(o.receiptNo)}</b><br>Date: ${fmtDate(o.paidAt)}<br>Order: ${esc(o.id)}</p><table style="width:100%;border-collapse:collapse"><tr><td>${esc(o.title)}</td><td style="text-align:right">${esc(formatInr(o.amountPaise, { compact: false }))}</td></tr></table><p>Status: ${esc(o.status)}. Paid via ${esc(o.provider)}.</p><p style="color:#666;font-size:12px">This is a payment receipt, not a tax invoice.</p></body>`);
  w.document.close(); w.print();
}

export function Library() {
  const toast = useToast();
  const ents = useQuery({ queryKey: ["library"], queryFn: () => api<{ entitlements: any[] }>("/entitlements/library") });
  const dl = useQuery({ queryKey: ["downloads"], queryFn: () => api<{ assets: any[] }>("/downloads") });
  const [busy, setBusy] = useState("");
  async function get(id: string, filename: string) {
    setBusy(id);
    try {
      const { url } = await api<{ url: string }>(`/downloads/${id}/link`, { method: "POST", body: {} });
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Download failed");
      download(await r.blob(), filename); toast("Download started");
    } catch (e) { toast(errMsg(e), "bad"); } finally { setBusy(""); }
  }
  if (ents.isLoading || dl.isLoading) return <Spinner />;
  return (
    <div className="space-y-8">
      <section aria-labelledby="dl-h"><h2 id="dl-h" className="mb-3 text-2xl">Downloads</h2>
        <div className="grid gap-4 md:grid-cols-2">{dl.data!.assets.map((a) => (
          <Card key={a.id} className="p-5"><h3 className="text-lg">{a.name}</h3><p className="text-sm text-ink-2">{a.description}</p>
            {a.unlocked ? <Button className="mt-3" loading={busy === a.id} onClick={() => get(a.id, a.filename)}>Download {a.filename}</Button>
              : <p className="mt-3 text-sm">Included with <Link className="font-semibold text-brand underline" to="/tools/inventory/about">Inventory Pro or Business</Link>.</p>}
          </Card>))}
        </div></section>
      <section aria-labelledby="ent-h"><h2 id="ent-h" className="mb-3 text-2xl">My plans</h2>
        {!ents.data!.entitlements.length ? <Empty title="No paid plans yet"><Link className="text-brand underline" to="/pricing">Browse plans</Link></Empty> : (
          <Table label="Plans"><thead><tr><Th>Plan</Th><Th>Tool</Th><Th>Status</Th><Th>Credits</Th><Th>Valid until</Th></tr></thead><tbody>
            {ents.data!.entitlements.map((e) => {
              const expired = e.expiresAt && new Date(e.expiresAt) < new Date();
              return <tr key={e.id}><Td>{planById(e.planId)?.name ?? e.planId}</Td><Td><Link className="underline" to={`/tools/${e.product}`}>{PRODUCTS.find((p) => p.slug === e.product)?.name}</Link></Td><Td><Badge tone={e.status === "active" && !expired ? "ok" : "neutral"}>{expired ? "expired" : e.status}</Badge></Td><Td>{e.kind === "credits" ? e.creditsRemaining : "—"}</Td><Td>{e.expiresAt ? fmtDate(e.expiresAt) : "No expiry"}</Td></tr>;
            })}</tbody></Table>)}
      </section>
    </div>
  );
}

export function DownloadHistory() {
  const q = useQuery({ queryKey: ["dlh"], queryFn: () => api<{ history: any[] }>("/downloads/history") });
  if (q.isLoading) return <Spinner />;
  if (!q.data!.history.length) return <Empty title="No downloads yet" />;
  return <Table label="Download history"><thead><tr><Th>When</Th><Th>File</Th><Th>Event</Th></tr></thead><tbody>{q.data!.history.map((h, i) => <tr key={i}><Td>{new Date(h.at).toLocaleString("en-IN")}</Td><Td>{h.assetId}</Td><Td>{h.event.replace("_", " ")}</Td></tr>)}</tbody></Table>;
}

export function Settings() {
  const { user, logout } = useAuth(); const qc = useQueryClient(); const nav = useNavigate(); const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ current: "", password: "" });
  const [del, setDel] = useState({ password: "", confirm: "" });
  const rename = useMutation({ mutationFn: () => api("/account", { method: "PATCH", body: { name } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["me"] }); toast("Name updated"); }, onError: (e) => toast(errMsg(e), "bad") });
  const chg = useMutation({ mutationFn: () => api("/auth/change-password", { body: pw }), onSuccess: () => { setPw({ current: "", password: "" }); toast("Password changed"); }, onError: (e) => toast(errMsg(e), "bad") });
  const rm = useMutation({ mutationFn: () => api("/account", { method: "DELETE", body: del }), onSuccess: () => { qc.clear(); toast("Account deleted"); nav("/"); window.location.reload(); }, onError: (e) => toast(errMsg(e), "bad") });
  async function exportData() {
    try { const d = await api("/account/export"); download(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }), "everydaykit-data.json"); } catch (e) { toast(errMsg(e), "bad"); }
  }
  return (
    <div className="grid max-w-2xl gap-6">
      <Card className="space-y-3 p-5"><h2 className="text-xl">Profile</h2><Input label="Name" value={name} onChange={(e) => setName(e.target.value)} /><Input label="Email" value={user?.email ?? ""} readOnly /><Button loading={rename.isPending} onClick={() => rename.mutate()} className="self-start">Save name</Button></Card>
      <Card className="space-y-3 p-5"><h2 className="text-xl">Change password</h2><Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /><Input label="New password" type="password" autoComplete="new-password" hint="At least 10 characters with a letter and a number." value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /><Button loading={chg.isPending} onClick={() => chg.mutate()}>Change password</Button></Card>
      <Card className="space-y-3 p-5"><h2 className="text-xl">Your data</h2><p className="text-sm text-ink-2">Download everything we hold about you as a JSON file.</p><Button variant="secondary" onClick={exportData}>Export my data</Button></Card>
      <Card className="space-y-3 border-bad/30 p-5"><h2 className="text-xl text-bad">Delete account</h2><p className="text-sm text-ink-2">Permanently deletes your account, invoices, stock records, resumes, designs and page. Order records are kept without a link to you for accounting. This cannot be undone.</p>
        <Input label="Password" type="password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} /><Input label='Type DELETE to confirm' value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
        <Button variant="danger" disabled={del.confirm !== "DELETE" || !del.password} loading={rm.isPending} onClick={() => rm.mutate()}>Delete my account</Button></Card>
      <div><Button variant="ghost" onClick={() => logout()}>Sign out</Button></div>
    </div>
  );
}
