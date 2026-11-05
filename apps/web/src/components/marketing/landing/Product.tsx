import { Check, Coffee, Croissant, Flower2, MessageCircle, Scissors, Smartphone, Sparkles } from "lucide-react";
import { QrCode } from "@/components/ui/QrCode";
import { copy } from "@/copy/en-CA";
import "./product.css";

/**
 * The landing page's product moments (wave U, live on the home page since wave V), drawn in code: a wallet pass in Apple Wallet's
 * store-card layout, the counter's "Stamp added" moment, the win-back nudge and a weekly "regulars came back" card. Each is sized by
 * its container (container query units), so one component is crisp from a 220px phone inset to a 420px hero. Shop colours are sample
 * shop data (product.css, by data-shop), the rest is the --mkt-* black and white. All names and numbers are sample data; the words
 * around them are in src/copy/en-CA.ts (landing.product).
 */

const W = copy.landing.product;
const fillIn = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

export type ShopKey = "cafe" | "bakery" | "repair" | "nails" | "barber" | "florist";

const ICON = { cafe: Coffee, bakery: Croissant, repair: Smartphone, nails: Sparkles, barber: Scissors, florist: Flower2 } as const;

export interface PassData {
  shop: ShopKey;
  name: string;
  /** Short logo text, one or two letters. */
  mono: string;
  stamps: number;
  of: number;
  reward: string;
  member: string;
  code: string;
}

export const PASSES: Record<ShopKey, PassData> = {
  cafe: { shop: "cafe", name: "Pinecone Coffee", mono: "P", stamps: 7, of: 10, reward: "Free drink", member: "Maya Chen", code: "4471 2208" },
  bakery: { shop: "bakery", name: "Little Oven", mono: "L", stamps: 5, of: 8, reward: "Free loaf", member: "Sam Okafor", code: "2290 8815" },
  repair: { shop: "repair", name: "Fix-It Phone Lab", mono: "F", stamps: 3, of: 5, reward: "Free screen protector", member: "Arjun Mehta", code: "6034 1179" },
  nails: { shop: "nails", name: "Gloss Studio", mono: "G", stamps: 4, of: 6, reward: "Free gel fill", member: "Priya Nair", code: "5108 3362" },
  barber: { shop: "barber", name: "Dundas Cuts", mono: "D", stamps: 6, of: 8, reward: "Free cut", member: "Leo Martins", code: "7731 0046" },
  florist: { shop: "florist", name: "Wild Rose Flowers", mono: "W", stamps: 4, of: 8, reward: "Free bouquet", member: "Nadia Haddad", code: "3315 9027" },
};

/**
 * An Apple Wallet store card: logo and name, the stamps field, the strip of stamps, reward and member, then the code.
 * Wave X: `newest` marks the last earned stamp (the hero pops it in, landing.css); `qr` overrides the code's QR value, so the hero's
 * six sample passes share one QR drawing (identical markup, which compresses to almost nothing).
 */
export function WalletPass({ data, className, fill = false, newest = false, qr }: { data: PassData; className?: string; fill?: boolean; newest?: boolean; qr?: string }) {
  const Icon = ICON[data.shop];
  // `fill`: the page's inline script (app/(marketing)/page.tsx FILL_SCRIPT) sets data-fill to "wait", then "in" once the pass scrolls
  // into view, and the CSS fills the stamps in once. The attribute changes before hydration, so React is told not to mind.
  return (
    <div className={`wu-pass ${className ?? ""}`} data-shop={data.shop} data-fill={fill ? "" : undefined} suppressHydrationWarning={fill} role="img" aria-label={fillIn(W.passLabel, { name: data.name, n: data.stamps, of: data.of })}>
      <div className="wu-pass-card">
      <div className="wu-pass-head">
        <span className="wu-pass-logo" aria-hidden>
          {data.mono}
        </span>
        <span className="wu-pass-name">{data.name}</span>
        <span className="wu-pass-field wu-pass-field-end">
          <small>{W.stamps}</small>
          <b>
            {data.stamps}/{data.of}
          </b>
        </span>
      </div>
      <div className="wu-pass-strip" data-of={data.of}>
        {Array.from({ length: data.of }, (_, i) => (
          <span key={i} className={i < data.stamps ? (newest && i === data.stamps - 1 ? "wu-stamp wu-stamp-on wu-stamp-new" : "wu-stamp wu-stamp-on") : "wu-stamp"} style={{ "--i": i } as React.CSSProperties}>
            {i < data.stamps ? <Icon aria-hidden strokeWidth={2} /> : null}
          </span>
        ))}
      </div>
      <div className="wu-pass-fields">
        <span className="wu-pass-field">
          <small>{W.reward}</small>
          <b>{data.reward}</b>
        </span>
        <span className="wu-pass-field wu-pass-field-end">
          <small>{W.member}</small>
          <b>{data.member}</b>
        </span>
      </div>
      <div className="wu-pass-code">
        <span className="wu-pass-qr">
          <QrCode value={qr ?? `https://localloyalty.ca/c/${data.code.replace(" ", "")}`} size={120} ecc="L" label={W.memberCode} />
          <small>{data.code}</small>
        </span>
      </div>
      </div>
    </div>
  );
}

