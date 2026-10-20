// Sahaj for Windows: a hardened Electron shell around the live Sahaj workspace.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme, session, Notification } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const LIVE = (!app.isPackaged && process.env.SAHAJ_URL) || "https://sahaj.cmcloud.online"; // the override is for developers/tests only
const LIVE_ORIGIN = new URL(LIVE).origin;
/** Sites the window may open inside the app (the website, its API, and the payment providers' checkout). Everything else opens in the browser. */
const ALLOWED_HOSTS = [new URL(LIVE).hostname, "sahaj.cmcloud.online", "sahaj.api.cmcloud.online", "cashfree.com", "razorpay.com"];
const hostAllowed = (u) => { try { const h = new URL(u).hostname; return ALLOWED_HOSTS.some((a) => h === a || h.endsWith("." + a)); } catch { return false; } };
const COLORS = { dark: "#050816", light: "#eef3ff" };

app.setAppUserModelId("online.cmcloud.sahaj"); // so Windows groups notifications and the taskbar icon correctly
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

/* ---------- window state (size, position, maximised) remembered between runs ---------- */
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return {}; } }
function saveState(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch { /* not critical */ }
}

let win = null;
function offlineHtml() {
  const file = app.isPackaged ? path.join(process.resourcesPath, "offline.html") : path.join(__dirname, "../../shared/www/offline.html");
  return fs.readFileSync(file, "utf8").replaceAll("{{LIVE_URL}}", LIVE.replace(/\/?$/, "/"));
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width ?? 1280, height: st.height ?? 820, x: st.x, y: st.y, minWidth: 900, minHeight: 600,
    show: false, backgroundColor: COLORS.dark, title: "Sahaj", autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: true, devTools: !app.isPackaged },
  });
  if (st.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", () => saveState(win));
  win.on("closed", () => { win = null; });

  const ua = win.webContents.getUserAgent();
  win.webContents.setUserAgent(`${ua} SahajApp/${app.getVersion()} (Windows)`);

  // Links: stay in the app for Sahaj and payment pages, open everything else in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || url.startsWith(LIVE_ORIGIN)) return { action: "allow", overrideBrowserWindowOptions: { width: 720, height: 900, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } } }; // e.g. the receipt print window
    if (hostAllowed(url)) return { action: "allow" };
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("data:text/html")) return; // our own offline page
    if (!hostAllowed(url)) { e.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); }
  });
  // No internet (or the server is unreachable): show a friendly screen that reconnects by itself.
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith("data:")) return; // -3 = aborted by a newer navigation
    void win?.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(offlineHtml()));
  });
  void win.loadURL(LIVE);
}

/* ---------- security: nothing is allowed unless needed ---------- */
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault()); // <webview> is never used
});
function lockDownSession() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "clipboard-sanitized-write"));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "clipboard-sanitized-write");
  // Saved files: ask where to save (Windows "Save as"), then reveal them.
  session.defaultSession.on("will-download", (_e, item) => {
    item.once("done", (_ev, state) => {
      if (state !== "completed") return;
      const n = new Notification({ title: "Saved", body: path.basename(item.getSavePath()) });
      n.on("click", () => shell.showItemInFolder(item.getSavePath()));
      n.show();
    });
  });
}

/* ---------- IPC from the website (validated) ---------- */
ipcMain.on("app:version", (e) => { e.returnValue = app.getVersion(); });
ipcMain.on("app:theme", (_e, theme) => {
  if (theme !== "dark" && theme !== "light") return;
  nativeTheme.themeSource = theme; // darkens/lightens the native title bar and dialogs
  win?.setBackgroundColor(COLORS[theme]);
});

/* ---------- menu ---------- */
function go(p) { return () => win?.loadURL(new URL(p, LIVE).href); }
function buildMenu() {
  const t = [
    { label: "&File", submenu: [
      { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => win?.webContents.print() },
      { type: "separator" }, { role: "quit", label: "Exit" } ] },
    { label: "&Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "&Go", submenu: [
      { label: "Dashboard", accelerator: "CmdOrCtrl+1", click: go("/account") },
      { label: "Make a sale", accelerator: "CmdOrCtrl+2", click: go("/tools/inventory?tab=sell") },
      { label: "Orders", accelerator: "CmdOrCtrl+3", click: go("/tools/inventory?tab=orders") },
      { label: "Invoices", accelerator: "CmdOrCtrl+4", click: go("/tools/invoice") },
      { label: "Reports", accelerator: "CmdOrCtrl+5", click: go("/tools/inventory?tab=insights") },
      { type: "separator" },
      { label: "Back", accelerator: "Alt+Left", click: () => win?.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
      { label: "Forward", accelerator: "Alt+Right", click: () => win?.webContents.navigationHistory.canGoForward() && win.webContents.navigationHistory.goForward() } ] },
    { label: "&View", submenu: [
      { role: "reload" }, { role: "forceReload" }, { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn", accelerator: "CmdOrCtrl+=" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" },
      ...(app.isPackaged ? [] : [{ type: "separator" }, { role: "toggleDevTools" }]) ] },
    { label: "&Help", submenu: [
      { label: "Help centre", click: () => shell.openExternal(new URL("/help", LIVE).href) },
      { label: "Contact support", click: () => shell.openExternal(new URL("/contact", LIVE).href) },
      { label: "Privacy policy", click: () => shell.openExternal(new URL("/privacy", LIVE).href) },
      { type: "separator" },
      { label: "Check for updates…", click: () => checkForUpdates(true) },
      { label: "About Sahaj", click: () => dialog.showMessageBox(win, { type: "info", title: "About Sahaj", message: `Sahaj ${app.getVersion()}`, detail: `Small tools. Real solutions.\n${LIVE}`, buttons: ["OK"] }) } ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

/* ---------- automatic updates from GitHub Releases (installed app only) ---------- */
function checkForUpdates(manual = false) {
  const { autoUpdater } = require("electron-updater"); // loaded on demand: it needs the app to be ready and is only used in the installed app
  if (!app.isPackaged) { if (manual) void dialog.showMessageBox(win, { message: "Updates are only available in the installed app." }); return; }
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.once("update-not-available", () => { if (manual) void dialog.showMessageBox(win, { type: "info", message: "You have the latest version." }); });
  autoUpdater.once("update-downloaded", (info) => {
    void dialog.showMessageBox(win, { type: "info", message: `Sahaj ${info.version} is ready`, detail: "Restart now to finish updating, or it will install when you close the app.", buttons: ["Restart now", "Later"], defaultId: 0 }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  autoUpdater.on("error", (err) => { if (manual) void dialog.showMessageBox(win, { type: "warning", message: "Could not check for updates", detail: String(err?.message ?? err).slice(0, 200) }); });
  void autoUpdater.checkForUpdates().catch(() => undefined);
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  lockDownSession(); buildMenu(); createWindow();
  setTimeout(() => checkForUpdates(false), 8000);
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
