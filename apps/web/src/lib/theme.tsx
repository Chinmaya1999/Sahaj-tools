import { useCallback, useEffect, useState } from "react";
import { setSystemBars } from "./native";

export type Theme = "dark" | "light";
const KEY = "sahaj-theme";
const META: Record<Theme, string> = { dark: "#050816", light: "#eef3ff" };

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Applies the theme to <html> (CSS reads data-theme) and the browser/OS chrome colour. Dark is the default. */
function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META[t]);
  setSystemBars(t);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (typeof document === "undefined" ? "dark" : currentTheme()));
  useEffect(() => { apply(theme); }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => { const n: Theme = t === "dark" ? "light" : "dark"; try { localStorage.setItem(KEY, n); } catch { /* private mode */ } return n; });
  }, []);
  return { theme, toggle };
}

/** Sun/moon switch used in the header. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" onClick={toggle} role="switch" aria-checked={!dark} aria-label="Light mode"
      className={`relative grid h-10 w-10 shrink-0 md:w-[5rem] items-center rounded-full border border-line bg-card/70 px-1 transition-colors hover:border-brand ${className}`}>
      <span aria-hidden className={`absolute top-1 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand to-holo-violet text-sm shadow-[0_0_14px_-2px_var(--color-brand)] transition-all duration-300 ${dark ? "left-1" : "left-1 md:left-[calc(100%-2rem)]"}`}>{dark ? "🌙" : "☀️"}</span>
      <span aria-hidden className={`hidden px-1 text-[11px] md:block font-bold uppercase tracking-wide text-ink-2 ${dark ? "text-right" : "text-left"}`}>{dark ? "Dark" : "Light"}</span>
    </button>
  );
}
