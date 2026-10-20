import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCTS, formatInr } from "@ek/shared";
import { api, errMsg } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Alert, Badge, Button, Card, Input, PageHeader, Select, Spinner, Table, Td, Th, cx } from "../components/ui";
import { useToast } from "../components/toast";

const TABS = [["Overview", "📊"], ["Orders", "🧾"], ["Users", "👥"], ["Promo codes", "🏷️"], ["Catalog", "🗂️"], ["Support", "💬"], ["Audit", "🔍"]] as const;
type Tab = (typeof TABS)[number][0];

export default function Admin() {
  const [tab, setTab] = useState<Tab>("Overview");
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold sm:text-4xl">Admin dashboard</h1><p className="text-ink-2">Every action is re-checked on the server and recorded in the audit log.</p></div><Badge tone="brand">Administrator</Badge></div>
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <div role="tablist" aria-label="Admin sections" aria-orientation="vertical" className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-20 md:flex-col md:self-start md:overflow-visible">
          {TABS.map(([t, icon]) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-left text-sm font-medium transition-colors", tab === t ? "bg-ink text-white" : "hover:bg-paper-2")}><span aria-hidden>{icon}</span>{t}</button>)}
        </div>
        <div className="min-w-0">
          {tab === "Overview" && <Overview go={setTab} />}{tab === "Orders" && <Orders />}{tab === "Users" && <Users />}{tab === "Promo codes" && <Promos />}{tab === "Catalog" && <CatalogAdmin />}{tab === "Support" && <Support />}{tab === "Audit" && <Audit />}
        </div>
      </div>
    </div>
  );
}

const pct = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? "new" : "–") : `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}%`);
function Kpi({ label, value, cur, prev, sub }: { label: string; value: string; cur?: number; prev?: number; sub: string }) {
  const up = cur !== undefined && prev !== undefined && cur >= prev;
  return <Card className="p-4"><p className="text-sm text-ink-2">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="text-xs text-ink-2">{cur !== undefined && prev !== undefined && <b className={up ? "text-ok" : "text-bad"}>{pct(cur, prev)} </b>}{sub}</p></Card>;
}

