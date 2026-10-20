import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import QRCode from "qrcode";
import { HoloScene } from "./HoloScene";

/** Decorative 3D scene: layered product cards that tilt with the pointer. Purely visual (aria-hidden). */
export function Hero3D() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 80, damping: 18 }), sy = useSpring(my, { stiffness: 80, damping: 18 });
  const rotY = useTransform(sx, [-0.5, 0.5], [-14, 14]), rotX = useTransform(sy, [-0.5, 0.5], [10, -10]);
  const pointer = useRef({ x: 0, y: 0 });
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL("https://example.com", { margin: 0, width: 120, color: { dark: "#1f1d1a", light: "#ffffff" } }).then(setQr); }, []);
  const float = (d: number, amp = 8) => (reduce ? {} : { animate: { y: [0, -amp, 0] }, transition: { duration: 5 + d, repeat: Infinity, ease: "easeInOut" as const } });
  return (
    <div aria-hidden className="ui-zoom relative mx-auto h-[440px] w-full max-w-[540px] select-none [perspective:1200px]"
      onPointerMove={(e) => { if (reduce) return; const r = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5; mx.set(px); my.set(py); pointer.current = { x: px, y: py }; }}
      onPointerLeave={() => { mx.set(0); my.set(0); pointer.current = { x: 0, y: 0 }; }}>
      <div className="absolute inset-6 rounded-[2rem] bg-gradient-to-br from-brand/25 via-holo-violet/10 to-transparent blur-2xl" />
      <HoloScene pointer={pointer} />
      <motion.div style={reduce ? undefined : { rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }} className="absolute inset-0">
        {/* back plate */}
        <div className="holo-scan absolute left-8 top-10 h-[320px] w-[420px] rounded-3xl border border-brand/30 bg-card/40 shadow-lift" style={{ transform: "translateZ(0px)" }}>
          <div className="flex gap-1.5 p-4"><i className="h-2.5 w-2.5 rounded-full bg-bad/60" /><i className="h-2.5 w-2.5 rounded-full bg-warn/60" /><i className="h-2.5 w-2.5 rounded-full bg-ok/60" /></div>
          <div className="px-6"><div className="h-3 w-32 rounded bg-ink/80" /><div className="mt-2 h-2 w-48 rounded bg-line" />
            <div className="mt-6 space-y-3">{[70, 55, 85].map((w, i) => <div key={i} className="flex items-center justify-between"><div className="h-2.5 rounded bg-line" style={{ width: `${w}%` }} /><div className="h-2.5 w-12 rounded bg-brand/30" /></div>)}</div></div>
        </div>
        {/* invoice card */}
        <motion.div {...float(0)} className="absolute left-0 top-24 w-56 rounded-2xl holo-card p-4 shadow-lift" style={{ transform: "translateZ(70px)" }}>
          <p className="text-[10px] font-bold tracking-wider text-brand">INVOICE INV-0042</p>
          <div className="mt-2 flex justify-between text-xs text-ink-2"><span>Subtotal</span><span>₹10,000</span></div>
          <div className="flex justify-between text-xs text-ink-2"><span>GST 18%</span><span>₹1,800</span></div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-bold"><span>Total</span><span>₹11,800</span></div>
          <span className="mt-3 inline-block rounded-full bg-ok-bg px-2 py-0.5 text-[10px] font-bold text-ok">PAID</span>
        </motion.div>
        {/* stock card */}
        <motion.div {...float(1.2, 10)} className="absolute right-0 top-8 w-48 rounded-2xl holo-card p-4 shadow-lift" style={{ transform: "translateZ(110px)" }}>
          <p className="text-[10px] font-bold tracking-wider text-ink-2">STOCK LEVEL</p>
          <div className="mt-3 flex h-16 items-end gap-1.5">{[40, 65, 30, 80, 55, 20].map((h, i) => <div key={i} className={`flex-1 rounded-t ${h < 35 ? "bg-warn/70" : "bg-brand/70"}`} style={{ height: `${h}%` }} />)}</div>
          <p className="mt-2 text-[11px] font-semibold text-warn">2 items running low</p>
        </motion.div>
        {/* QR card */}
        <motion.div {...float(2.1, 12)} className="absolute bottom-10 right-6 rounded-2xl holo-card p-3 shadow-lift" style={{ transform: "translateZ(150px)" }}>
          {qr ? <img src={qr} alt="" width={84} height={84} /> : <div className="h-[84px] w-[84px]" />}
          <p className="mt-1 text-center text-[10px] font-semibold text-ink-2">Scan to pay / visit</p>
        </motion.div>
        {/* resume chip */}
        <motion.div {...float(0.6, 9)} className="absolute bottom-6 left-14 w-44 rounded-2xl holo-card p-3 shadow-lift" style={{ transform: "translateZ(90px)" }}>
          <div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-bold text-(--color-on-brand)">A</div><div><div className="h-2 w-20 rounded bg-ink/80" /><div className="mt-1 h-1.5 w-14 rounded bg-line" /></div></div>
          <div className="mt-2 flex flex-wrap gap-1">{["React", "Excel", "SQL"].map((t) => <span key={t} className="rounded bg-brand-50 px-1.5 py-0.5 text-[9px] font-bold text-brand-700">{t}</span>)}</div>
          <p className="mt-2 text-[10px] font-semibold text-ok">Job match 82%</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
