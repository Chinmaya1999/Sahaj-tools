import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Input, cx } from "../../components/ui";
import { ApiError, api } from "../../lib/api";

export type TabId = "today" | "sell" | "orders" | "products" | "people" | "buying" | "money" | "insights";
export interface Nav { go: (t: TabId) => void }

/** One cache prefix for every MiniStock query so any change refreshes the whole picture (stock, dues, dashboard). */
export const useMs = <T = any,>(path: string, enabled = true) => useQuery({ queryKey: ["ms", path], queryFn: () => api<T>(`/ministock${path}`), enabled });
export function useRefreshAll() { const qc = useQueryClient(); return () => { qc.invalidateQueries({ queryKey: ["ms"] }); qc.invalidateQueries({ queryKey: ["inv-dash"] }); }; }

/** New key per attempt: a double tap or network retry carries the same key and cannot create a second order. */
export const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Slide-up sheet on phones, centred dialog on larger screens. */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; ref.current?.focus(); return () => prev?.focus?.(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div ref={ref} tabIndex={-1} className={cx("max-h-[92vh] w-full overflow-auto rounded-t-3xl border border-line bg-paper p-5 pb-8 shadow-lift outline-none sm:rounded-3xl", wide ? "max-w-3xl" : "max-w-xl")}>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-2xl">{title}</h2><button type="button" aria-label="Close" className="h-10 w-10 shrink-0 rounded-lg hover:bg-paper-2" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Rupee text field; the parent converts to paise. */
export function Rs({ label, value, onChange, error, hint, className }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; className?: string }) {
  return <Input label={label} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} error={error} hint={hint} className={className} placeholder="0" />;
}

const TONE: Record<string, "neutral" | "ok" | "warn" | "bad" | "brand"> = { draft: "neutral", confirmed: "brand", packed: "brand", shipped: "warn", delivered: "ok", cancelled: "bad", partially_returned: "warn", returned: "bad", ordered: "brand", partially_received: "warn", received: "ok", pending: "warn", failed: "bad" };
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={TONE[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError;
  return <Alert tone="bad">{e.message}{e.code === "INSUFFICIENT_STOCK" && e.body ? ` (you asked for ${e.body.requested}, ${e.body.available} available)` : ""}</Alert>;
}

export const stat = (label: string, value: string | number, opts: { tone?: string; sub?: string; onClick?: () => void } = {}) => {
  const inner = <><p className="text-sm text-ink-2">{label}</p><p className={cx("mt-0.5 text-2xl font-semibold", opts.tone)}>{value}</p>{opts.sub && <p className="mt-0.5 text-xs text-ink-2">{opts.sub}</p>}</>;
  return opts.onClick
    ? <button type="button" onClick={opts.onClick} className="rounded-2xl border border-line bg-card p-4 text-left shadow-soft transition hover:border-brand">{inner}</button>
    : <div className="rounded-2xl border border-line bg-card p-4 shadow-soft">{inner}</div>;
};

/** Debounced value for search boxes. */
export function useDebounced<T>(v: T, ms = 250) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; }
export const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
export const monthStartIst = () => todayIst().slice(0, 8) + "01";
