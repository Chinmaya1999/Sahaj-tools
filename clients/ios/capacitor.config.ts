import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Sahaj iOS app. The app is a native shell around the live workspace: it loads https://sahaj.cmcloud.online directly,
 * so it talks to the live API with the same first-party session cookie as the website and every website release reaches
 * the app immediately. Native features (barcode scanner, share sheet, file saving, system bars, splash) are added on top.
 * `SAHAJ_URL` can point a debug build at a staging server.
 */
const LIVE = process.env.SAHAJ_URL ?? "https://sahaj.cmcloud.online";
const host = new URL(LIVE).hostname;
const local = LIVE.startsWith("http://"); // only ever used by developers testing against a local server

const config: CapacitorConfig = {
  appId: "online.cmcloud.sahaj",
  appName: "Sahaj",
  webDir: "www-build", // only the offline fallback page lives here (generated from ../shared/www by scripts/prepare-www.mjs)
  backgroundColor: "#050816",
  appendUserAgent: "SahajApp/1.0 (iOS)",
  server: {
    url: LIVE,
    cleartext: local,
    errorPath: "offline.html", // shown when the live site cannot be reached
    // The app may only navigate inside these sites; any other link opens in the system browser.
    allowNavigation: [host, "sahaj.cmcloud.online", "sahaj.api.cmcloud.online", "*.cashfree.com", "*.razorpay.com"],
  },
  ios: {
    backgroundColor: "#050816",
    contentInset: "never", // the website handles safe areas itself with CSS env()
    limitsNavigationsToAppBoundDomains: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2500, // safety net; the web app hides it as soon as it has rendered
      backgroundColor: "#050816",
      showSpinner: false,
    },
    StatusBar: { style: "DARK" },
    Keyboard: { resizeOnFullScreen: true },
  },
};

export default config;
