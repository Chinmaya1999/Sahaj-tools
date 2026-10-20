/**
 * Bridge to the Sahaj apps. The Android and iOS apps (Capacitor) and the Windows app (Electron) load this same website
 * and expose native abilities to it. On the plain web every function here is a harmless no-op, so the website works
 * identically in a browser. No native package is bundled into the website; the app injects `window.Capacitor` itself.
 */
type Plugin = Record<string, (...a: any[]) => any>;
interface Cap { isNativePlatform(): boolean; getPlatform(): string; Plugins: Record<string, Plugin | undefined> }
interface Desktop { platform: string; version: string; setTheme(t: "dark" | "light"): void }

const cap = () => (globalThis as { Capacitor?: Cap }).Capacitor;
const desktop = () => (globalThis as { sahajDesktop?: Desktop }).sahajDesktop;
const plugin = (name: string) => cap()?.Plugins?.[name];

/** True inside the Android or iOS app. */
export const isMobileApp = () => !!cap()?.isNativePlatform?.();
/** True inside the Windows desktop app. */
export const isDesktopApp = () => !!desktop();
/** "android" | "ios" | "windows" | "web" */
export const appPlatform = () => (isMobileApp() ? cap()!.getPlatform() : isDesktopApp() ? "windows" : "web");
export const isApp = () => isMobileApp() || isDesktopApp();

const BARS = { dark: "#050816", light: "#eef3ff" } as const;

/** One-time set-up when the page starts inside an app. */
export function initNative(theme: "dark" | "light") {
  if (!isApp()) return;
  const root = document.documentElement;
  root.classList.add("app", `app-${appPlatform()}`);
  setSystemBars(theme);
  // Android's WebView has no print dialog of its own. Route print buttons to the native print service instead.
  if (isMobileApp() && plugin("SahajNative")?.print) window.print = () => { void plugin("SahajNative")!.print({ name: document.title || "Sahaj" }); };
  installBackButton();
  // Everything has rendered: let the app's animated splash finish and fade out (the app also dismisses it itself when the page has loaded).
  requestAnimationFrame(() => { void plugin("SahajNative")?.hideSplash?.(); void plugin("SplashScreen")?.hide?.({ fadeOutDuration: 200 }); });
}

/** Screens where Back should leave the app instead of going to an earlier page. */
const ROOT_SCREENS = new Set(["/account", "/login", "/register", "/"]);

/**
 * Android back button: first close an open sheet, menu or search; otherwise go back one page; at a top-level screen
 * send the app to the background (like other Android apps) instead of doing nothing.
 */
function installBackButton() {
  const app = plugin("App");
  if (!isMobileApp() || !app?.addListener) return;
  app.addListener("backButton", ({ canGoBack }: { canGoBack: boolean }) => {
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const top = dialogs[dialogs.length - 1];
    if (top) {
      const close = top.querySelector<HTMLElement>('button[aria-label^="Close"]');
      if (close) { close.click(); return; }
      const key = { key: "Escape", bubbles: true };
      (top.querySelector("input") ?? top).dispatchEvent(new KeyboardEvent("keydown", key));
      if (document.contains(top) && top.getAttribute("aria-label") === "Search") top.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); // search palette closes on backdrop press
      return;
    }
    if (canGoBack && !ROOT_SCREENS.has(location.pathname)) { history.back(); return; }
    void app.minimizeApp?.();
  });
}

/** Match the phone's status bar (or the desktop title bar) to the website's theme. */
export function setSystemBars(theme: "dark" | "light") {
  try {
    desktop()?.setTheme(theme);
    const sb = plugin("StatusBar");
    if (sb) { void sb.setStyle?.({ style: theme === "dark" ? "DARK" : "LIGHT" }); void sb.setBackgroundColor?.({ color: BARS[theme] }); }
  } catch { /* cosmetic only */ }
}

/** Light tap feedback on important actions. */
export function haptic() { try { void plugin("Haptics")?.impact?.({ style: "LIGHT" }); } catch { /* ignore */ } }

/* ---------------- barcode / QR scanning ---------------- */
export const canScan = () => isMobileApp() && !!plugin("BarcodeScanner");

/** Opens the camera scanner and resolves with the scanned text, or null if cancelled or unavailable. */
export async function scanCode(): Promise<string | null> {
  const bs = plugin("BarcodeScanner"); if (!bs) return null;
  try {
    if (cap()!.getPlatform() === "android") {
      const { available } = await bs.isGoogleBarcodeScannerModuleAvailable();
      if (!available) await installScannerModule(bs);
    } else {
      // iOS shows its own camera view and needs the camera permission first.
      const perm = await bs.checkPermissions();
      if (perm.camera !== "granted") {
        const asked = await bs.requestPermissions();
        if (asked.camera !== "granted") throw new Error("Allow camera access in Settings to scan barcodes.");
      }
    }
    const r = await bs.scan();
    haptic();
    return r?.barcodes?.[0]?.rawValue ?? null;
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message))) return null;
    throw e;
  }
}
/** Google's scanner is a small on-demand module; install it once and wait for it. */
async function installScannerModule(bs: Plugin) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The scanner could not be set up. Check your connection and try again.")), 60_000);
    let handle: { remove(): void } | undefined;
    Promise.resolve(bs.addListener("googleBarcodeScannerModuleInstallProgress", (ev: { state: number }) => {
      if (ev.state === 4) { clearTimeout(timer); handle?.remove(); resolve(); }          // COMPLETED
      else if (ev.state === 5 || ev.state === 3) { clearTimeout(timer); handle?.remove(); reject(new Error("The scanner could not be installed.")); } // FAILED / CANCELED
    })).then((h) => { handle = h; bs.installGoogleBarcodeScannerModule().catch(reject); });
  });
}

/* ---------------- files and sharing ---------------- */
const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const fr = new FileReader(); fr.onerror = () => rej(fr.error); fr.onload = () => res(String(fr.result).split(",")[1] ?? ""); fr.readAsDataURL(blob);
});

/**
 * Android's WebView cannot save a generated file with a normal download link. In the app we write the file to the app cache and
 * open the system share sheet (Save to Files / Drive, WhatsApp, email, print...). Returns false if the app cannot do it, so the caller can fall back.
 */
export async function saveFileNative(blob: Blob, filename: string): Promise<boolean> {
  const fs = plugin("Filesystem"), share = plugin("Share");
  if (!isMobileApp() || !fs || !share) return false;
  const safe = filename.replace(/[^\w.\- ]+/g, "_");
  await fs.writeFile({ path: safe, data: await toBase64(blob), directory: "CACHE" });
  const { uri } = await fs.getUri({ path: safe, directory: "CACHE" });
  await share.share({ title: safe, url: uri, dialogTitle: "Save or share" });
  return true;
}

/** Native share sheet for text (receipts, order summaries). Falls back to the Web Share API, then returns false. */
export async function shareText(text: string, title = "Sahaj"): Promise<boolean> {
  const share = plugin("Share");
  if (share) { await share.share({ title, text, dialogTitle: "Share" }); return true; }
  if (typeof navigator !== "undefined" && "share" in navigator) { await navigator.share({ title, text }); return true; }
  return false;
}
export const canShare = () => !!plugin("Share") || (typeof navigator !== "undefined" && "share" in navigator);

/** Prints a snippet of HTML with the system print service (Android). Returns false where unsupported. */
export async function printHtmlNative(html: string, name: string): Promise<boolean> {
  const p = plugin("SahajNative");
  if (!isMobileApp() || !p?.printHtml) return false;
  await p.printHtml({ html, name });
  return true;
}
