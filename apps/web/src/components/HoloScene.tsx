import { useEffect, useRef } from "react";

type V3 = [number, number, number];

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: V3[] = ([[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]] as V3[])
  .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as V3; });
const FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
const EDGES = (() => { const s = new Set<string>(); for (const f of FACES) for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3]; s.add(a < b ? `${a}-${b}` : `${b}-${a}`); } return [...s].map((k) => k.split("-").map(Number) as [number, number]); })();

function rot([x, y, z]: V3, ax: number, ay: number): V3 {
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

/** Decorative real-time 3D hologram: wireframe crystal, orbit rings and drifting particles on a canvas.
 *  Sized in device pixels (capped at 3x), so it stays sharp on 4K and retina screens. Pauses when off-screen or when reduced motion is requested. */
export function HoloScene({ pointer }: { pointer: React.RefObject<{ x: number; y: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, t0 = performance.now();
    const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const stars = Array.from({ length: 90 }, () => ({ p: [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1] as V3, s: 0.4 + rng() * 1.2 }));
    const resize = () => {
      const r = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 3);
      w = r.width; h = r.height; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } }); io.observe(canvas);

    let ax = 0.5, ay = 0;
    function project(v: V3, scale: number, cx: number, cy: number): [number, number, number] {
      const f = 3.2 / (3.2 - v[2]); return [cx + v[0] * scale * f, cy + v[1] * scale * f, f];
    }
    function draw(now: number) {
      const t = (now - t0) / 1000, px = pointer.current?.x ?? 0, py = pointer.current?.y ?? 0;
      ay = t * 0.45 + px * 0.9; ax = 0.45 + py * -0.6 + Math.sin(t * 0.4) * 0.12;
      ctx!.clearRect(0, 0, w, h);
      const light = document.documentElement.dataset.theme === "light", rgb = light ? "14,116,144" : "165,243,252";
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
      // particle field
      for (const s of stars) {
        const v = rot(s.p, ax * 0.5, ay * 0.35 + t * 0.05), [x, y, f] = project(v, Math.min(w, h) * 0.62, cx, cy);
        ctx!.fillStyle = `rgba(${rgb},${0.15 + 0.35 * (v[2] + 1) / 2})`; ctx!.beginPath(); ctx!.arc(x, y, s.s * f, 0, 6.283); ctx!.fill();
      }
      // orbit rings
      for (let k = 0; k < 3; k++) {
        ctx!.beginPath();
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * 6.283, v = rot([Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55], ax + k * 1.05, ay * (0.6 + k * 0.3) + k * 2);
          const [x, y] = project(v, R, cx, cy); i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y);
        }
        ctx!.strokeStyle = (light ? ["rgba(14,116,144,.55)", "rgba(109,40,217,.45)", "rgba(190,24,93,.4)"] : ["rgba(34,211,238,.5)", "rgba(167,139,250,.45)", "rgba(244,114,182,.4)"])[k]; ctx!.lineWidth = 1; ctx!.stroke();
      }
      // crystal: faces (soft fill) then edges (glow)
      const pts = ICO.map((v) => rot(v, ax, ay)), pr = pts.map((v) => project(v, R, cx, cy));
      const faces = FACES.map((f) => ({ f, z: (pts[f[0]][2] + pts[f[1]][2] + pts[f[2]][2]) / 3 })).sort((a, b) => a.z - b.z);
      for (const { f, z } of faces) {
        ctx!.beginPath(); f.forEach((i, n) => (n ? ctx!.lineTo(pr[i][0], pr[i][1]) : ctx!.moveTo(pr[i][0], pr[i][1]))); ctx!.closePath();
        const hue = 190 + (z + 1) * 60 + Math.sin(t) * 20; ctx!.fillStyle = `hsla(${hue},${light ? 80 : 95}%,${light ? 45 : 65}%,${(light ? 0.07 : 0.05) + 0.1 * (z + 1) / 2})`; ctx!.fill();
      }
      ctx!.save(); ctx!.shadowColor = light ? "rgba(14,116,144,.5)" : "rgba(34,211,238,.9)"; ctx!.shadowBlur = light ? 5 : 12; ctx!.lineWidth = 1.4;
      for (const [a, b] of EDGES) {
        const z = (pts[a][2] + pts[b][2]) / 2; ctx!.strokeStyle = `rgba(${rgb},${0.35 + 0.55 * (z + 1) / 2})`;
        ctx!.beginPath(); ctx!.moveTo(pr[a][0], pr[a][1]); ctx!.lineTo(pr[b][0], pr[b][1]); ctx!.stroke();
      }
      ctx!.restore();
      for (const p of pr) { ctx!.fillStyle = light ? "rgba(11,18,48,.85)" : "rgba(255,255,255,.9)"; ctx!.beginPath(); ctx!.arc(p[0], p[1], 1.8 * p[2], 0, 6.283); ctx!.fill(); }
      // projector base glow
      const g = ctx!.createRadialGradient(cx, h * 0.9, 0, cx, h * 0.9, w * 0.4); g.addColorStop(0, light ? "rgba(14,116,144,.22)" : "rgba(34,211,238,.35)"); g.addColorStop(1, light ? "rgba(14,116,144,0)" : "rgba(34,211,238,0)");
      ctx!.fillStyle = g; ctx!.fillRect(0, h * 0.7, w, h * 0.3);
    }
    function frame(now: number) { if (!visible) return; draw(now); raf = requestAnimationFrame(frame); }
    if (reduce) draw(t0 + 1500); else raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [pointer]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}
