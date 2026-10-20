import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Sahaj Android app. The app is a native shell around the live workspace: it loads https://sahaj.cmcloud.online directly,
 * so it talks to the live API with the same first-party session cookie as the website and every website release reaches
 * the app immediately. Native features (barcode scanner, share sheet, file saving, system bars, splash) are added on top.
 * `SAHAJ_URL` can point a debug build at a staging server; `SAHAJ_DEBUG=1` enables WebView inspection (chrome://inspect).
 */
const LIVE = process.env.SAHAJ_URL ?? "https://sahaj.cmcloud.online";
const debug = process.env.SAHAJ_DEBUG === "1";
const host = new URL(LIVE).hostname;
const local = LIVE.startsWith("http://"); // only ever used by developers testing against a local server

const config: CapacitorConfig = {
  appId: "online.cmcloud.sahaj",
  appName: "Sahaj",
  webDir: "www-build", // only the offline fallback page lives here (generated from ../shared/www by scripts/prepare-www.mjs)
  backgroundColor: "#050816",
  appendUserAgent: "SahajApp/1.0 (Android)",
  server: {
    url: LIVE,
    androidScheme: "https",
    cleartext: local,
    errorPath: "offline.html", // shown when the live site cannot be reached
    // The app may only navigate inside these sites; any other link opens in the system browser.
    allowNavigation: [host, "sahaj.cmcloud.online", "sahaj.api.cmcloud.online", "*.cashfree.com", "*.razorpay.com"],
  },
  android: {
    allowMixedContent: local,
    webContentsDebuggingEnabled: debug,
    backgroundColor: "#050816",
  },
  plugins: {
    StatusBar: { overlaysWebView: false, style: "DARK", backgroundColor: "#050816" },
    Keyboard: { resizeOnFullScreen: true },
    // We inset the page natively in MainActivity.applySystemBarInsets(), the same on every phone, instead of letting Capacitor pick a mode per WebView version.
    SystemBars: { insetsHandling: "disable" },
  },
};

export default config;
