import { afterEach, describe, expect, it, vi } from "vitest";
import { appPlatform, canScan, canShare, initNative, isApp, isMobileApp, saveFileNative, scanCode, setSystemBars, shareText } from "../lib/native";
import { download } from "../lib/format";

const g = globalThis as Record<string, unknown>;
afterEach(() => { delete g.Capacitor; delete g.sahajDesktop; document.documentElement.className = ""; vi.restoreAllMocks(); });

const stubCapacitor = (plugins: Record<string, Record<string, unknown>>, platform = "android") => {
  g.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: plugins };
};

describe("native bridge on the plain website", () => {
  it("does nothing and reports a normal browser", async () => {
    expect(isApp()).toBe(false); expect(isMobileApp()).toBe(false); expect(appPlatform()).toBe("web"); expect(canScan()).toBe(false);
    initNative("dark"); expect(document.documentElement.classList.contains("app")).toBe(false);
    expect(await saveFileNative(new Blob(["x"]), "a.txt")).toBe(false);
    expect(await scanCode()).toBeNull();
    expect(() => setSystemBars("light")).not.toThrow();
  });
});

describe("native bridge inside the Android app (stubbed)", () => {
  it("marks the page, themes the status bar, hides the splash and routes print", async () => {
    const setStyle = vi.fn(), setBackgroundColor = vi.fn(), hide = vi.fn(), hideSplash = vi.fn(), addListener = vi.fn(), print = vi.fn();
    stubCapacitor({ StatusBar: { setStyle, setBackgroundColor }, SplashScreen: { hide }, App: { addListener }, SahajNative: { print, hideSplash } });
    initNative("dark");
    expect(document.documentElement.classList.contains("app-android")).toBe(true);
    expect(setStyle).toHaveBeenCalledWith({ style: "DARK" }); expect(setBackgroundColor).toHaveBeenCalledWith({ color: "#050816" });
    expect(addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    window.print(); expect(print).toHaveBeenCalled();
    await new Promise((r) => requestAnimationFrame(() => r(null))); expect(hideSplash).toHaveBeenCalled(); expect(hide).toHaveBeenCalled();
    setSystemBars("light"); expect(setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" }); expect(setBackgroundColor).toHaveBeenLastCalledWith({ color: "#eef3ff" });
  });
  it("saves generated files through the share sheet instead of a download link", async () => {
    const writeFile = vi.fn().mockResolvedValue({}), getUri = vi.fn().mockResolvedValue({ uri: "file:///cache/r.csv" }), share = vi.fn().mockResolvedValue({});
    stubCapacitor({ Filesystem: { writeFile, getUri }, Share: { share } });
    expect(await saveFileNative(new Blob(["a,b"], { type: "text/csv" }), "my report?.csv")).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: "my report_.csv", directory: "CACHE", data: expect.any(String) }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "file:///cache/r.csv" }));
    const anchor = vi.spyOn(document, "createElement");
    download(new Blob(["x"]), "x.csv"); await new Promise((r) => setTimeout(r, 20));
    expect(anchor).not.toHaveBeenCalledWith("a"); // no download link was created in the app
  });
  it("scans a code, installs Google's scanner module first when needed, and treats cancel as null", async () => {
    let listener: ((e: { state: number }) => void) | undefined;
    const scan = vi.fn().mockResolvedValue({ barcodes: [{ rawValue: "8901234" }] });
    const bs = { isGoogleBarcodeScannerModuleAvailable: vi.fn().mockResolvedValue({ available: false }), addListener: vi.fn(async (_n: string, cb: typeof listener) => { listener = cb; return { remove() {} }; }), installGoogleBarcodeScannerModule: vi.fn(async () => { setTimeout(() => listener?.({ state: 4 }), 0); }), scan };
    stubCapacitor({ BarcodeScanner: bs, Haptics: { impact: vi.fn() } });
    expect(canScan()).toBe(true);
    expect(await scanCode()).toBe("8901234"); expect(bs.installGoogleBarcodeScannerModule).toHaveBeenCalled();
    scan.mockRejectedValueOnce(new Error("scan canceled.")); bs.isGoogleBarcodeScannerModuleAvailable.mockResolvedValue({ available: true });
    expect(await scanCode()).toBeNull();
  });
  it("asks for camera permission on iOS and refuses politely if denied", async () => {
    const bs = { checkPermissions: vi.fn().mockResolvedValue({ camera: "denied" }), requestPermissions: vi.fn().mockResolvedValue({ camera: "denied" }), scan: vi.fn() };
    stubCapacitor({ BarcodeScanner: bs }, "ios");
    await expect(scanCode()).rejects.toThrow(/camera access/i); expect(bs.scan).not.toHaveBeenCalled();
  });
  it("shares text with the native share sheet", async () => {
    const share = vi.fn().mockResolvedValue({}); stubCapacitor({ Share: { share } });
    expect(canShare()).toBe(true); expect(await shareText("S-0001 total ₹100", "S-0001")).toBe(true);
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: "S-0001 total ₹100" }));
  });
});

describe("native bridge inside the Windows app (stubbed)", () => {
  it("tells the desktop shell about the theme and is not treated as a phone", () => {
    const setTheme = vi.fn(); g.sahajDesktop = { platform: "windows", version: "1.0.0", setTheme };
    expect(isApp()).toBe(true); expect(isMobileApp()).toBe(false); expect(appPlatform()).toBe("windows");
    initNative("light"); expect(document.documentElement.classList.contains("app-windows")).toBe(true); expect(setTheme).toHaveBeenCalledWith("light");
  });
});
