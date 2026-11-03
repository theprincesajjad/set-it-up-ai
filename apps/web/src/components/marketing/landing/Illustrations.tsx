/**
 * Spot illustrations for the home page (wave S, calmed in S2): flat shapes with one ink outline, filled from the `.mkt` palette (sun,
 * mint, coral, violet, white), no sparkles or confetti. The shops drawn are a mix of trades: a café, a phone repair shop, a barber and a
 * nail salon on the hero's main street, repair and retail in the tiles. Server-rendered inline SVG: crisp at any size, a few hundred bytes each, no image requests, nothing to hydrate.
 * All decorative (aria-hidden); the words around them carry the meaning. No lettering inside any drawing.
 */
import type { SVGProps } from "react";

const INK = "var(--mkt-ink)";
const SUN = "var(--mkt-sun)";
const MINT = "var(--mkt-mint)";
const CORAL = "var(--mkt-coral)";
const VIOLET = "var(--mkt-violet)";
const WHITE = "var(--mkt-stock)";
const LILAC = "var(--mkt-violet-soft)";

/** The outline every shape shares. */
const O = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" } as const;

type Art = Omit<SVGProps<SVGSVGElement>, "viewBox">;
const svg = (viewBox: string, p: Art) => ({ viewBox, "aria-hidden": true, focusable: false, ...p }) as SVGProps<SVGSVGElement>;



type Front = { x: number; top: number; roof: string; children?: React.ReactNode; awning: React.ReactNode; sign: React.ReactNode; door: string };
const W = 148;
const GROUND = 330;

/** One shopfront on the main street: the building, its parapet with a round sign, an awning, the window (contents passed in), the door. */
function ShopUnit({ x, top, roof, children, awning, sign, door }: Front) {
  return (
    <g>
      <rect x={x} y={top + 20} width={W} height={GROUND - top - 20} rx="8" fill={WHITE} {...O} />
      <rect x={x - 5} y={top} width={W + 10} height="28" rx="9" fill={roof} {...O} />
      {awning}
      <rect x={x + 12} y={top + 82} width="76" height={292 - top - 82} rx="8" fill={LILAC} {...O} />
      {children}
      <rect x={x + 100} y={GROUND - 112} width="36" height="112" rx="6" fill={door} {...O} />
      <circle cx={x + 128} cy={GROUND - 56} r="3" fill={INK} />
      <circle cx={x + W / 2} cy={top + 14} r="19" fill={WHITE} {...O} />
      {sign}
    </g>
  );
}

