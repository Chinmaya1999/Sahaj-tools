import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { loginSchema, registerSchema, forgotSchema, resetSchema } from "@ek/shared";
import { useAuth } from "../lib/auth";
import { ApiError, api, errMsg } from "../lib/api";
import { Alert, Button, Card, Input } from "../components/ui";
import type { ZodType } from "zod";

function useForm<T extends Record<string, string>>(initial: T, schema: ZodType) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof T) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const validate = () => {
    const r = schema.safeParse(v);
    if (r.success) { setErrors({}); return true; }
    const m: Record<string, string> = {};
    for (const i of r.error.issues) m[String(i.path[0])] ??= i.message;
    setErrors(m); return false;
  };
  return { v, set, errors, setErrors, validate };
}

const BENEFITS = ["Seven everyday tools, free to start", "Invoices, stock and resumes saved safely to your account", "Pay only for what you use. Nothing renews by itself", "Export or delete your data any time"];

const Shell = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="mx-auto grid min-h-[calc(100vh-10rem)] max-w-5xl items-stretch gap-0 px-4 py-8 md:grid-cols-[1fr_1.1fr] md:py-14">
    <aside className="relative hidden overflow-hidden rounded-l-3xl bg-ink p-10 text-white md:flex md:flex-col md:justify-between">
      <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/60 blur-3xl" />
      <div aria-hidden className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-warn/30 blur-3xl" />
      <div className="relative"><p className="font-display text-3xl font-semibold leading-tight">Small tools. Real solutions.</p><p className="mt-2 text-white/80">Fix the everyday jobs that eat your time.</p></div>
      <ul className="relative mt-8 space-y-3 text-sm">{BENEFITS.map((b) => <li key={b} className="flex gap-3"><span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-xs">✓</span>{b}</li>)}</ul>
      <p className="relative mt-8 flex items-center gap-2 text-xs text-white/75"><span aria-hidden>🔒</span> Passwords are protected with Argon2id. Sessions use secure cookies.</p>
    </aside>
    <Card className="rounded-3xl p-6 sm:p-8 md:rounded-l-none"><h1 className="text-3xl font-semibold">{title}</h1>{sub && <p className="mb-5 mt-1 text-ink-2">{sub}</p>}<div className={sub ? "" : "mt-5"}>{children}</div></Card>
  </div>
);

function PasswordField({ label, value, onChange, error, hint, autoComplete, meter }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; error?: string; hint?: string; autoComplete: string; meter?: boolean }) {
  const [show, setShow] = useState(false);
  const rules = [["10+ characters", value.length >= 10], ["A letter", /[A-Za-z]/.test(value)], ["A number", /\d/.test(value)]] as const;
  const score = rules.filter((r) => r[1]).length + (value.length >= 14 || /[^A-Za-z0-9]/.test(value) ? 1 : 0);
  const tone = score <= 1 ? "bg-bad" : score === 2 ? "bg-warn" : score === 3 ? "bg-brand" : "bg-ok";
  return (
    <div>
      <div className="relative">
        <Input label={label} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} error={error} hint={meter ? undefined : hint} className="[&_input]:pr-16" />
        <button type="button" aria-pressed={show} aria-label={show ? "Hide characters" : "Show characters"} onClick={() => setShow((x) => !x)} className="absolute right-1 top-[1.65rem] min-h-9 rounded-lg px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">{show ? "Hide" : "Show"}</button>
      </div>
      {meter && value && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>{[1, 2, 3, 4].map((n) => <i key={n} className={`h-1.5 flex-1 rounded-full ${score >= n ? tone : "bg-line"}`} />)}</div>
          <p className="mt-1 text-xs text-ink-2">Strength: <b>{["Too weak", "Weak", "Okay", "Good", "Strong"][score]}</b> · {rules.map((r) => `${r[1] ? "✓" : "○"} ${r[0]}`).join("  ")}</p>
        </div>
      )}
    </div>
  );
}

export function Login() {
  const { login } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const f = useForm({ email: "", password: "" }, loginSchema);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); if (!f.validate()) return;
    setBusy(true);
    try { await login(f.v.email, f.v.password); nav((loc.state as any)?.from ?? "/account", { replace: true }); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title="Welcome back" sub="Sign in to your tools, invoices and orders.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {err && <Alert tone="bad">{err}</Alert>}
        <Input label="Email" type="email" autoComplete="email" value={f.v.email} onChange={f.set("email")} error={f.errors.email} />
        <PasswordField label="Password" autoComplete="current-password" value={f.v.password} onChange={f.set("password")} error={f.errors.password} />
        <Button type="submit" loading={busy} className="w-full text-base">Sign in</Button>
      </form>
      <p className="mt-4 text-sm"><Link className="text-brand underline" to="/forgot-password">Forgot your password?</Link></p>
      <p className="mt-2 text-sm text-ink-2">New here? <Link className="font-semibold text-brand underline" to="/register">Create an account</Link></p>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth(); const nav = useNavigate();
  const f = useForm({ name: "", email: "", password: "" }, registerSchema);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); if (!f.validate()) return;
    setBusy(true);
    try { await register(f.v.name, f.v.email, f.v.password); nav("/account", { replace: true }); }
    catch (x) { if (x instanceof ApiError && x.status === 409) f.setErrors({ email: "An account with this email already exists. Try signing in." }); else setErr(errMsg(x)); }
    finally { setBusy(false); }
  }
  return (
    <Shell title="Create your free account" sub="Takes under a minute. No card needed.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {err && <Alert tone="bad">{err}</Alert>}
        <Input label="Name" autoComplete="name" value={f.v.name} onChange={f.set("name")} error={f.errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={f.v.email} onChange={f.set("email")} error={f.errors.email} />
        <PasswordField meter label="Password" autoComplete="new-password" value={f.v.password} onChange={f.set("password")} error={f.errors.password} />
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
      <p className="mt-4 text-xs text-ink-2">By creating an account you agree to the <Link className="underline" to="/terms">Terms</Link> and <Link className="underline" to="/privacy">Privacy policy</Link>.</p>
      <p className="mt-2 text-sm text-ink-2">Already registered? <Link className="font-semibold text-brand underline" to="/login">Sign in</Link></p>
    </Shell>
  );
}

export function ForgotPassword() {
  const f = useForm({ email: "" }, forgotSchema);
  const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); if (!f.validate()) return; setBusy(true);
    try { await api("/auth/forgot", { body: f.v }); setDone(true); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title="Reset your password">
      {done ? <Alert tone="ok">If that email is registered, a reset link is on its way. It works for 30 minutes.</Alert> : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {err && <Alert tone="bad">{err}</Alert>}
          <Input label="Email" type="email" value={f.v.email} onChange={f.set("email")} error={f.errors.email} />
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams(); const nav = useNavigate();
  const f = useForm({ token: sp.get("token") ?? "", password: "" }, resetSchema);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); if (!f.validate()) return; setBusy(true);
    try { await api("/auth/reset", { body: f.v }); setDone(true); setTimeout(() => nav("/login"), 1500); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title="Choose a new password">
      {done ? <Alert tone="ok">Password updated. Redirecting to sign in…</Alert> : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {err && <Alert tone="bad">{err} <Link className="underline" to="/forgot-password">Request a new link</Link></Alert>}
          {f.errors.token && <Alert tone="bad">This reset link is incomplete. Request a new one.</Alert>}
          <PasswordField meter label="New password" autoComplete="new-password" value={f.v.password} onChange={f.set("password")} error={f.errors.password} />
          <Button type="submit" loading={busy} className="w-full">Update password</Button>
        </form>
      )}
    </Shell>
  );
}