/** A clean phone: thin black bezel, the island, a status bar, and whatever screen it holds. */
export function Phone({ children, className, tone = "light" }: { children: React.ReactNode; className?: string; tone?: "light" | "dark" | "wallet" }) {
  return (
    <div className={`wu-phone ${className ?? ""}`} data-tone={tone}>
      <div className="wu-phone-body">
      <div className="wu-phone-screen">
        <div className="wu-phone-bar" aria-hidden>
          <span>{W.time}</span>
          <span className="wu-phone-island" />
          <span className="wu-phone-icons">
            <svg viewBox="0 0 18 12">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
              <rect x="10" y="3" width="3" height="9" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" />
            </svg>
            <svg viewBox="0 0 26 12">
              <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
              <rect x="2.5" y="2.5" width="16" height="7" rx="2" />
              <rect x="24" y="4" width="1.6" height="4" rx="0.8" opacity="0.4" />
            </svg>
          </span>
        </div>
        {children}
      </div>
      </div>
    </div>
  );
}

/** The wallet app's screen around a pass: the pass at the top, the next card's edge peeking below. */
export function WalletScreen({ data, fill = false }: { data: PassData; fill?: boolean }) {
  return (
    <div className="wu-wallet">
      <div className="wu-wallet-top" aria-hidden>
        <span className="wu-wallet-done">{W.done}</span>
        <span className="wu-wallet-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <WalletPass data={data} fill={fill} />
      <div className="wu-wallet-stack" aria-hidden>
        {(Object.keys(PASSES) as ShopKey[])
          .filter((k) => k !== data.shop)
          .slice(0, 3)
          .map((k) => (
            <span key={k} className="wu-wallet-sliver" data-shop={k}>
              <i>{PASSES[k].mono}</i>
              {PASSES[k].name}
            </span>
          ))}
      </div>
    </div>
  );
}

/** The counter's moment: one big number and a name. */
export function StampAdded({ data, className, bare = false }: { data: PassData; className?: string; bare?: boolean }) {
  const left = data.of - data.stamps;
  return (
    <div className={`wu-stamped ${bare ? "wu-stamped-bare" : ""} ${className ?? ""}`} data-shop={data.shop} role="img" aria-label={fillIn(W.stampLabel, { who: data.member, n: data.stamps, of: data.of })}>
      {bare ? (
        <span className="wu-stamped-bar" aria-hidden>
          <span>{data.name}</span>
          <span>{W.counter}</span>
        </span>
      ) : null}
      <div className="wu-stamped-in">
      <span className="wu-stamped-ok">
        <span className="wu-stamped-tick" aria-hidden>
          <Check strokeWidth={3} />
        </span>
        {W.stampAdded}
      </span>
      <span className="wu-stamped-n">
        {data.stamps}
        <small>/{data.of}</small>
      </span>
      <span className="wu-stamped-who">{data.member}</span>
      <span className="wu-stamped-dots" aria-hidden>
        {Array.from({ length: data.of }, (_, i) => (
          <i key={i} className={i < data.stamps ? "on" : undefined} />
        ))}
      </span>
      <span className="wu-stamped-left">
        {fillIn(W.left, { n: left, reward: data.reward.toLowerCase() })}
      </span>
      </div>
      {bare ? (
        <span className="wu-stamped-next" aria-hidden>
          {W.next}
        </span>
      ) : null}
    </div>
  );
}

/** A small toast version for laying on a photo: tick, "Stamp added", the name and the count. */
export function StampToast({ data, className }: { data: PassData; className?: string }) {
  return (
    <div className={`wu-toast ${className ?? ""}`} data-shop={data.shop} role="img" aria-label={fillIn(W.toastLabel, { who: data.member })}>
      <span className="wu-toast-tick" aria-hidden>
        <Check strokeWidth={3} />
      </span>
      <span className="wu-toast-text">
        <b>{W.stampAdded}</b>
        <small>
          {fillIn(W.toastLine, { who: data.member, n: data.stamps, of: data.of })}
        </small>
      </span>
    </div>
  );
}

/** The week at a glance: regulars who came back, a change on last week, a bar for each day. */
export function WeeklyCard({ className, total = 38, change = 9, days = [4, 6, 5, 7, 5, 8, 3], shop }: { className?: string; total?: number; change?: number; days?: number[]; shop?: string }) {
  const max = Math.max(...days);
  const D = W.days;
  return (
    <div className={`wu-week ${className ?? ""}`} role="img" aria-label={fillIn(W.weekLabel, { total, change })}>
      <span className="wu-week-top">
        <span>{shop ? `${W.thisWeek} · ${shop}` : W.thisWeek}</span>
        <span className="wu-week-up">+{change}</span>
      </span>
      <span className="wu-week-n">{total}</span>
      <span className="wu-week-label">{W.cameBack}</span>
      <span className="wu-week-bars" aria-hidden>
        {days.map((v, i) => (
          <span key={i} className="wu-week-col">
            <i className={i === 5 ? "hi" : undefined} data-h={Math.max(1, Math.round((v / max) * 10))} />
            <small>{D[i]}</small>
          </span>
        ))}
      </span>
    </div>
  );
}

/** The win-back moment: a regular who has gone quiet, her last order, and the one button that sends her a reason to come back. */
export function WinBack({ className }: { className?: string }) {
  const B = copy.landing.outcomes.winback;
  return (
    <div className={`wu-nudge ${className ?? ""}`} role="img" aria-label={`${B.who}: ${B.line}. ${B.action}.`}>
      <div className="wu-nudge-in">
      <span className="wu-nudge-top">
        <span className="wu-nudge-face" aria-hidden>
          {B.who.split(" ").map((w) => w[0]).join("")}
        </span>
        <span className="wu-nudge-who">
          <b>{B.who}</b>
          <small>{B.last}</small>
        </span>
      </span>
      <span className="wu-nudge-line">{B.line}</span>
      <span className="wu-nudge-offer">
        <MessageCircle aria-hidden strokeWidth={2} />
        {B.offer}
      </span>
      <span className="wu-nudge-btn" aria-hidden>
        {B.action}
      </span>
      </div>
    </div>
  );
}
