/**
 * Spot illustrations for the home page (wave S): flat shapes with one confident ink outline, filled from the `.mkt` palette (sun, mint,
 * coral, violet, white). Server-rendered inline SVG: crisp at any size, a few hundred bytes each, no image requests, nothing to hydrate.
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

/** A four-point sparkle centred on (x, y). */
function Sparkle({ x, y, r = 7, fill = SUN }: { x: number; y: number; r?: number; fill?: string }) {
  const k = r * 0.28;
  return <path d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r}Z`} fill={fill} {...O} strokeWidth={2} />;
}

/** The hero shopfront: string lights on the parapet, a striped awning, the window with a cup and a plant on the counter, the door. */
export function ShopFront(p: Art) {
  const stripes = 8;
  const top = { x: 52, w: 316 / stripes };
  const bot = { x: 30, w: 360 / stripes };
  return (
    <svg {...svg("0 0 420 372", p)}>
      <ellipse cx="210" cy="352" rx="200" ry="12" fill={INK} opacity="0.1" />
      {/* Building and parapet */}
      <rect x="44" y="70" width="332" height="276" rx="14" fill={WHITE} {...O} />
      <rect x="30" y="44" width="360" height="40" rx="12" fill={VIOLET} {...O} />
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={58 + i * 38} cy="64" r="6" fill={i % 3 === 1 ? MINT : SUN} {...O} strokeWidth={2} />
      ))}
      {/* Awning: stripes, then a scallop under each one */}
      {Array.from({ length: stripes }, (_, i) => (
        <path key={`s${i}`} d={`M${top.x + i * top.w} 100 H${top.x + (i + 1) * top.w} L${bot.x + (i + 1) * bot.w} 150 H${bot.x + i * bot.w} Z`} fill={i % 2 ? WHITE : CORAL} />
      ))}
      {Array.from({ length: stripes }, (_, i) => (
        <path key={`c${i}`} d={`M${bot.x + i * bot.w} 150 a${bot.w / 2} ${bot.w / 2.4} 0 0 0 ${bot.w} 0`} fill={i % 2 ? WHITE : CORAL} {...O} />
      ))}
      <path d={`M${top.x} 100 H${top.x + 316} L390 150 H30 Z`} fill="none" {...O} />
      {/* Window: the counter, a cup with steam, a plant */}
      <rect x="72" y="190" width="176" height="128" rx="12" fill={LILAC} {...O} />
      <path d="M86 206 l26 -0 M86 218 l14 0" stroke={WHITE} strokeWidth="5" strokeLinecap="round" />
      <rect x="72" y="278" width="176" height="40" rx="0" fill={SUN} {...O} />
      <path d="M108 248 h34 v18 a12 12 0 0 1 -12 12 h-10 a12 12 0 0 1 -12 -12 z" fill={WHITE} {...O} />
      <path d="M142 252 a8 8 0 0 1 0 16" fill="none" {...O} />
      <path d="M118 236 q-5 -7 0 -13 q5 -6 0 -12 M132 236 q-5 -7 0 -13 q5 -6 0 -12" fill="none" {...O} strokeWidth={2} />
      <path d="M196 278 l4 -26 h28 l4 26 z" fill={CORAL} {...O} />
      <path d="M214 252 c-14 -6 -20 -22 -12 -34 c10 6 14 20 12 34 z" fill={MINT} {...O} />
      <path d="M214 252 c10 -8 24 -10 30 -2 c-8 8 -20 8 -30 2 z" fill={MINT} {...O} />
      <path d="M214 252 c0 -14 6 -28 16 -32 c4 12 -4 26 -16 32 z" fill={MINT} {...O} />
      {/* Door, with its window and a stamp badge */}
      <rect x="270" y="190" width="84" height="156" rx="10" fill={MINT} {...O} />
      <rect x="284" y="204" width="56" height="58" rx="8" fill={LILAC} {...O} />
      <circle cx="342" cy="292" r="4.5" fill={INK} />
      <circle cx="312" cy="300" r="15" fill={WHITE} {...O} />
      <circle cx="312" cy="300" r="8" fill="none" stroke={CORAL} strokeWidth="3.5" />
      {/* Ground and the bushes either side */}
      <path d="M8 346 H412" {...O} />
      <circle cx="30" cy="330" r="18" fill={MINT} {...O} />
      <circle cx="52" cy="336" r="12" fill={MINT} {...O} />
      <circle cx="392" cy="332" r="16" fill={MINT} {...O} />
      <Sparkle x={404} y={30} r={10} />
      <Sparkle x={16} y={110} r={7} fill={WHITE} />
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
      <Sparkle x={34} y={40} r={9} />
      <Sparkle x={210} y={34} r={7} fill={WHITE} />
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
      <Sparkle x={214} y={84} r={8} />
      <Sparkle x={34} y={30} r={6} fill={WHITE} />
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
      <Sparkle x={38} y={52} r={9} />
      <Sparkle x={214} y={30} r={6} fill={WHITE} />
    </svg>
  );
}

/** Where-do-you-fit tile 1: a cup on its saucer, steaming. */
export function SpotCup(p: Art) {
  return (
    <svg {...svg("0 0 140 110", p)}>
      <ellipse cx="66" cy="94" rx="46" ry="9" fill={WHITE} {...O} />
      <path d="M30 44 h72 v20 a28 28 0 0 1 -28 28 h-16 a28 28 0 0 1 -28 -28 z" fill={WHITE} {...O} />
      <rect x="30" y="56" width="72" height="12" fill={VIOLET} />
      <path d="M30 44 h72 v20 a28 28 0 0 1 -28 28 h-16 a28 28 0 0 1 -28 -28 z" fill="none" {...O} />
      <path d="M102 52 a13 13 0 0 1 0 26" fill="none" {...O} strokeWidth={3} />
      <path d="M52 34 q-6 -8 0 -15 q6 -7 0 -14 M74 34 q-6 -8 0 -15 q6 -7 0 -14" fill="none" {...O} />
      <Sparkle x={118} y={22} r={8} fill={WHITE} />
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
      <Sparkle x={196} y={30} r={10} fill={WHITE} />
      <Sparkle x={12} y={140} r={7} fill={CORAL} />
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
      <Sparkle x={210} y={40} r={9} />
    </svg>
  );
}

/** Confetti for the closing band: rings and sparkles on violet. Positioned by CSS at either end. */
export function Confetti(p: Art) {
  return (
    <svg {...svg("0 0 200 200", p)}>
      <circle cx="40" cy="44" r="18" fill="none" stroke={SUN} strokeWidth="7" />
      <circle cx="150" cy="150" r="24" fill={MINT} {...O} />
      <circle cx="150" cy="150" r="12" fill="none" stroke={INK} strokeWidth="3" />
      <circle cx="160" cy="40" r="9" fill={CORAL} {...O} strokeWidth={2} />
      <Sparkle x={70} y={150} r={14} />
      <Sparkle x={120} y={88} r={8} fill={WHITE} />
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
