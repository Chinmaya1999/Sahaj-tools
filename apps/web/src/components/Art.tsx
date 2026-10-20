import type { ProductSlug } from "@ek/shared";

/** Original isometric-style illustrations, one per product (inline SVG, no external assets). */
export function ProductArt({ slug, accent }: { slug: ProductSlug; accent: string }) {
  const id = `g-${slug}`;
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label="" aria-hidden className="h-auto w-full">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={accent} stopOpacity="0.95" /><stop offset="1" stopColor={accent} stopOpacity="0.55" /></linearGradient>
        <filter id={`s-${slug}`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#1f1d1a" floodOpacity="0.18" /></filter></defs>
      <rect width="320" height="220" rx="24" fill={accent} opacity="0.08" />
      <circle cx="270" cy="40" r="50" fill={accent} opacity="0.12" /><circle cx="40" cy="190" r="40" fill={accent} opacity="0.1" />
      <g filter={`url(#s-${slug})`}>
        <g transform="translate(70 30) skewY(-6)"><rect width="150" height="130" rx="14" fill="#fff" stroke="#e2dacb" />
          {slug === "invoice" && <><rect x="14" y="14" width="60" height="8" rx="4" fill={accent} /><rect x="14" y="34" width="100" height="6" rx="3" fill="#e2dacb" /><rect x="14" y="48" width="86" height="6" rx="3" fill="#e2dacb" /><rect x="14" y="62" width="94" height="6" rx="3" fill="#e2dacb" /><rect x="70" y="92" width="66" height="24" rx="8" fill="url(#g-invoice)" /></>}
          {slug === "resume" && <><circle cx="34" cy="34" r="16" fill={accent} /><rect x="58" y="24" width="70" height="8" rx="4" fill="#1f1d1a" /><rect x="58" y="40" width="50" height="6" rx="3" fill="#e2dacb" /><rect x="14" y="66" width="120" height="6" rx="3" fill="#e2dacb" /><rect x="14" y="80" width="100" height="6" rx="3" fill="#e2dacb" /><rect x="14" y="98" width="30" height="14" rx="5" fill={accent} opacity="0.3" /><rect x="50" y="98" width="30" height="14" rx="5" fill={accent} opacity="0.3" /></>}
          {slug === "inventory" && <>{[40, 70, 30, 85, 55].map((h, i) => <rect key={i} x={18 + i * 25} y={110 - h} width="16" height={h} rx="4" fill={i === 2 ? "#d97706" : "url(#g-inventory)"} />)}<rect x="14" y="14" width="70" height="8" rx="4" fill="#1f1d1a" /></>}
          {slug === "invitation" && <><rect x="12" y="12" width="126" height="106" rx="10" fill="none" stroke={accent} strokeWidth="2" /><rect x="40" y="34" width="70" height="10" rx="5" fill={accent} /><rect x="30" y="56" width="90" height="7" rx="3" fill="#1f1d1a" opacity="0.8" /><rect x="45" y="74" width="60" height="5" rx="2.5" fill="#e2dacb" /><rect x="50" y="88" width="50" height="5" rx="2.5" fill="#e2dacb" /></>}
          {slug === "pdf-tools" && <><rect x="16" y="16" width="52" height="68" rx="6" fill="#fff" stroke={accent} strokeWidth="2" /><rect x="82" y="30" width="52" height="68" rx="6" fill="url(#g-pdf-tools)" /><text x="92" y="72" fontSize="16" fontWeight="700" fill="#fff">PDF</text><path d="M72 58h8m-4-4 4 4-4 4" stroke="#1f1d1a" strokeWidth="2" fill="none" /></>}
          {slug === "qr-business" && <>{Array.from({ length: 49 }, (_, k) => ((k * 5 + (k >> 2)) % 3 === 0 || [0, 6, 42, 48, 1, 7, 5, 13, 35, 43, 41, 47].includes(k)) && <rect key={k} x={24 + (k % 7) * 15} y={14 + Math.floor(k / 7) * 15} width="12" height="12" rx="2" fill={k % 5 === 0 ? accent : "#1f1d1a"} />)}</>}
          {slug === "photo-tools" && <><rect x="14" y="14" width="122" height="78" rx="8" fill="url(#g-photo-tools)" /><circle cx="44" cy="40" r="9" fill="#fff" opacity="0.9" /><path d="M14 92l36-30 26 20 24-18 36 28z" fill="#fff" opacity="0.8" /><rect x="14" y="102" width="70" height="8" rx="4" fill="#1f1d1a" opacity="0.8" /><rect x="90" y="102" width="46" height="8" rx="4" fill="#e2dacb" /></>}
        </g>
      </g>
    </svg>
  );
}
