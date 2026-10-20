// Drives the real Sahaj app on a running Android emulator/device through the WebView debugging channel.
//   SAHAJ_DEBUG=1 SAHAJ_URL=http://10.0.2.2:5174 npx cap sync android && (cd android && ./gradlew assembleDebug)   # debug APK -> local test server
//   adb install -r android/app/build/outputs/apk/debug/app-debug.apk && node test/device-test.mjs
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ADB, adb, sh, sleep, launchApp } from "./cdp.mjs";

const APP = "online.cmcloud.sahaj";
const SHOTS = process.env.SHOTS ?? "/tmp";
const results = [];
const screenshot = (name) => writeFileSync(`${SHOTS}/${name}.png`, execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 50e6 }));
async function check(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true }); console.log("PASS", name, note ? `(${note})` : ""); }
  catch (e) {
    results.push({ name, ok: false }); console.log("FAIL", name, "-", String(e.message).split("\n")[0]);
    try { // what was on screen when it failed
      console.log("     url:", await page.url(), "| alerts:", JSON.stringify(await page.eval(`[...document.querySelectorAll('[role=alert],[role=status]')].map((e) => e.innerText)`)));
      screenshot("failed-" + results.length);
    } catch { /* page not reachable */ }
  }
}
const topActivity = () => sh("dumpsys activity activities | grep -i 'ResumedActivity' || true");
async function waitTop(re, what) { let t = ""; for (let i = 0; i < 24; i++) { t = topActivity(); if (re.test(t)) return t; await sleep(500); } throw new Error(`${what} did not appear: ${t.trim()}`); }
const back = async () => { sh("input keyevent 4"); await sleep(900); };

let page = await launchApp(APP);
const email = `device${Date.now()}@example.com`, PW = "Dev1ce-test-pass-1";
const jsErrors = () => page.errors.filter((e) => !/favicon|404|\.map/.test(e));
const api = (path, body, method = "POST") => page.eval(`fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(method)}, credentials: "include", headers: { "Content-Type": "application/json", "X-Requested-With": "ek" }, body: JSON.stringify(${JSON.stringify(body)}) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))`);

