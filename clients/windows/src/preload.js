// Runs in an isolated context before the website loads. Exposes a tiny, fixed API; the website cannot reach Node or Electron.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sahajDesktop", {
  platform: "windows",
  version: ipcRenderer.sendSync("app:version"),
  /** Keeps the native title bar and window colours in step with the website's light/dark theme. */
  setTheme: (theme) => { if (theme === "dark" || theme === "light") ipcRenderer.send("app:theme", theme); },
});