/** A scalloped striped awning across a shopfront. */
function Stripes({ x, y, a, b }: { x: number; y: number; a: string; b: string }) {
  const n = 6;
  const w = (W + 8) / n;
  return (
    <g>
      <rect x={x - 4} y={y} width={W + 8} height="22" fill={b} />
      {Array.from({ length: n }, (_, i) => (i % 2 ? null : <rect key={`r${i}`} x={x - 4 + i * w} y={y} width={w} height="22" fill={a} />))}
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${x - 4 + i * w} ${y + 22} a${w / 2} ${w / 2.6} 0 0 0 ${w} 0`} fill={i % 2 ? b : a} {...O} />
      ))}
      <rect x={x - 4} y={y} width={W + 8} height="22" fill="none" {...O} />
    </g>
  );
}

/** A flat, slanted awning. */
function Flat({ x, y, fill }: { x: number; y: number; fill: string }) {
  return <path d={`M${x} ${y} H${x + W} L${x + W + 8} ${y + 26} H${x - 8} Z`} fill={fill} {...O} />;
}

/**
 * The hero's main street: four neighbours in one flat style, a café, a phone repair shop, a barber and a nail salon, each with its own
 * sign glyph (a cup; a phone and a wrench; scissors; a polish bottle) and window. The stamp-card phone stands in front of it on the page.
 */
export function MainStreet(p: Art) {
  const xs = [14, 170, 326, 482];
  const cy = (top: number) => top + 14;
  return (
    <svg {...svg("0 0 644 346", p)}>
      <ellipse cx="322" cy={GROUND + 4} rx="316" ry="10" fill={INK} opacity="0.08" />
      {/* Café */}
      <ShopUnit
        x={xs[0]!}
        top={72}
        roof={CORAL}
        door={MINT}
        awning={<Stripes x={xs[0]!} y={112} a={CORAL} b={WHITE} />}
        sign={<path d={`M${xs[0]! + 64} ${cy(72) - 5} h16 v6 a7 7 0 0 1 -7 7 h-2 a7 7 0 0 1 -7 -7 z M${xs[0]! + 80} ${cy(72) - 3} a4 4 0 0 1 0 8`} fill="none" {...O} strokeWidth={2} />}
      >
        <rect x={xs[0]! + 12} y={262} width="76" height="30" fill={SUN} {...O} />
        <path d={`M${xs[0]! + 26} 246 h20 v8 a8 8 0 0 1 -8 8 h-4 a8 8 0 0 1 -8 -8 z`} fill={WHITE} {...O} strokeWidth={2} />
        <path d={`M${xs[0]! + 56} 262 a14 12 0 0 1 28 0 z`} fill={CORAL} {...O} strokeWidth={2} />
      </ShopUnit>
      {/* Phone repair */}
      <ShopUnit
        x={xs[1]!}
        top={48}
        roof={VIOLET}
        door={SUN}
        awning={<Flat x={xs[1]!} y={88} fill={VIOLET} />}
        sign={
          <g>
            <rect x={xs[1]! + 62} y={cy(48) - 10} width="11" height="19" rx="2.5" fill={INK} />
            <path d={`M${xs[1]! + 78} ${cy(48) + 8} l8 -12`} {...O} strokeWidth={3} />
            <circle cx={xs[1]! + 87} cy={cy(48) - 6} r="3.5" fill="none" {...O} strokeWidth={2} />
          </g>
        }
      >
        <rect x={xs[1]! + 32} y={178} width="36" height="66" rx="7" fill={INK} {...O} strokeWidth={2} />
        <rect x={xs[1]! + 37} y={186} width="26" height="48" rx="3" fill={MINT} />
        <path d={`M${xs[1]! + 40} 196 l18 10 M${xs[1]! + 44} 222 l12 -8`} stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
        <path d={`M${xs[1]! + 22} 292 V266 M${xs[1]! + 78} 292 V266`} {...O} />
        <rect x={xs[1]! + 16} y={256} width="68" height="10" rx="3" fill={CORAL} {...O} strokeWidth={2} />
      </ShopUnit>
      {/* Barber, with its pole */}
      <ShopUnit
        x={xs[2]!}
        top={80}
        roof={MINT}
        door={LILAC}
        awning={<Flat x={xs[2]!} y={120} fill={INK} />}
        sign={
          <g>
            <circle cx={xs[2]! + 68} cy={cy(80) + 6} r="4" fill="none" {...O} strokeWidth={2} />
            <circle cx={xs[2]! + 80} cy={cy(80) + 6} r="4" fill="none" {...O} strokeWidth={2} />
            <path d={`M${xs[2]! + 70} ${cy(80) + 3} l12 -12 M${xs[2]! + 78} ${cy(80) + 3} l-12 -12`} {...O} strokeWidth={2} />
          </g>
        }
      >
        <circle cx={xs[2]! + 50} cy={218} r="22" fill={WHITE} {...O} strokeWidth={2} />
        <path d={`M${xs[2]! + 30} 292 v-30 a20 20 0 0 1 40 0 v30`} fill={CORAL} {...O} strokeWidth={2} />
      </ShopUnit>
      <g>
        <rect x={xs[2]! + 90} y={186} width="8" height="52" rx="3" fill={WHITE} {...O} strokeWidth={2} />
        <path d={`M${xs[2]! + 90} 196 l8 -6 M${xs[2]! + 90} 208 l8 -6 M${xs[2]! + 90} 220 l8 -6 M${xs[2]! + 90} 232 l8 -6`} stroke={CORAL} strokeWidth="3" />
        <circle cx={xs[2]! + 94} cy={183} r="4" fill={INK} />
      </g>
      {/* Nail salon */}
      <ShopUnit
        x={xs[3]!}
        top={60}
        roof={SUN}
        door={CORAL}
        awning={<Stripes x={xs[3]!} y={100} a={VIOLET} b={WHITE} />}
        sign={
          <g>
            <rect x={xs[3]! + 70} y={cy(60) - 11} width="8" height="8" rx="1.5" fill={INK} />
            <rect x={xs[3]! + 66} y={cy(60) - 3} width="16" height="13" rx="3" fill={CORAL} {...O} strokeWidth={2} />
          </g>
        }
      >
        <path d={`M${xs[3]! + 18} 252 H${xs[3]! + 82}`} {...O} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={xs[3]! + 26 + i * 18} y={222} width="6" height="8" rx="1.5" fill={INK} />
            <rect x={xs[3]! + 22 + i * 18} y={230} width="14" height="22" rx="3" fill={[CORAL, VIOLET, MINT][i]} {...O} strokeWidth={2} />
          </g>
        ))}
      </ShopUnit>
      <path d={`M4 ${GROUND} H640`} {...O} />
      <circle cx="10" cy={GROUND - 12} r="12" fill={MINT} {...O} />
      <circle cx="636" cy={GROUND - 14} r="14" fill={MINT} {...O} />
    </svg>
  );
}

/** Tile 1 (free loyalty, every kind of shop): a phone with a wrench for the repair counter, and a shopping bag for retail. */
export function SpotShops(p: Art) {
  return (
    <svg {...svg("0 0 140 110", p)}>
      <path d="M78 36 h40 l6 62 h-52 z" fill={CORAL} {...O} />
      <path d="M88 36 v-8 a10 10 0 0 1 20 0 v8" fill="none" {...O} />
      <rect x="22" y="14" width="40" height="76" rx="9" fill={INK} {...O} />
      <rect x="27" y="22" width="30" height="58" rx="4" fill={MINT} />
      <path d="M32 34 l20 12 M36 66 l14 -9" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M50 92 l26 -30" {...O} strokeWidth={6} />
      <path d="M50 92 l26 -30" stroke={SUN} strokeWidth="2" strokeLinecap="round" />
      <circle cx="80" cy="57" r="8" fill="none" {...O} strokeWidth={3} />
      <path d="M8 100 H132" {...O} />
    </svg>
  );
}

/** Step 1: a QR stand for the counter and the stamp card it leads to. */
export function StepSetup(p: Art) {
  const qr = [
    [0, 0, 1, 0, 1],
    [1, 0, 1, 1, 0],
    [0, 1, 0, 1, 1],
    [1, 1, 0, 0, 1],
  ];
  return (
    <svg {...svg("0 0 240 170", p)}>
      <ellipse cx="120" cy="158" rx="104" ry="8" fill={INK} opacity="0.1" />
      <path d="M52 154 L66 34 H136 L150 154 Z" fill={WHITE} {...O} />
      {[[74, 50], [110, 50], [74, 86]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <rect x={x} y={y} width="20" height="20" rx="4" fill="none" {...O} />
          <rect x={x! + 6} y={y! + 6} width="8" height="8" rx="1.5" fill={INK} />
        </g>
      ))}
      {qr.map((row, r) => row.map((on, c) => (on ? <rect key={`${r}-${c}`} x={104 + c * 6} y={86 + r * 6} width="5" height="5" rx="1" fill={INK} /> : null)))}
      <rect x="72" y="124" width="58" height="10" rx="5" fill={VIOLET} />
      <g transform="rotate(8 186 104)">
        <rect x="140" y="74" width="92" height="62" rx="12" fill={CORAL} {...O} />
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={156 + i * 20} cy="98" r="7" fill={i < 3 ? WHITE : "none"} stroke={INK} strokeWidth="2" strokeDasharray={i < 3 ? undefined : "3 3"} />
        ))}
        <rect x="152" y="116" width="40" height="7" rx="3.5" fill={WHITE} />
      </g>
    </svg>
  );
}

/** Step 2: a phone that scanned the QR and is adding the card to the wallet. */
export function StepJoin(p: Art) {
  return (
    <svg {...svg("0 0 240 170", p)}>
      <ellipse cx="120" cy="160" rx="96" ry="7" fill={INK} opacity="0.1" />
      <g transform="rotate(-8 46 82)">
        <rect x="20" y="58" width="52" height="52" rx="8" fill={WHITE} {...O} />
        <rect x="28" y="66" width="14" height="14" rx="3" fill={INK} />
        <rect x="50" y="66" width="14" height="14" rx="3" fill={INK} />
        <rect x="28" y="88" width="14" height="14" rx="3" fill={INK} />
        <rect x="52" y="90" width="5" height="5" rx="1" fill={INK} />
        <rect x="59" y="96" width="5" height="5" rx="1" fill={INK} />
      </g>
      <path d="M78 84 q10 -14 20 -4" fill="none" {...O} strokeDasharray="4 5" />
      <rect x="98" y="10" width="86" height="150" rx="16" fill={INK} {...O} />
      <rect x="105" y="22" width="72" height="128" rx="10" fill={WHITE} />
      <rect x="112" y="34" width="58" height="40" rx="7" fill={VIOLET} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={122 + i * 13} cy="60" r="4" fill={i < 2 ? SUN : "none"} stroke={WHITE} strokeWidth="1.5" />
      ))}
      <rect x="118" y="40" width="22" height="5" rx="2.5" fill={WHITE} />
      <rect x="112" y="84" width="58" height="8" rx="4" fill={LILAC} />
      <rect x="112" y="98" width="40" height="8" rx="4" fill={LILAC} />
      <rect x="112" y="122" width="58" height="18" rx="9" fill={INK} />
      <circle cx="186" cy="28" r="17" fill={MINT} {...O} />
      <path d="M178 28 l6 6 l10 -12" fill="none" {...O} strokeWidth={3} />
    </svg>
  );
}

/** Step 3: the rubber stamp landing on the card's next slot. */
export function StepStamp(p: Art) {
  return (
    <svg {...svg("0 0 240 170", p)}>
      <ellipse cx="120" cy="160" rx="104" ry="7" fill={INK} opacity="0.1" />
      <rect x="28" y="98" width="184" height="58" rx="12" fill={WHITE} {...O} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx={58 + i * 31}
          cy="127"
          r="10"
          fill={i < 3 ? SUN : i === 3 ? CORAL : "none"}
          stroke={INK}
          strokeWidth="2"
          strokeDasharray={i === 4 ? "3 3" : undefined}
        />
      ))}
      <g transform="translate(0 -6)">
        <circle cx="151" cy="20" r="13" fill={CORAL} {...O} />
        <rect x="145" y="32" width="12" height="20" fill={SUN} {...O} />
        <rect x="125" y="50" width="52" height="18" rx="5" fill={VIOLET} {...O} />
        <rect x="130" y="68" width="42" height="8" rx="2" fill={INK} />
      </g>
      <path d="M112 74 l-12 -6 M110 88 l-14 2 M192 74 l12 -6 M194 88 l14 2" {...O} />
    </svg>
  );
}


/** Tile 2: scissors and a bottle of nail polish (barbers, nail techs, groomers). */
export function SpotBooking(p: Art) {
  return (
    <svg {...svg("0 0 140 110", p)}>
      <g transform="rotate(-24 50 60)">
        <path d="M44 56 L86 16 M56 56 L22 18" {...O} strokeWidth={5} stroke={INK} />
        <path d="M44 56 L86 16" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
        <circle cx="36" cy="80" r="14" fill={CORAL} {...O} />
        <circle cx="64" cy="80" r="14" fill={CORAL} {...O} />
        <circle cx="36" cy="80" r="6" fill={WHITE} {...O} strokeWidth={2} />
        <circle cx="64" cy="80" r="6" fill={WHITE} {...O} strokeWidth={2} />
        <circle cx="50" cy="58" r="3.5" fill={INK} />
      </g>
      <rect x="96" y="20" width="18" height="30" rx="4" fill={INK} {...O} />
      <path d="M88 50 h34 a6 6 0 0 1 6 6 v34 a10 10 0 0 1 -10 10 h-26 a10 10 0 0 1 -10 -10 v-34 a6 6 0 0 1 6 -6 z" fill={VIOLET} {...O} />
      <path d="M94 62 v22" stroke={WHITE} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/** Tile 3: a bowl of noodles with chopsticks. */
export function SpotBowl(p: Art) {
  return (
    <svg {...svg("0 0 140 110", p)}>
      <path d="M78 14 L118 46 M90 10 L124 40" {...O} strokeWidth={4} />
      <path d="M18 54 h104 a52 44 0 0 1 -104 0 z" fill={WHITE} {...O} />
      <path d="M18 54 h104 a52 44 0 0 1 -6 20 h-92 a52 44 0 0 1 -6 -20 z" fill={CORAL} {...O} />
      <path d="M34 54 q8 -14 16 0 q8 -14 16 0 q8 -14 16 0 q8 -14 16 0" fill="none" {...O} />
      <circle cx="58" cy="46" r="7" fill={SUN} {...O} strokeWidth={2} />
      <path d="M50 100 h40" {...O} strokeWidth={4} />
      <path d="M40 34 q-5 -7 0 -13 M62 30 q-5 -7 0 -13" fill="none" {...O} strokeWidth={2} />
    </svg>
  );
}

/** Tile 4: three shopfronts under bunting (a street, a BIA). */
export function SpotStreet(p: Art) {
  const fronts = [
    { x: 6, fill: CORAL },
    { x: 50, fill: SUN },
    { x: 94, fill: MINT },
  ];
  return (
    <svg {...svg("0 0 140 110", p)}>
      <path d="M4 14 q66 26 132 0" fill="none" {...O} strokeWidth={2} />
      {[14, 34, 54, 74, 94, 114].map((x, i) => (
        <path key={x} d={`M${x} ${16 + Math.sin((x / 140) * Math.PI) * 10} l8 0 l-4 12 z`} fill={[VIOLET, SUN, CORAL][i % 3]} {...O} strokeWidth={1.75} />
      ))}
      {fronts.map((f) => (
        <g key={f.x}>
          <rect x={f.x} y="46" width="40" height="56" rx="6" fill={WHITE} {...O} />
          <path d={`M${f.x - 2} 46 h44 l-4 12 h-36 z`} fill={f.fill} {...O} />
          <rect x={f.x + 8} y="66" width="12" height="36" rx="3" fill={LILAC} {...O} strokeWidth={2} />
          <rect x={f.x + 24} y="66" width="10" height="12" rx="2" fill={LILAC} {...O} strokeWidth={2} />
        </g>
      ))}
      <path d="M2 102 H138" {...O} />
    </svg>
  );
}

/** The how-are-we-doing chart for "Know how your week went": seven days, today in violet. */
export function WeekBars(p: Art) {
  const h = [38, 52, 44, 66, 58, 74, 92];
  return (
    <svg {...svg("0 0 280 120", p)}>
      <path d="M8 112 H272" stroke="var(--mkt-line-strong)" strokeWidth="2" />
      {h.map((v, i) => (
        <rect key={i} x={14 + i * 38} y={112 - v} width="26" height={v} rx="7" fill={i === 6 ? VIOLET : i === 5 ? MINT : LILAC} />
      ))}
      <path d="M14 82 C 60 70, 100 76, 140 58 S 230 40, 266 22" fill="none" stroke={CORAL} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
    </svg>
  );
}

/** "Promos that bring people in": a megaphone with sound lines. */
export function Megaphone(p: Art) {
  return (
    <svg {...svg("0 0 160 120", p)}>
      <path d="M22 50 h18 l56 -32 v84 l-56 -32 h-18 a8 8 0 0 1 -8 -8 v-4 a8 8 0 0 1 8 -8 z" fill={SUN} {...O} />
      <rect x="92" y="14" width="14" height="92" rx="7" fill={VIOLET} {...O} />
      <path d="M34 70 l10 32 h14 l-8 -30" fill={WHITE} {...O} />
      <path d="M120 40 l18 -12 M124 60 h22 M120 80 l18 12" {...O} strokeWidth={3} />
    </svg>
  );
}

/** "Found by people nearby": a street map with pins, the shop's own pin biggest. */
export function MapScene(p: Art) {
  const pin = (x: number, y: number, fill: string, s = 1) => (
    <g key={`${x}${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 c-12 -14 -18 -22 -18 -32 a18 18 0 0 1 36 0 c0 10 -6 18 -18 32 z" fill={fill} {...O} strokeWidth={2.5 / s} />
      <circle cx="0" cy="-32" r="6.5" fill={WHITE} {...O} strokeWidth={2 / s} />
    </g>
  );
  return (
    <svg {...svg("0 0 320 220", p)}>
      <rect x="4" y="4" width="312" height="212" rx="24" fill={WHITE} {...O} />
      <path d="M4 150 C 80 130, 120 170, 200 150 S 290 120, 316 132 V 196 a20 20 0 0 1 -20 20 H24 a20 20 0 0 1 -20 -20 Z" fill={LILAC} />
      <rect x="24" y="24" width="70" height="52" rx="10" fill={MINT} opacity="0.55" />
      <path d="M4 104 H316 M128 4 V216 M228 4 V150" stroke="var(--mkt-soft)" strokeWidth="16" />
      <path d="M4 104 H316 M128 4 V216 M228 4 V150" stroke="var(--mkt-line-strong)" strokeWidth="1.5" strokeDasharray="6 8" />
      <rect x="4" y="4" width="312" height="212" rx="24" fill="none" {...O} />
      {pin(78, 96, CORAL)}
      {pin(270, 92, MINT)}
      {pin(196, 196, SUN)}
      {pin(172, 120, VIOLET, 1.45)}
    </svg>
  );
}

/** Questions: two speech bubbles, a question mark drawn as a shape and three dots. */
export function AskBubbles(p: Art) {
  return (
    <svg {...svg("0 0 220 170", p)}>
      <path d="M24 20 h110 a18 18 0 0 1 18 18 v54 a18 18 0 0 1 -18 18 h-62 l-26 22 v-22 h-22 a18 18 0 0 1 -18 -18 v-54 a18 18 0 0 1 18 -18 z" fill={VIOLET} {...O} />
      <path d="M64 50 a15 15 0 1 1 22 13 c-6 3 -8 6 -8 12" fill="none" stroke={WHITE} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="78" cy="90" r="5" fill={WHITE} />
      <path d="M128 84 h62 a16 16 0 0 1 16 16 v28 a16 16 0 0 1 -16 16 h-8 v18 l-20 -18 h-34 a16 16 0 0 1 -16 -16 v-28 a16 16 0 0 1 16 -16 z" fill={SUN} {...O} />
      {[142, 160, 178].map((x) => (
        <circle key={x} cx={x} cy="114" r="5" fill={INK} />
      ))}
    </svg>
  );
}

/** A visit: a calendar page with one day booked, and a cup for the chat. */
export function VisitCalendar(p: Art) {
  return (
    <svg {...svg("0 0 240 180", p)}>
      <ellipse cx="118" cy="168" rx="100" ry="8" fill={INK} opacity="0.1" />
      <rect x="28" y="26" width="150" height="136" rx="16" fill={WHITE} {...O} />
      <path d="M28 42 a16 16 0 0 1 16 -16 h118 a16 16 0 0 1 16 16 v16 h-150 z" fill={VIOLET} {...O} />
      <path d="M62 16 v20 M144 16 v20" {...O} strokeWidth={5} />
      {Array.from({ length: 12 }, (_, i) => {
        const x = 44 + (i % 4) * 32;
        const y = 72 + Math.floor(i / 4) * 28;
        return <rect key={i} x={x} y={y} width="22" height="18" rx="5" fill={i === 6 ? MINT : "var(--mkt-soft)"} stroke={i === 6 ? INK : "none"} strokeWidth="2" />;
      })}
      <path d="M113 81 l5 5 l9 -10" fill="none" {...O} />
      <path d="M170 116 h44 v18 a18 18 0 0 1 -18 18 h-8 a18 18 0 0 1 -18 -18 z" fill={CORAL} {...O} />
      <path d="M214 122 a8 8 0 0 1 0 16" fill="none" {...O} />
      <path d="M184 106 q-4 -6 0 -11 M200 106 q-4 -6 0 -11" fill="none" {...O} strokeWidth={2} />
    </svg>
  );
}


/** Small chip icons for the booking trades. */
export function IconPolish(p: Art) {
  return (
    <svg {...svg("0 0 24 24", p)}>
      <rect x="9" y="2.5" width="6" height="7" rx="1.5" fill={INK} />
      <rect x="6" y="9.5" width="12" height="12" rx="3" fill={CORAL} stroke={INK} strokeWidth="1.6" />
    </svg>
  );
}
export function IconScissors(p: Art) {
  return (
    <svg {...svg("0 0 24 24", p)}>
      <path d="M9 14 L20 4 M15 14 L4 4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="7" cy="17.5" r="3.5" fill={SUN} stroke={INK} strokeWidth="1.6" />
      <circle cx="17" cy="17.5" r="3.5" fill={SUN} stroke={INK} strokeWidth="1.6" />
    </svg>
  );
}
export function IconDog(p: Art) {
  return (
    <svg {...svg("0 0 24 24", p)}>
      <path d="M5 6 l3 -2 l1 6 z M19 6 l-3 -2 l-1 6 z" fill={INK} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="7.5" fill={MINT} stroke={INK} strokeWidth="1.6" />
      <circle cx="9.5" cy="12" r="1.1" fill={INK} />
      <circle cx="14.5" cy="12" r="1.1" fill={INK} />
      <ellipse cx="12" cy="15.5" rx="1.8" ry="1.3" fill={INK} />
    </svg>
  );
}
