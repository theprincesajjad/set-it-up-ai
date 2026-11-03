import { Check, Coffee, Croissant, Scissors, Smartphone, Sparkles } from "lucide-react";
import { QrCode } from "@/components/ui/QrCode";
import "./product.css";

/**
 * Wave U product moments, drawn in code for the three /dev/landing directions (no app screenshots): a wallet pass in Apple Wallet's
 * store-card layout, the counter's "Stamp added" moment, and a weekly "regulars came back" card. Each is sized by its container
 * (container query units), so one component is crisp from a 220px phone inset to a 420px hero. Shop colours are sample shop data
 * (product.css, by data-shop), the rest is the --mkt-* black and white. All names and numbers are sample data.
 */

export type ShopKey = "cafe" | "bakery" | "repair" | "nails" | "barber";

const ICON = { cafe: Coffee, bakery: Croissant, repair: Smartphone, nails: Sparkles, barber: Scissors } as const;

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
};

/** An Apple Wallet store card: logo and name, the stamps field, the strip of stamps, reward and member, then the code. */
export function WalletPass({ data, className }: { data: PassData; className?: string }) {
  const Icon = ICON[data.shop];
  return (
    <div className={`wu-pass ${className ?? ""}`} data-shop={data.shop} role="img" aria-label={`${data.name} stamp card in a phone wallet, ${data.stamps} of ${data.of} stamps`}>
      <div className="wu-pass-card">
      <div className="wu-pass-head">
        <span className="wu-pass-logo" aria-hidden>
          {data.mono}
        </span>
        <span className="wu-pass-name">{data.name}</span>
        <span className="wu-pass-field wu-pass-field-end">
          <small>Stamps</small>
          <b>
            {data.stamps}/{data.of}
          </b>
        </span>
      </div>
      <div className="wu-pass-strip" data-of={data.of}>
        {Array.from({ length: data.of }, (_, i) => (
          <span key={i} className={i < data.stamps ? "wu-stamp wu-stamp-on" : "wu-stamp"}>
            {i < data.stamps ? <Icon aria-hidden strokeWidth={2} /> : null}
          </span>
        ))}
      </div>
      <div className="wu-pass-fields">
        <span className="wu-pass-field">
          <small>Reward</small>
          <b>{data.reward}</b>
        </span>
        <span className="wu-pass-field wu-pass-field-end">
          <small>Member</small>
          <b>{data.member}</b>
        </span>
      </div>
      <div className="wu-pass-code">
        <span className="wu-pass-qr">
          <QrCode value={`https://localloyalty.ca/c/${data.code.replace(" ", "")}`} size={120} ecc="L" label="Member code" />
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
          <span>9:41</span>
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
export function WalletScreen({ data }: { data: PassData }) {
  return (
    <div className="wu-wallet">
      <div className="wu-wallet-top" aria-hidden>
        <span className="wu-wallet-done">Done</span>
        <span className="wu-wallet-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <WalletPass data={data} />
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
    <div className={`wu-stamped ${bare ? "wu-stamped-bare" : ""} ${className ?? ""}`} data-shop={data.shop} role="img" aria-label={`Stamp added for ${data.member}: ${data.stamps} of ${data.of}`}>
      {bare ? (
        <span className="wu-stamped-bar" aria-hidden>
          <span>{data.name}</span>
          <span>Counter</span>
        </span>
      ) : null}
      <div className="wu-stamped-in">
      <span className="wu-stamped-ok">
        <span className="wu-stamped-tick" aria-hidden>
          <Check strokeWidth={3} />
        </span>
        Stamp added
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
        {left} more to a {data.reward.toLowerCase()}
      </span>
      </div>
      {bare ? (
        <span className="wu-stamped-next" aria-hidden>
          Next customer
        </span>
      ) : null}
    </div>
  );
}

/** A small toast version for laying on a photo: tick, "Stamp added", the name and the count. */
export function StampToast({ data, className }: { data: PassData; className?: string }) {
  return (
    <div className={`wu-toast ${className ?? ""}`} data-shop={data.shop} role="img" aria-label={`Stamp added for ${data.member}`}>
      <span className="wu-toast-tick" aria-hidden>
        <Check strokeWidth={3} />
      </span>
      <span className="wu-toast-text">
        <b>Stamp added</b>
        <small>
          {data.member} · {data.stamps} of {data.of}
        </small>
      </span>
    </div>
  );
}

/** The week at a glance: regulars who came back, a change on last week, a bar for each day. */
export function WeeklyCard({ className, total = 38, change = 9, days = [4, 6, 5, 7, 5, 8, 3], shop }: { className?: string; total?: number; change?: number; days?: number[]; shop?: string }) {
  const max = Math.max(...days);
  const D = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className={`wu-week ${className ?? ""}`} role="img" aria-label={`This week ${total} regulars came back, ${change} more than last week`}>
      <span className="wu-week-top">
        <span>This week{shop ? ` · ${shop}` : ""}</span>
        <span className="wu-week-up">+{change}</span>
      </span>
      <span className="wu-week-n">{total}</span>
      <span className="wu-week-label">regulars came back</span>
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
