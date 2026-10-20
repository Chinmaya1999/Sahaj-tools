import { BRAND } from "@ek/shared";
import { cx } from "./ui";

/** The Oqzra "Q" mark (artwork in /logo-mark.png). */
export function LogoMark({ size = 36 }: { size?: number }) {
  return <img src="/logo-mark.png" alt="" aria-hidden width={size} height={size} className="shrink-0 select-none" draggable={false} />;
}
export function Logo({ light }: { light?: boolean }) {
  return <span className="flex items-center gap-2.5"><LogoMark /><span className={cx("font-display text-2xl font-semibold leading-none tracking-tight", light && "text-white")}>{BRAND.name}</span></span>;
}