function Overview({ go }: { go: (t: Tab) => void }) {
  const d = useQuery({ queryKey: ["a-dash"], queryFn: () => api<any>("/admin/dashboard") });
  const s = useQuery({ queryKey: ["a-stats"], queryFn: () => api<any>("/admin/stats") });
  const h = useQuery({ queryKey: ["a-health"], queryFn: () => api<any>("/admin/health") });
  if (d.isLoading) return <Spinner />;
  if (d.error) return <Alert tone="bad">{errMsg(d.error)}</Alert>;
  const x = d.data; const st = x.statuses as Record<string, number>;
  const total = Object.values(st).reduce((a: number, b) => a + b, 0) || 1;
  const colors: Record<string, string> = { paid: "#166534", pending: "#b45309", failed: "#b42318", cancelled: "#8a8378", refunded: "#4f46e5", disputed: "#7c2d12" };
  const att: [string, number, Tab, string][] = [["Open support requests", x.attention.openSupport, "Support", "Reply"], ["Payments stuck pending (over 1 hour)", x.attention.pendingOld, "Orders", "Check"], ["Failed payments (7 days)", x.attention.failed7, "Orders", "Review"], ["Disputed payments", x.attention.disputed, "Orders", "Resolve"]];
  const maxS = Math.max(1, ...x.signupSeries.map((v: any) => v.n));
  return (
    <div className="space-y-6">
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Revenue" value={formatInr(x.revenue.paise, { compact: false })} cur={x.revenue.paise} prev={x.revenue.prevPaise} sub="vs previous 30 days" />
        <Kpi label="Paid orders" value={String(x.revenue.orders)} cur={x.revenue.orders} prev={x.revenue.prevOrders} sub="last 30 days" />
        <Kpi label="New users" value={String(x.users.last30)} cur={x.users.last30} prev={x.users.prev30} sub={`${x.users.total} in total`} />
        <Kpi label="Active paid plans" value={String(x.activePaidEntitlements)} sub={s.data ? `${s.data.conversionPercent}% of users have paid` : "customers with access now"} />
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <RevenueChart />
        <Card className="p-4"><h2 className="mb-2 text-lg">Needs attention</h2>
          <ul className="space-y-2">{att.map(([t, n, tab, cta]) => <li key={t} className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><span className={cx("grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold", n ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok")}>{n}</span>{t}</span>{n > 0 && <button className="text-xs font-bold text-brand-700 underline" onClick={() => go(tab)}>{cta}</button>}</li>)}</ul>
          {att.every((a) => a[1] === 0) && <p className="mt-3 text-sm font-medium text-ok">✓ Nothing needs attention.</p>}</Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4"><h2 className="text-lg">New users, 30 days</h2>
          <svg viewBox="0 0 300 70" role="img" aria-label={`Daily sign-ups for the last 30 days, ${x.users.last30} in total`} className="mt-2 w-full">{x.signupSeries.map((v: any, i: number) => <rect key={v.date} x={i * 10 + 1} y={64 - (v.n / maxS) * 60} width="8" height={Math.max((v.n / maxS) * 60, 1)} rx="2" fill="#4f46e5"><title>{`${v.date}: ${v.n}`}</title></rect>)}</svg></Card>
        <Card className="p-4"><h2 className="mb-2 text-lg">Order outcomes</h2>
          <div role="img" aria-label="Orders by status" className="flex h-3 overflow-hidden rounded-full bg-paper-2">{Object.entries(st).map(([k, n]) => <i key={k} style={{ width: `${(n / total) * 100}%`, background: colors[k] ?? "#999" }} />)}</div>
          <ul className="mt-3 grid grid-cols-2 gap-1 text-xs">{Object.entries(st).map(([k, n]) => <li key={k} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: colors[k] ?? "#999" }} />{k} <b>{n}</b></li>)}{!Object.keys(st).length && <li className="col-span-2 text-ink-2">No orders yet.</li>}</ul></Card>
        <Card className="p-4"><h2 className="mb-2 text-lg">Best-selling plans</h2>{x.byPlan.length ? <ul className="space-y-1 text-sm">{x.byPlan.map((p: any) => <li key={p.planId} className="flex justify-between"><span>{p.planId}</span><b>{p.n}</b></li>)}</ul> : <p className="text-sm text-ink-2">No sales yet.</p>}</Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4"><div className="mb-2 flex justify-between"><h2 className="text-lg">Latest orders</h2><button className="text-xs font-bold text-brand-700 underline" onClick={() => go("Orders")}>All orders</button></div>
          {x.recentOrders.length ? <ul className="divide-y divide-line text-sm">{x.recentOrders.map((o: any) => <li key={o.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0"><span className="block truncate font-medium">{o.title}</span><span className="text-xs text-ink-2">{o.email} · {fmtDate(o.createdAt)}</span></span><span className="shrink-0 text-right">{formatInr(o.amountPaise, { compact: false })}<span className="block"><Badge tone={o.status === "paid" ? "ok" : o.status === "failed" ? "bad" : "neutral"}>{o.status}</Badge></span></span></li>)}</ul> : <p className="text-sm text-ink-2">No orders yet.</p>}</Card>
        <Card className="p-4"><div className="mb-2 flex justify-between"><h2 className="text-lg">Newest users</h2><button className="text-xs font-bold text-brand-700 underline" onClick={() => go("Users")}>All users</button></div>
          <ul className="divide-y divide-line text-sm">{x.recentUsers.map((u: any) => <li key={u.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0"><span className="block truncate font-medium">{u.name}</span><span className="text-xs text-ink-2">{u.email}</span></span><span className="shrink-0 text-xs text-ink-2">{fmtDate(u.createdAt)}</span></li>)}</ul></Card>
      </div>
      {h.data && <Card className="p-4 text-sm"><h2 className="mb-2 text-lg">System health</h2><dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div><dt className="text-ink-2">Database</dt><dd><Badge tone={h.data.database === "ok" ? "ok" : "bad"}>{h.data.database}</Badge></dd></div>
        <div><dt className="text-ink-2">Payments</dt><dd>{h.data.paymentProvider}</dd></div><div><dt className="text-ink-2">AI</dt><dd>{h.data.aiEnabled ? "enabled" : "off"}</dd></div>
        <div><dt className="text-ink-2">Uptime</dt><dd>{Math.round(h.data.uptimeSeconds / 60)} min</dd></div><div><dt className="text-ink-2">Server errors since start</dt><dd>{h.data.errorsSinceStart}</dd></div>
        {h.data.lastError && <div className="col-span-full"><dt className="text-ink-2">Last error</dt><dd className="truncate">{h.data.lastError.message}</dd></div>}</dl></Card>}
    </div>
  );
}

function RevenueChart() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["a-rev", days], queryFn: () => api<{ series: { date: string; paise: number; orders: number }[] }>(`/admin/revenue?days=${days}`) });
  if (!q.data) return null;
  const s = q.data.series; const max = Math.max(100, ...s.map((x) => x.paise)); const total = s.reduce((a, x) => a + x.paise, 0);
  const W = 640, H = 160, bw = W / s.length;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg">Revenue, last {days} days</h2><p className="text-2xl font-semibold">{formatInr(total, { compact: false })}</p></div>
        <Select label="Range" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((n) => <option key={n} value={n}>{n} days</option>)}</Select></div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`Daily revenue for the last ${days} days, total ${formatInr(total, { compact: false })}`} className="mt-3 w-full">
        <line x1="0" x2={W} y1={H} y2={H} stroke="#e2dacb" />
        {s.map((x, i) => { const h = (x.paise / max) * (H - 8); return <rect key={x.date} x={i * bw + 1} y={H - h} width={Math.max(bw - 2, 1)} height={h} rx="2" fill="#4f46e5"><title>{`${x.date}: ${formatInr(x.paise, { compact: false })} (${x.orders} order${x.orders === 1 ? "" : "s"})`}</title></rect>; })}
        <text x="0" y={H + 16} fontSize="11" fill="#5b564e">{s[0].date}</text><text x={W} y={H + 16} fontSize="11" textAnchor="end" fill="#5b564e">{s.at(-1)!.date}</text>
      </svg>
    </Card>
  );
}

function Orders() {
  const qc = useQueryClient(); const toast = useToast();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");
  const orders = useQuery({ queryKey: ["a-orders", q, status], queryFn: () => api<{ orders: any[] }>(`/admin/orders?q=${encodeURIComponent(q)}&status=${status}`) });
  const refund = useMutation({ mutationFn: (id: string) => api(`/admin/orders/${id}/refund`, { body: {} }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["a-orders"] }); toast("Order refunded and access revoked"); }, onError: (e) => toast(errMsg(e), "bad") });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3"><Input label="Search by email, order id or receipt" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-64 flex-1" />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{["pending", "paid", "failed", "cancelled", "refunded", "disputed"].map((s) => <option key={s}>{s}</option>)}</Select></div>
      {orders.isLoading ? <Spinner /> : <Table label="Orders"><thead><tr><Th>Date</Th><Th>Customer</Th><Th>Item</Th><Th>Amount</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody>
        {orders.data?.orders.map((o) => <tr key={o.id}><Td>{fmtDate(o.createdAt)}</Td><Td>{o.user?.email ?? "deleted"}</Td><Td>{o.title}{o.promoCode && <Badge tone="brand">{o.promoCode}</Badge>}<span className="block text-xs text-ink-2">{o.id}</span></Td><Td>{formatInr(o.amountPaise, { compact: false })}</Td><Td><Badge tone={o.status === "paid" ? "ok" : o.status === "refunded" ? "neutral" : "warn"}>{o.status}</Badge></Td>
          <Td>{o.status === "paid" && <Button variant="secondary" loading={refund.isPending && refund.variables === o.id} onClick={() => confirm(`Refund ${formatInr(o.amountPaise, { compact: false })} to ${o.user?.email}? Access will be revoked.`) && refund.mutate(o.id)}>Refund</Button>}</Td></tr>)}</tbody></Table>}
    </div>
  );
}

