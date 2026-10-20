import { BRAND } from "@ek/shared";
import { cx } from "./ui";

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <defs><linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6d6bf5" /><stop offset="1" stopColor="#3b33c4" /></linearGradient><linearGradient id="lm-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd166" /><stop offset="1" stopColor="#f59e0b" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#lm-g)" />
      <path d="M43 21.5c-2.2-3.4-5.8-5.2-10.4-5.2-6.2 0-10.4 3.2-10.4 8 0 11.2 21.2 5.2 21.2 17.2 0 5-4.6 8.8-11.3 8.8-5 0-9.4-2.2-11.9-5.8" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48.5" cy="15.5" r="5" fill="url(#lm-s)" />
    </svg>
  );
}
export function Logo({ light }: { light?: boolean }) {
  return <span className="flex items-center gap-2.5"><LogoMark /><span className={cx("font-display text-2xl font-semibold leading-none tracking-tight", light && "text-white")}>{BRAND.name}</span></span>;
}
