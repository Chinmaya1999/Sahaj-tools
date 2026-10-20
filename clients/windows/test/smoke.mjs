// Launches the real desktop app and checks it. Usage: SAHAJ_URL=http://localhost:5174 node test/smoke.mjs
// (SAHAJ_URL points the unpackaged app at a local test server; the packaged app always uses the live site.)
import { _electron as electron } from "playwright-core";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.env.SAHAJ_URL ?? "http://localhost:5174";
const results = [];
async function check(name, fn) {
  try { const note = await fn(); results.push(true); console.log("PASS", name, note ? `(${note})` : ""); }
  catch (e) { results.push(false); console.log("FAIL", name, "-", String(e.message).split("\n")[0]); }
}
// Some terminals/IDEs set ELECTRON_RUN_AS_NODE, which turns Electron into plain Node. Remove it so the real app starts.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE"));
const launch = (env = {}) => electron.launch({ args: [root, "--no-sandbox"], env: { ...cleanEnv, SAHAJ_URL: URL_, ...env }, cwd: root });

const app = await launch();
const page = await app.firstWindow();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 140)); });
const email = `desktop${Date.now()}@example.com`, PW = "Dev1ce-test-pass-1";

await check("opens the sign-in screen (no marketing navigation)", async () => {
  await page.waitForURL(/\/login$/, { timeout: 30_000 });
  if (await page.getByRole("navigation", { name: "Main" }).count()) throw new Error("marketing nav visible");
  return (await page.title()) || page.url();
});
await check("desktop bridge is exposed; Node and Electron are not reachable from the page", async () => {
  const r = await page.evaluate(() => ({ desk: window.sahajDesktop && { p: window.sahajDesktop.platform, v: window.sahajDesktop.version }, req: typeof window.require, proc: typeof window.process, cls: document.documentElement.className, ua: navigator.userAgent }));
  if (r.desk?.p !== "windows" || r.desk?.v !== "1.0.0") throw new Error("bridge: " + JSON.stringify(r.desk));
  if (r.req !== "undefined" || r.proc !== "undefined") throw new Error(`Node leaked: require=${r.req} process=${r.proc}`);
  if (!r.cls.includes("app-windows") || !/SahajApp\/1\.0\.0 \(Windows\)/.test(r.ua)) throw new Error("app mode / UA missing: " + r.cls);
});
await check("window uses hardened web preferences", async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const p = w.webContents.getLastWebPreferences(); return { ci: p.contextIsolation, sb: p.sandbox, ni: p.nodeIntegration, ws: p.webSecurity }; });
  if (!prefs.ci || !prefs.sb || prefs.ni || !prefs.ws) throw new Error(JSON.stringify(prefs));
});
await check("native menu has the expected sections and shortcuts", async () => {
  const m = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => [i.label, i.submenu.items.map((s) => s.label).filter(Boolean)]));
  const labels = m.map((x) => x[0].replace("&", ""));
  if (labels.join() !== "File,Edit,Go,View,Help") throw new Error("menu: " + labels.join());
  const go = m.find((x) => x[0].includes("Go"))[1];
  if (!["Dashboard", "Make a sale", "Orders", "Invoices", "Reports"].every((x) => go.includes(x))) throw new Error("Go menu: " + go.join());
});
await check("create an account and reach the workspace", async () => {
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Desktop Tester"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/account$/, { timeout: 20_000 });
  await page.getByRole("heading", { name: /Hello, Desktop/ }).waitFor();
  await page.getByRole("navigation", { name: "Workspace" }).waitFor();
});
await check("menu navigation (Make a sale) works", async () => {
  await app.evaluate(({ Menu }) => { const go = Menu.getApplicationMenu().items.find((i) => i.label.includes("Go")); go.submenu.items.find((s) => s.label === "Make a sale").click(); });
  await page.waitForURL(/tools\/inventory\?tab=sell/, { timeout: 15_000 });
});
await check("theme switch updates the native title-bar theme", async () => {
  await page.getByRole("switch", { name: "Light mode" }).first().click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  const t = await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
  if (t !== "light") throw new Error("nativeTheme is " + t);
  await page.getByRole("switch", { name: "Light mode" }).first().click();
});
await check("external links open in the default browser, never inside the app", async () => {
  await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
  await page.evaluate(() => { window.open("https://example.com/a", "_blank"); });
  await page.evaluate(() => { location.href = "https://example.org/b"; });
  await new Promise((r) => setTimeout(r, 1200));
  const opened = await app.evaluate(() => globalThis.__opened);
  if (!opened.includes("https://example.com/a") || !opened.includes("https://example.org/b")) throw new Error("opened: " + JSON.stringify(opened));
  if (!/localhost|sahaj/.test(page.url())) throw new Error("window navigated away: " + page.url());
});
await check("saving a generated file works", async () => {
  const out = "/tmp/sahaj-desktop-test.csv"; rmSync(out, { force: true });
  await app.evaluate(({ session }, p) => { session.defaultSession.once("will-download", (_e, item) => item.setSavePath(p)); }, out);
  await page.evaluate(() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["a,b\n1,2\n"], { type: "text/csv" })); a.download = "t.csv"; document.body.append(a); a.click(); });
  for (let i = 0; i < 20 && !existsSync(out); i++) await new Promise((r) => setTimeout(r, 300));
  if (!existsSync(out) || !readFileSync(out, "utf8").includes("1,2")) throw new Error("file not saved");
});
await check("popups for permissions are denied (camera/microphone/location)", async () => {
  const r = await page.evaluate(async () => { try { await navigator.mediaDevices.getUserMedia({ video: true }); return "granted"; } catch (e) { return e.name; } });
  if (r === "granted") throw new Error("camera permission was granted");
});
await check("no JavaScript errors in the page", async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(" | ")); });
await page.evaluate(([pw]) => fetch("/api/account", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json", "X-Requested-With": "ek" }, body: JSON.stringify({ password: pw, confirm: "DELETE" }) }), [PW]).catch(() => {});
await app.close();

// second launch: server unreachable -> friendly offline screen
const off = await launch({ SAHAJ_URL: "http://127.0.0.1:9" });
const offPage = await off.firstWindow();
await check("offline: shows the friendly screen when the server cannot be reached", async () => {
  await offPage.getByRole("heading", { name: "You're offline" }).waitFor({ timeout: 25_000 });
  await offPage.getByRole("button", { name: "Try again" }).waitFor();
});
await off.close();

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} desktop checks passed`);
process.exit(failed ? 1 : 0);