function Users() {
  const toast = useToast(); const qc = useQueryClient(); const [q, setQ] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const users = useQuery({ queryKey: ["a-users", q], queryFn: () => api<{ users: any[] }>(`/admin/users?q=${encodeURIComponent(q)}`) });
  const [grant, setGrant] = useState({ email: "", planId: "invoice-pro" });
  const catalog = useQuery({ queryKey: ["a-catalog"], queryFn: () => api<any>("/admin/catalog") });
  const g = useMutation({ mutationFn: () => api("/admin/entitlements/grant", { body: grant }), onSuccess: () => { toast("Plan granted"); qc.invalidateQueries({ queryKey: ["a-user"] }); }, onError: (e) => toast(errMsg(e), "bad") });
  return (
    <div className="space-y-6">
      <Card className="p-4"><h2 className="mb-2 text-lg">Grant a plan (support / goodwill)</h2><div className="flex flex-wrap items-end gap-3"><Input label="User email" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} className="min-w-64 flex-1" />
        <Select label="Plan" value={grant.planId} onChange={(e) => setGrant({ ...grant, planId: e.target.value })}>{catalog.data?.plans.filter((p: any) => p.kind !== "free").map((p: any) => <option key={p.id} value={p.id}>{p.id}</option>)}</Select><Button loading={g.isPending} onClick={() => g.mutate()}>Grant</Button></div></Card>
      <Input label="Search users by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      {users.isLoading ? <Spinner /> : <Table label="Users"><thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Joined</Th><Th>Last sign-in</Th><Th>Manage</Th></tr></thead><tbody>{users.data?.users.map((u) => <tr key={u.id}><Td>{u.name} {u.disabled && <Badge tone="bad">suspended</Badge>}</Td><Td>{u.email}</Td><Td>{u.role}</Td><Td>{fmtDate(u.createdAt)}</Td><Td>{fmtDate(u.lastLoginAt)}</Td><Td><Button variant="secondary" onClick={() => setOpen(open === u.id ? null : u.id)}>{open === u.id ? "Close" : "Open"}</Button></Td></tr>)}</tbody></Table>}
      {open && <UserDetail id={open} />}
    </div>
  );
}

