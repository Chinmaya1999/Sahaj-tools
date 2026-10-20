// "Error injecting safe area CSS" is a known harmless log line from Capacitor 8's own bridge script on remote pages and is ignored.
// A tiny Chrome-DevTools-protocol driver for an Android app's WebView (Playwright cannot attach to WebViews reliably).
// It talks to the debugging socket Android exposes for debuggable WebViews, via `adb forward`. No dependencies.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

export const ADB = process.env.ADB ?? `${process.env.ANDROID_HOME ?? homedir() + "/Library/Android/sdk"}/platform-tools/adb`;
export const adb = (...a) => execFileSync(ADB, a, { encoding: "utf8", timeout: 60_000, maxBuffer: 50e6 }).trim();
export const sh = (c) => adb("shell", c);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs inside the page: find the visible control whose label matches. */
const HELPERS = `(() => {
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== "hidden";
  const match = (text, m) => (m.re ? new RegExp(m.re, m.flags).test(text) : text === m.text);
  const label = (e) => norm(e.getAttribute("aria-label") || e.innerText || e.value || e.placeholder || "");
  window.__t = {
    find(sel, m) { return [...document.querySelectorAll(sel)].filter(vis).find((e) => match(label(e), m)); },
    control(m) { return this.find('button, a, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], summary', m); },
    input(m) {
      for (const l of document.querySelectorAll("label")) if (match(norm(l.innerText), m) && l.control && vis(l.control)) return l.control;
      return [...document.querySelectorAll("input, textarea, select")].filter(vis).find((e) => match(norm(e.getAttribute("aria-label") || e.placeholder), m));
    },
    text(m) { return [...document.querySelectorAll("body *")].filter((e) => e.children.length === 0 && vis(e)).some((e) => match(norm(e.textContent), m)); },
    set(el, v) { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); },
  };
})()`;
const M = (m) => JSON.stringify(m instanceof RegExp ? { re: m.source, flags: m.flags } : { text: m });

export class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; this.opened = new Promise((r) => (ws.onopen = r));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) { const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
      else if (msg.method === "Runtime.exceptionThrown") this.errors.push("exception: " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).split("\n")[0]);
      else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error" && !/Error injecting safe area CSS/.test(JSON.stringify(msg.params.args))) this.errors.push("console: " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    };
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => this.pending.has(id) && (this.pending.delete(id), rej(new Error("CDP timeout: " + method))), 30_000); }); }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: `${HELPERS};${expr}`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text);
    return r.result.value;
  }
  url() { return this.eval("location.href"); }
  async waitFor(expr, what, timeout = 20_000) { const t0 = Date.now(); let last; while (Date.now() - t0 < timeout) { try { last = await this.eval(expr); if (last) return last; } catch (e) { last = e.message; } await sleep(250); } throw new Error(`timed out waiting for ${what}${typeof last === "string" ? " (" + last + ")" : ""}`); }
  waitUrl(re, timeout) { return this.waitFor(`new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)}).test(location.href)`, `URL ${re}`, timeout); }
  waitText(m, timeout) { return this.waitFor(`__t.text(${M(m)})`, `text ${m}`, timeout); }
  waitControl(m, timeout) { return this.waitFor(`!!__t.control(${M(m)})`, `control ${m}`, timeout); }
  /** A real (trusted) tap on the control, like a finger, so the browser treats it as user activity. Waits for the control to stop moving first. */
  async click(m, timeout) {
    await this.waitControl(m, timeout);
    const rect = () => this.eval(`(() => { const e = __t.control(${M(m)}); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(); })()`);
    await this.eval(`__t.control(${M(m)}).scrollIntoView({ block: "center" })`);
    let prev = "", stable = 0;
    for (let i = 0; i < 40 && stable < 3; i++) { await sleep(120); const r = await rect(); if (r && r === prev) stable++; else { stable = 0; prev = r ?? ""; } }
    const [x, y, w, h] = prev.split(",").map(Number); const px = x + w / 2, py = y + h / 2;
    for (const type of ["mousePressed", "mouseReleased"]) await this.send("Input.dispatchMouseEvent", { type, x: px, y: py, button: "left", clickCount: 1 });
  }
  async fill(m, value, timeout) { await this.waitFor(`!!__t.input(${M(m)})`, `field ${m}`, timeout); await this.eval(`__t.set(__t.input(${M(m)}), ${JSON.stringify(value)})`); }
  async goto(path) { const base = new URL(await this.url()); await this.send("Page.navigate", { url: new URL(path, base).href }); await sleep(300); await this.waitFor("document.readyState === 'complete'", "page load"); }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

/** Starts (or restarts) the app and attaches to its WebView. The APK must be a SAHAJ_DEBUG=1 build. */
export async function launchApp(pkg, { restart = true } = {}) {
  if (restart) { sh(`am force-stop ${pkg}`); await sleep(700); }
  sh(`am start -n ${pkg}/.MainActivity`);
  let pid = ""; for (let i = 0; i < 40 && !pid; i++) { await sleep(500); pid = sh(`pidof ${pkg} || true`).trim(); }
  if (!pid) throw new Error("the app did not start");
  let target; const t0 = Date.now();
  while (!target && Date.now() - t0 < 45_000) {
    try {
      adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
      const list = await (await fetch("http://localhost:9222/json", { signal: AbortSignal.timeout(3000) })).json();
      target = list.find((t) => t.type === "page" && t.url && !t.url.startsWith("about:"));
    } catch { /* WebView not ready yet */ }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error("could not attach to the app's WebView (is this a SAHAJ_DEBUG=1 build?)");
  const page = new Page(new WebSocket(target.webSocketDebuggerUrl)); await page.opened;
  await page.send("Runtime.enable"); await page.send("Page.enable");
  return page;
}
