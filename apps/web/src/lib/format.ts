export { formatInr, paiseToRupees, rupeesToPaise } from "@ek/shared";
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
import { isMobileApp, saveFileNative } from "./native";

/** Saves a generated file. In the Android/iOS app it opens the system share/save sheet, because WebViews cannot use download links. */
export function download(blob: Blob, filename: string) {
  if (isMobileApp()) { saveFileNative(blob, filename).then((ok) => { if (!ok) legacyDownload(blob, filename); }).catch(() => legacyDownload(blob, filename)); return; }
  legacyDownload(blob, filename);
}
function legacyDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
