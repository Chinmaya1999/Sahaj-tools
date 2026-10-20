import { useRef, useState } from "react";
import { cx } from "./ui";

export function Dropzone({ accept, multiple, onFiles, label, hint }: { accept: string; multiple?: boolean; onFiles: (f: File[]) => void; label: string; hint?: string }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}
      className={cx("rounded-2xl border-2 border-dashed p-6 text-center transition-colors", over ? "border-brand bg-brand-50" : "border-line bg-card")}
    >
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-sm text-ink-2">Drag and drop here, or</p>
      <button type="button" className="mt-2 min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white" onClick={() => ref.current?.click()}>Choose {multiple ? "files" : "a file"}</button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} aria-label={label} onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {hint && <p className="mt-2 text-xs text-ink-2">{hint}</p>}
    </div>
  );
}
