import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "btn-holo",
  secondary: "bg-card text-ink border border-line hover:bg-paper-2",
  ghost: "text-ink hover:bg-paper-2",
  danger: "bg-bad text-white hover:opacity-90",
};
const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-11 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none";

export function Button({ variant = "primary", className, loading, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.button whileTap={reduce ? undefined : { scale: 0.97 }} className={cx(base, variants[variant], className)} disabled={p.disabled || loading} {...(p as object)}>
      {loading && <Spinner small />}{children}
    </motion.button>
  );
}
export function LinkButton({ variant = "primary", className, ...p }: LinkProps & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...p} />;
}

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="Loading" className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", small ? "h-4 w-4" : "h-6 w-6")} />;
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-2xl border border-line bg-card shadow-soft holo-hover", className)} {...p}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "brand"; children: ReactNode }) {
  const t = { neutral: "bg-paper-2 text-ink-2", ok: "bg-ok-bg text-ok", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad", brand: "bg-brand-50 text-brand-700" }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", t)}>{children}</span>;
}

export function Alert({ tone = "info", children, title }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode; title?: string }) {
  const t = { info: "bg-brand-50 text-brand-700 border-brand/20", ok: "bg-ok-bg text-ok border-ok/20", warn: "bg-warn-bg text-warn border-warn/20", bad: "bg-bad-bg text-bad border-bad/20" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", t)}>
      {title && <p className="font-semibold">{title}</p>}<div>{children}</div>
    </div>
  );
}

interface FieldShell { label: string; error?: string; hint?: string; className?: string }
const inputCls = "w-full min-h-11 rounded-xl border border-line bg-paper/70 px-3 py-2 text-base sm:text-sm text-ink placeholder:text-ink-2/60 focus:border-brand";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldShell>(function Input({ label, error, hint, className, ...p }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} ref={ref} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} className={cx(inputCls, error && "border-bad")} {...p} />
      {hint && !error && <p id={`${id}-h`} className="mt-1 text-xs text-ink-2">{hint}</p>}
      {error && <p id={`${id}-e`} className="mt-1 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell>(function Textarea({ label, error, hint, className, ...p }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <textarea id={id} ref={ref} rows={3} aria-invalid={!!error} className={cx(inputCls, "min-h-24", error && "border-bad")} {...p} />
      {hint && !error && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldShell>(function Select({ label, error, className, children, ...p }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <select id={id} ref={ref} className={cx(inputCls, error && "border-bad")} {...p}>{children}</select>
      {error && <p className="mt-1 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
});

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>{sub && <p className="mt-1 max-w-2xl text-ink-2">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center"><p className="font-semibold">{title}</p><div className="mt-1 text-sm text-ink-2">{children}</div></div>;
}

export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" }) {
  const reduce = useReducedMotion();
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag className={className} initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay, ease: "easeOut" }}>
      {children}
    </Tag>
  );
}

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return <div className="overflow-x-auto rounded-2xl border border-line bg-card"><table aria-label={label} className="w-full min-w-[560px] text-left text-sm">{children}</table></div>;
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th scope="col" className={cx("whitespace-nowrap bg-paper-2/60 px-3 py-2.5 font-semibold text-ink-2", className)}>{children}</th>;
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx("border-t border-line px-3 py-2.5 align-top", className)}>{children}</td>;
