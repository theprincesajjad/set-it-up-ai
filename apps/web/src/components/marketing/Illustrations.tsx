/** Flat illustrations (brand.md §6): paper, pine, marigold, brick, stone; one accent object each. Decorative. */

export function StreetIllustration({ className }: { className?: string }) {
  const shops = [
    { x: 10, w: 70, h: 90, body: "#1F6A50", awning: "#F5A524" },
    { x: 88, w: 60, h: 110, body: "#C65334", awning: "#FDDA8E" },
    { x: 156, w: 80, h: 80, body: "#655A4C", awning: "#F5A524" },
    { x: 244, w: 64, h: 100, body: "#1F6A50", awning: "#FDDA8E" },
    { x: 316, w: 74, h: 86, body: "#C65334", awning: "#F5A524" },
  ];
  return (
    <svg viewBox="0 0 400 220" aria-hidden className={className}>
      <rect x="0" y="0" width="400" height="220" rx="24" fill="#F3EDE3" />
      {shops.map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={170 - s.h} width={s.w} height={s.h} rx="8" fill={s.body} />
          <path d={`M${s.x} ${178 - s.h} h${s.w} v14 q-${s.w / 8} 10 -${s.w / 4} 0 q-${s.w / 8} 10 -${s.w / 4} 0 q-${s.w / 8} 10 -${s.w / 4} 0 q-${s.w / 8} 10 -${s.w / 4} 0z`} fill={s.awning} />
          <rect x={s.x + s.w / 2 - 9} y={140} width="18" height="30" rx="9" fill="#FAF6EF" />
          <rect x={s.x + 8} y={200 - s.h} width={s.w / 3} height="16" rx="3" fill="#FAF6EF" opacity="0.85" />
        </g>
      ))}
      <rect x="0" y="170" width="400" height="10" fill="#D4C9B8" />
      <rect x="0" y="180" width="400" height="40" fill="#E7DFD2" />
      <path d="M0 200 H400" stroke="#A99D8B" strokeWidth="2" strokeDasharray="12 10" />
    </svg>
  );
}

export function NetworkMapIllustration({ className }: { className?: string }) {
  const pins = [
    [70, 70], [140, 120], [210, 60], [260, 150], [330, 90], [110, 190], [300, 210], [190, 200],
  ] as const;
  return (
    <svg viewBox="0 0 400 260" aria-hidden className={className}>
      <rect width="400" height="260" rx="24" fill="#EEF6F2" />
      <path d="M0 130 C 100 110, 200 150, 400 120" stroke="#FFFFFF" strokeWidth="22" fill="none" />
      <path d="M200 0 C 190 90, 220 180, 205 260" stroke="#FFFFFF" strokeWidth="16" fill="none" />
      <path d="M0 130 C 100 110, 200 150, 400 120" stroke="#D4C9B8" strokeWidth="2" strokeDasharray="10 8" fill="none" />
      <rect x="20" y="180" width="70" height="56" rx="14" fill="#AED6C4" />
      {pins.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M0 -28 a14 14 0 0 1 14 14 c0 10 -14 22 -14 22 s-14 -12 -14 -22 a14 14 0 0 1 14 -14z" fill={i === 2 ? "#F5A524" : "#1F6A50"} stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="0" cy="-14" r="5" fill="#FFFFFF" />
        </g>
      ))}
    </svg>
  );
}

export function StepIllustration({ kind, className }: { kind: "setup" | "join" | "return"; className?: string }) {
  return (
    <svg viewBox="0 0 120 96" aria-hidden className={className}>
      <rect width="120" height="96" rx="16" fill="#F3EDE3" />
      {kind === "setup" ? (
        <>
          <rect x="28" y="30" width="64" height="50" rx="8" fill="#1F6A50" />
          <path d="M28 36 h64 v10 q-8 7 -16 0 q-8 7 -16 0 q-8 7 -16 0 q-8 7 -16 0z" fill="#F5A524" />
          <rect x="52" y="56" width="16" height="24" rx="8" fill="#FAF6EF" />
        </>
      ) : kind === "join" ? (
        <>
          <rect x="40" y="16" width="40" height="66" rx="8" fill="#1F1B16" />
          <rect x="44" y="22" width="32" height="52" rx="4" fill="#FFFFFF" />
          <g fill="#1F1B16">
            <rect x="48" y="28" width="10" height="10" />
            <rect x="62" y="28" width="10" height="10" />
            <rect x="48" y="42" width="10" height="10" />
            <rect x="64" y="44" width="6" height="6" />
          </g>
          <circle cx="60" cy="64" r="5" fill="#F5A524" />
        </>
      ) : (
        <>
          <path d="M38 34 h44 l-5 46 h-34z" fill="#C65334" />
          <path d="M48 34 a12 10 0 0 1 24 0" stroke="#655A4C" strokeWidth="3" fill="none" />
          <circle cx="60" cy="56" r="9" fill="#F5A524" />
        </>
      )}
    </svg>
  );
}