function UserDetail({ id }: { id: string }) {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ["a-user", id], queryFn: () => api<any>(`/admin/users/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["a-user", id] }); qc.invalidateQueries({ queryKey: ["a-users"] }); };
  const toggle = useMutation({ mutationFn: (disable: boolean) => api(`/admin/users/${id}/${disable ? "disable" : "enable"}`, { body: {} }), onSuccess: refresh, onError: (e) => toast(errMsg(e), "bad") });
  const revoke = useMutation({ mutationFn: (eid: string) => api(`/admin/entitlements/${eid}/revoke`, { body: {} }), onSuccess: () => { refresh(); toast("Access revoked"); }, onError: (e) => toast(errMsg(e), "bad") });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="bad">{errMsg(q.error)}</Alert>;
  const { user, orders, entitlements, usage } = q.data;
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl">{user.name} <span className="text-base font-normal text-ink-2">{user.email}</span></h2><p className="text-sm text-ink-2">Joined {fmtDate(user.createdAt)} · {usage.invoices} documents · {usage.inventoryItems} inventory items</p></div>
        {user.role !== "admin" && <Button variant={user.disabled ? "primary" : "danger"} loading={toggle.isPending} onClick={() => confirm(user.disabled ? "Re-enable this account?" : "Suspend this account? They will be signed out and unable to sign in.") && toggle.mutate(!user.disabled)}>{user.disabled ? "Re-enable account" : "Suspend account"}</Button>}</div>
      <div><h3 className="mb-1 text-base">Plans & access</h3>{entitlements.length ? <Table label="Entitlements"><thead><tr><Th>Plan</Th><Th>Status</Th><Th>Credits</Th><Th>Until</Th><Th>Action</Th></tr></thead><tbody>{entitlements.map((e: any) => <tr key={e._id}><Td>{e.planId}{e.source === "admin" && <Badge>granted</Badge>}</Td><Td><Badge tone={e.status === "active" ? "ok" : "neutral"}>{e.status}</Badge></Td><Td>{e.kind === "credits" ? e.creditsRemaining : "—"}</Td><Td>{e.expiresAt ? fmtDate(e.expiresAt) : "No expiry"}</Td><Td>{e.status === "active" && <Button variant="ghost" onClick={() => revoke.mutate(e._id)}>Revoke</Button>}</Td></tr>)}</tbody></Table> : <p className="text-sm text-ink-2">Free plan only.</p>}</div>
      <div><h3 className="mb-1 text-base">Recent orders</h3>{orders.length ? <ul className="space-y-1 text-sm">{orders.map((o: any) => <li key={o._id} className="flex justify-between gap-2"><span>{o.title} · {fmtDate(o.createdAt)}</span><span>{formatInr(o.amountPaise, { compact: false })} <Badge tone={o.status === "paid" ? "ok" : "neutral"}>{o.status}</Badge></span></li>)}</ul> : <p className="text-sm text-ink-2">No orders.</p>}</div>
    </Card>
  );
}

function Promos() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ["a-promos"], queryFn: () => api<{ promos: any[] }>("/admin/promos") });
  const [f, setF] = useState({ code: "", percentOff: "10", maxUses: "", expiresAt: "" });
  const create = useMutation({ mutationFn: () => api("/admin/promos", { body: { code: f.code, percentOff: Number(f.percentOff), maxUses: f.maxUses ? Number(f.maxUses) : null, expiresAt: f.expiresAt || null } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["a-promos"] }); setF({ code: "", percentOff: "10", maxUses: "", expiresAt: "" }); toast("Code created"); }, onError: (e) => toast(errMsg(e), "bad") });
  const toggle = useMutation({ mutationFn: (v: { id: string; active: boolean }) => api(`/admin/promos/${v.id}`, { method: "PATCH", body: { active: v.active } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["a-promos"] }), onError: (e) => toast(errMsg(e), "bad") });
  return (
    <div className="space-y-5">
      <Card className="p-4"><h2 className="mb-1 text-lg">Create a promo code</h2><p className="mb-3 text-sm text-ink-2">Customers enter it at checkout. The discount is applied by the server; the price never drops below ₹1. Each use is counted when the payment is confirmed.</p>
        <div className="grid items-end gap-3 sm:grid-cols-5"><Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="WELCOME20" /><Input label="% off (1–90)" inputMode="numeric" value={f.percentOff} onChange={(e) => setF({ ...f, percentOff: e.target.value })} /><Input label="Max uses (blank = unlimited)" inputMode="numeric" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /><Input label="Expires (optional)" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /><Button loading={create.isPending} disabled={!f.code} onClick={() => create.mutate()}>Create</Button></div></Card>
      {q.isLoading ? <Spinner /> : !q.data!.promos.length ? <p className="text-ink-2">No codes yet. Customers see no promo box effect until you create one.</p> : <Table label="Promo codes"><thead><tr><Th>Code</Th><Th>Discount</Th><Th>Used</Th><Th>Expires</Th><Th>Status</Th></tr></thead><tbody>{q.data!.promos.map((p) => <tr key={p._id}><Td><b>{p.code}</b></Td><Td>{p.percentOff}%</Td><Td>{p.uses}{p.maxUses ? ` / ${p.maxUses}` : ""}</Td><Td>{p.expiresAt ? fmtDate(p.expiresAt) : "Never"}</Td><Td><Button variant="ghost" onClick={() => toggle.mutate({ id: p._id, active: !p.active })}>{p.active ? <Badge tone="ok">Active – turn off</Badge> : <Badge>Off – turn on</Badge>}</Button></Td></tr>)}</tbody></Table>}
    </div>
  );
}

function CatalogAdmin() {
  const qc = useQueryClient(); const toast = useToast();
  const cat = useQuery({ queryKey: ["a-catalog"], queryFn: () => api<any>("/admin/catalog") });
  const [price, setPrice] = useState<Record<string, string>>({});
  const upd = useMutation({ mutationFn: (v: { id: string; body: object }) => api(`/admin/catalog/plan/${v.id}`, { method: "PUT", body: v.body }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["a-catalog"] }); qc.invalidateQueries({ queryKey: ["catalog"] }); toast("Saved"); }, onError: (e) => toast(errMsg(e), "bad") });
  const pub = useMutation({ mutationFn: (v: { slug: string; published: boolean }) => api(`/admin/catalog/product/${v.slug}`, { method: "PUT", body: { published: v.published } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["a-catalog"] }); qc.invalidateQueries({ queryKey: ["catalog"] }); toast("Saved"); }, onError: (e) => toast(errMsg(e), "bad") });
  if (cat.isLoading) return <Spinner />;
  return (
    <div className="space-y-6">
      <Table label="Products"><thead><tr><Th>Product</Th><Th>Published</Th></tr></thead><tbody>{cat.data.products.map((p: any) => <tr key={p.slug}><Td>{p.icon} {p.name}</Td><Td><Button variant="secondary" onClick={() => pub.mutate({ slug: p.slug, published: !p.published })}>{p.published ? "Published – unpublish" : "Hidden – publish"}</Button></Td></tr>)}</tbody></Table>
      <Table label="Plans"><thead><tr><Th>Plan</Th><Th>Product</Th><Th>Price (₹)</Th><Th>Purchasable</Th></tr></thead><tbody>
        {cat.data.plans.filter((p: any) => p.kind !== "free").map((p: any) => (
          <tr key={p.id}><Td>{p.id}</Td><Td>{PRODUCTS.find((x) => x.slug === p.product)?.name}</Td>
            <Td><div className="flex items-end gap-2"><Input label="Price" className="w-28" inputMode="decimal" value={price[p.id] ?? String(p.pricePaise / 100)} onChange={(e) => setPrice({ ...price, [p.id]: e.target.value })} /><Button variant="secondary" onClick={() => upd.mutate({ id: p.id, body: { pricePaise: Math.round(Number(price[p.id] ?? p.pricePaise / 100) * 100) } })}>Save</Button></div></Td>
            <Td><Button variant="ghost" onClick={() => upd.mutate({ id: p.id, body: { active: !p.active } })}>{p.active ? "On – turn off" : "Off – turn on"}</Button></Td></tr>))}</tbody></Table>
      <p className="text-xs text-ink-2">Price changes apply to new orders only. Downloadable assets are defined in code (see docs/admin-guide.md).</p>
    </div>
  );
}

function Support() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ["a-support"], queryFn: () => api<{ items: any[] }>("/admin/support") });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const set = useMutation({ mutationFn: (v: { id: string; status: string; adminNote?: string }) => api(`/admin/support/${v.id}`, { method: "PATCH", body: { status: v.status, adminNote: v.adminNote } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["a-support"] }); toast("Updated"); }, onError: (e) => toast(errMsg(e), "bad") });
  if (q.isLoading) return <Spinner />;
  return <div className="space-y-3">{q.data!.items.map((s) => (
    <Card key={s._id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{s.subject}</p><p className="text-xs text-ink-2">{s.name} · {s.email} · {fmtDate(s.createdAt)}{s.orderId && ` · order ${s.orderId}`}</p></div>
      <Select label="Status" value={s.status} onChange={(e) => set.mutate({ id: s._id, status: e.target.value })}>{["open", "in_progress", "resolved"].map((x) => <option key={x}>{x}</option>)}</Select></div><p className="mt-2 whitespace-pre-wrap text-sm">{s.message}</p><div className="mt-3 flex items-end gap-2"><Input label="Internal note" className="flex-1" value={notes[s._id] ?? s.adminNote ?? ""} onChange={(e) => setNotes({ ...notes, [s._id]: e.target.value })} /><Button variant="secondary" onClick={() => set.mutate({ id: s._id, status: s.status, adminNote: notes[s._id] ?? s.adminNote ?? "" })}>Save note</Button></div></Card>))}
    {!q.data!.items.length && <p className="text-ink-2">No support requests.</p>}</div>;
}

function Audit() {
  const q = useQuery({ queryKey: ["a-audit"], queryFn: () => api<{ items: any[] }>("/admin/audit") });
  if (q.isLoading) return <Spinner />;
  return <Table label="Audit log"><thead><tr><Th>When</Th><Th>Action</Th><Th>Target</Th><Th>IP</Th></tr></thead><tbody>{q.data!.items.map((a) => <tr key={a._id}><Td>{new Date(a.createdAt).toLocaleString("en-IN")}</Td><Td>{a.action}</Td><Td className="max-w-xs truncate">{a.target}</Td><Td>{a.ip}</Td></tr>)}</tbody></Table>;
}
