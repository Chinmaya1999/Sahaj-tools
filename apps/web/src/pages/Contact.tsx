import { useState } from "react";
import { supportSchema } from "@ek/shared";
import { api, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Input, PageHeader, Textarea } from "../components/ui";

export default function Contact() {
  const { user } = useAuth();
  const [v, setV] = useState({ name: user?.name ?? "", email: user?.email ?? "", subject: "", message: "", orderId: "" });
  const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const r = supportSchema.safeParse({ ...v, orderId: v.orderId || undefined });
    if (!r.success) { const m: Record<string, string> = {}; r.error.issues.forEach((i) => (m[String(i.path[0])] ??= i.message)); setErrors(m); return; }
    setErrors({}); setBusy(true);
    try { await api("/support", { body: r.data }); setDone(true); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <PageHeader title="Contact support" sub="Tell us what happened. If it is about a payment or download, include your order number." />
      {done ? <Alert tone="ok" title="Message received">Thanks – we will reply by email.</Alert> : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {err && <Alert tone="bad">{err}</Alert>}
          <Input label="Name" value={v.name} onChange={set("name")} error={errors.name} />
          <Input label="Email" type="email" value={v.email} onChange={set("email")} error={errors.email} />
          <Input label="Subject" value={v.subject} onChange={set("subject")} error={errors.subject} />
          <Input label="Order number (optional)" value={v.orderId} onChange={set("orderId")} error={errors.orderId} />
          <Textarea label="Message" rows={6} value={v.message} onChange={set("message")} error={errors.message} />
          <Button type="submit" loading={busy}>Send message</Button>
        </form>
      )}
    </div>
  );
}