await check("app opens on the sign-in screen with no marketing navigation", async () => {
  await page.waitUrl(/\/login$/);
  if (await page.eval(`!!document.querySelector('nav[aria-label="Main"]')`)) throw new Error("marketing navigation is visible");
  screenshot("android-login");
  return await page.url();
});
await check("native bridge is present with every plugin", async () => {
  const r = await page.eval(`({ native: window.Capacitor?.isNativePlatform?.(), platform: window.Capacitor?.getPlatform?.(), cls: document.documentElement.className, ua: navigator.userAgent.includes("SahajApp"), plugins: ["BarcodeScanner","Share","Filesystem","StatusBar","SplashScreen","Haptics","SahajNative","App","Network","Keyboard"].filter((p) => !!window.Capacitor?.Plugins?.[p]) })`);
  if (!r.native || r.platform !== "android") throw new Error("not native: " + JSON.stringify(r));
  if (!r.cls.includes("app-android") || !r.ua) throw new Error("app mode not applied: " + r.cls);
  if (r.plugins.length !== 10) throw new Error("plugins found: " + r.plugins.join());
  return r.plugins.length + " plugins";
});
await check("create an account and land on the dashboard", async () => {
  await page.click("Create an account"); await page.waitUrl(/\/register$/);
  await page.fill("Name", "Device Tester"); await page.fill("Email", email); await page.fill("Password", PW);
  await page.click("Create account");
  await page.waitUrl(/\/account$/); await page.waitText(/^Hello, Device/);
  screenshot("android-dashboard");
});
await check("phone workspace: top bar, bottom tabs, no sideways scroll", async () => {
  await page.waitFor(`!!document.querySelector('nav[aria-label="Quick tabs"]')`, "bottom tabs");
  const over = await page.eval("document.documentElement.scrollWidth - document.documentElement.clientWidth");
  if (over > 1) throw new Error("page overflows by " + over + "px");
});
await check("session survives an app restart", async () => { page.close(); sh("input keyevent 3"); await sleep(1500); /* home: the app is backgrounded like a real user would */ page = await launchApp(APP); await page.waitUrl(/\/account$/); await page.waitText(/^Hello, Device/); });
await check("splash screen is dismissed once the app has loaded", async () => {
  let n = 1; for (let i = 0; i < 20 && n > 0; i++) { n = Number(sh("dumpsys window | grep -i -c 'Splash Screen online.cmcloud' || true")); if (n > 0) await sleep(500); }
  if (n > 0) throw new Error("splash window still present after 10s");
});
await check("add a product and make a sale with a part payment", async () => {
  const p = await api("/api/ministock/products", { name: "Device Shirt", sku: "DEV-1", costPaise: 50000, pricePaise: 79900, taxPercent: 5, openingQty: 10, reorderLevel: 2 });
  if (p.status !== 201) throw new Error("product " + p.status);
  await page.goto("/tools/inventory?tab=sell");
  await page.fill("Search product", "Device"); await page.click(/Device Shirt/);
  await page.fill("Amount received ₹", "500");
  await page.click("Confirm sale"); await page.waitText(/S-0001 saved/); await page.waitText("Balance due");
  screenshot("android-sale");
});
await check("camera scan button is available in Sell and Products", async () => {
  await page.goto("/tools/inventory?tab=sell"); await page.waitControl("Scan with the camera");
  await page.click("Products"); await page.waitControl("Scan with the camera");
  screenshot("android-products");
});
await check("scanner plugin reports support; barcode lookup works", async () => {
  const sup = await page.eval("window.Capacitor.Plugins.BarcodeScanner.isSupported()");
  const found = await page.eval(`fetch("/api/ministock/products/barcode/DEV-1", { credentials: "include" }).then((r) => r.status)`);
  if (found !== 200) throw new Error("lookup " + found);
  return "supported=" + sup.supported;
});
await check("report CSV opens the system share/save sheet and writes the file", async () => {
  await page.click("Insights"); await page.click("Download CSV");
  await waitTop(/Chooser|Resolver|intentresolver/i, "the share sheet");
  screenshot("android-share-sheet");
  const files = sh(`run-as ${APP} ls cache`);
  if (!/\.csv/.test(files)) throw new Error("file not written: " + files);
  await back(); return files.split("\n").find((f) => f.endsWith(".csv"));
});
await check("window.print() opens the Android print service", async () => {
  await page.eval("setTimeout(() => window.print(), 50)");
  await waitTop(/print/i, "the print dialog"); screenshot("android-print"); await back();
});
await check("printing an HTML receipt works", async () => {
  await page.eval(`window.Capacitor.Plugins.SahajNative.printHtml({ html: "<h1>Receipt</h1><p>Test</p>", name: "Receipt test" })`);
  await waitTop(/print/i, "the print dialog"); await back();
});
await check("hardware back button goes back inside the app", async () => {
  await page.goto("/account"); await page.waitText(/^Hello, Device/);
  await page.click(/Invoices$/); await page.waitUrl(/\/tools\/invoice/);
  await back(); await page.waitUrl(/\/account$/, 8000);
});
await check("back button closes an open sheet before leaving the page", async () => {
  await page.goto("/tools/inventory?tab=people"); await page.waitText("+ Add customer");
  await page.click("+ Add customer"); await page.waitFor(`!!document.querySelector('[role="dialog"]')`, "the sheet");
  await back(); await page.waitFor(`!document.querySelector('[role="dialog"]')`, "the sheet to close", 6000);
  if (!/tools\/inventory/.test(await page.url())) throw new Error("left the page instead of closing the sheet");
});
await check("back at a top-level screen sends the app to the background", async () => {
  await page.goto("/account"); await page.waitText(/^Hello, Device/);
  await back(); await sleep(800);
  if (/online\.cmcloud\.sahaj/.test(topActivity())) throw new Error("the app is still in the foreground: " + topActivity().trim());
  if (!sh(`pidof ${APP} || true`).trim()) throw new Error("the app was killed instead of minimised");
  sh(`am start -n ${APP}/.MainActivity`); await sleep(1500);
});
await check("light/dark theme switch updates the page and status bar", async () => {
  await page.click("Light mode"); await sleep(900); screenshot("android-light");
  if ((await page.eval("document.documentElement.dataset.theme")) !== "light") throw new Error("theme not light");
  await page.click("Light mode"); await sleep(500);
});
await check("offline: friendly screen, then reconnects on its own", async () => {
  sh("svc wifi disable"); sh("svc data disable"); await sleep(2000);
  page.close(); page = await launchApp(APP);
  await page.waitText("You're offline", 30_000); screenshot("android-offline");
  sh("svc wifi enable"); sh("svc data enable");
  await page.waitFor(`!location.href.includes("offline.html")`, "automatic reconnect", 45_000);
  await page.waitText(/^Hello, Device/, 25_000);
});
await check("no crashes or ANRs in the device log", async () => {
  const bad = adb("logcat", "-d", "-v", "brief").split("\n").filter((l) => /FATAL EXCEPTION|ANR in online\.cmcloud|AndroidRuntime.*online\.cmcloud/.test(l));
  if (bad.length) throw new Error(bad[0]);
});
await check("no JavaScript errors in the app", async () => { if (jsErrors().length) throw new Error(jsErrors().slice(0, 3).join(" | ")); });

try { await api("/api/account", { password: PW, confirm: "DELETE" }, "DELETE"); } catch { /* best effort */ }
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} device checks passed`);
page.close();
process.exit(failed.length ? 1 : 0);
