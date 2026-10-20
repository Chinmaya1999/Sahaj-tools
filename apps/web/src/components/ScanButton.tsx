import { useState } from "react";
import { Button } from "./ui";
import { canScan, scanCode } from "../lib/native";
import { errMsg } from "../lib/api";

/** Camera barcode / QR scan. Only appears inside the Android and iOS apps; on the website the typed field is used. */
export function ScanButton({ onCode, label = "Scan" }: { onCode: (code: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (!canScan()) return null;
  async function go() {
    setBusy(true); setErr("");
    try { const c = await scanCode(); if (c) onCode(c.trim()); }
    catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Button type="button" variant="secondary" onClick={go} loading={busy} aria-label="Scan with the camera"><span aria-hidden>📷</span> {label}</Button>
      {err && <p role="alert" className="basis-full text-sm font-medium text-bad">{err}</p>}
    </>
  );
}
