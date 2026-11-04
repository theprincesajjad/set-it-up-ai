"use client";
import { ArrowRight, Check, Coffee, Croissant, Flower2, PawPrint, Scissors, ShoppingBasket, Smartphone, Sparkles } from "lucide-react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { buttonName, tryHref } from "@/lib/marketing/try-href";

/**
 * The home page's "try it" card maker (wave V): the one client island on the landing page. The owner types a name, picks a trade and a
 * colour, and the wallet pass updates as they go; "Keep this card" carries all three into signup (lib/marketing/try-href.ts).
 * The section around it, the phone and the QR are server-rendered (TrySection.tsx); this file holds only the state, the controls and
 * the pass. Every trade's reward, goal and colour arrives as plain data from lib/marketing/try-card.ts, so no templates or colour maths
 * ship to the browser. Shop tiles further down the page preset the trade: any link with `data-try-trade` (TrySection's listener here).
 * Motion: the stamps fill in once when the card first scrolls into view, and again only when the trade changes; transform and opacity
 * only, and none of it under prefers-reduced-motion (landing.css).
 */

export interface TryTradeData {
  key: string;
  vertical: string;
  icon: "coffee" | "croissant" | "scissors" | "sparkles" | "phone" | "basket" | "flower" | "paw";
  kind: "stamps" | "points";
  goal: number;
  reward: string;
  label: string;
  colour: { base: string; fill: string; ink: string };
}
export interface TryColourData {
  base: string;
  fill: string;
  ink: string;
  name: string;
}
export interface TryCopy {
  name: string;
  namePlaceholder: string;
  nameEmpty: string;
  trade: string;
  colour: string;
  colourOwn: string;
  reward: string;
  stamps: string;
  points: string;
  rewardNote: string;
  cta: string;
  ctaNamed: string;
  note: string;
  pass: { stamps: string; points: string; reward: string; member: string; memberName: string; code: string };
  updated: string;
  passLabel: string;
  notice: { now: string; stamps: string; points: string; left: string };
  ready: { when: string; title: string; line: string };
}

const ICONS = { coffee: Coffee, croissant: Croissant, scissors: Scissors, sparkles: Sparkles, phone: Smartphone, basket: ShoppingBasket, flower: Flower2, paw: PawPrint } as const;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

interface TryState {
  name: string;
  setName: (v: string) => void;
  trade: TryTradeData;
  setTrade: (key: string) => void;
  /** -1: the trade's own colour; otherwise an index into `colours`. */
  colourAt: number;
  setColourAt: (i: number) => void;
  colour: { base: string; fill: string; ink: string };
  trades: TryTradeData[];
  colours: TryColourData[];
  copy: TryCopy;
  /** Bumped when the trade changes, so the stamps fill in again. */
  run: number;
  rewardLine: string;
  shown: string;
}

const Ctx = createContext<TryState | null>(null);
const useTry = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("Try card parts must sit inside TryProvider");
  return c;
};

export function TryProvider({ trades, colours, copy, children }: { trades: TryTradeData[]; colours: TryColourData[]; copy: TryCopy; children: ReactNode }) {
  const [name, setName] = useState("");
  const [tradeKey, setTradeKey] = useState(trades[0]!.key);
  const [colourAt, setColourAt] = useState(-1);
  const [run, setRun] = useState(0);
  const trade = trades.find((t) => t.key === tradeKey) ?? trades[0]!;
  const colour = colourAt >= 0 && colours[colourAt] ? colours[colourAt] : trade.colour;
  const setTrade = (key: string) => {
    const next = trades.find((t) => t.key === key);
    if (key === tradeKey || !next) return;
    setTradeKey(key);
    // A picked colour that is the new trade's own colour becomes "the trade's colour" again (signup then keeps the trade default).
    if (colourAt >= 0 && colours[colourAt]?.base === next.colour.base) setColourAt(-1);
    setRun((n) => n + 1);
  };
  // Shop tiles lower on the page ("Make a café card") preset the trade, then the link's #try does the scrolling.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("[data-try-trade]");
      const key = a?.getAttribute("data-try-trade");
      if (key) setTrade(key);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  });
  const rewardLine = fill(trade.kind === "stamps" ? copy.stamps : copy.points, { reward: trade.reward, goal: trade.goal.toLocaleString("en-CA") });
  const shown = name.trim() || copy.nameEmpty;
  const value: TryState = { name, setName, trade, setTrade, colourAt, setColourAt, colour, trades, colours, copy, run, rewardLine, shown };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The name field, the trade chips and the colour swatches; then the reward it starts with. */
export function TryControls() {
  const { name, setName, trade, setTrade, colourAt, setColourAt, trades, colours, copy, rewardLine, shown } = useTry();
  const id = useId();
  const others = colours.filter((c) => c.base !== trade.colour.base);
  const [said, setSaid] = useState("");
  // Announce a trade or colour change (not every keystroke of the name).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaid(fill(copy.updated, { name: shown, trade: trade.label, reward: rewardLine }));
  }, [trade.key, colourAt]); // eslint-disable-line react-hooks/exhaustive-deps -- announce choices, not typing
  return (
    <div className="lp-try-form">
      <div className="lp-field">
        <label htmlFor={`${id}-name`} className="lp-label">
          {copy.name}
        </label>
        <input
          id={`${id}-name`}
          className="lp-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={copy.namePlaceholder}
          maxLength={40}
          autoComplete="organization"
          spellCheck={false}
          enterKeyHint="done"
        />
      </div>
      <fieldset className="lp-field">
        <legend className="lp-label">{copy.trade}</legend>
        <div className="lp-chips">
          {trades.map((t) => {
            const Icon = ICONS[t.icon];
            return (
              <label key={t.key} className="lp-chip" data-on={t.key === trade.key || undefined}>
                <input type="radio" name={`${id}-trade`} value={t.key} checked={t.key === trade.key} onChange={() => setTrade(t.key)} className="sr-only" />
                <Icon aria-hidden strokeWidth={1.75} />
                {t.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="lp-field">
        <legend className="lp-label">{copy.colour}</legend>
        <div className="lp-swatches">
          {[{ ...trade.colour, name: copy.colourOwn, at: -1 }, ...others.map((c) => ({ ...c, at: colours.indexOf(c) }))].map((c) => (
            <label key={c.base} className="lp-swatch" data-on={c.at === colourAt || undefined} style={{ "--sw": c.fill } as CSSProperties}>
              <input type="radio" name={`${id}-colour`} value={c.base} checked={c.at === colourAt} onChange={() => setColourAt(c.at)} className="sr-only" aria-label={c.name} />
              <span aria-hidden />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="lp-try-reward">
        <span className="lp-label">{copy.reward}</span>
        <p>
          <Check aria-hidden strokeWidth={2.5} />
          <b>{rewardLine}</b>
        </p>
        <small>{copy.rewardNote}</small>
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

/** The hand-off: name, trade and colour into signup (data-cta="tryit"). The button names the owner's shop once one is typed. */
export function TryCta() {
  const { name, trade, colourAt, colour, copy } = useTry();
  const href = useMemo(() => tryHref({ name, vertical: trade.vertical, colour: colourAt >= 0 && colour.base !== trade.colour.base ? colour.base : null }), [name, trade, colourAt, colour]);
  const shop = buttonName(name);
  return (
    <div className="lp-try-cta">
      <a href={href} className="lp-btn lp-btn-black lp-btn-xl" data-cta="tryit">
        <span>{shop ? fill(copy.ctaNamed, { name: shop }) : copy.cta}</span>
        <ArrowRight aria-hidden strokeWidth={2} />
      </a>
      <p className="lp-note">{copy.note}</p>
    </div>
  );
}

/**
 * The pass in Apple Wallet's store-card layout (the same parts and classes as Product.tsx's WalletPass), in the picked colour. `qr` is
 * the server-rendered member code, so the QR encoder stays out of the bundle.
 */
export function TryPass({ qr }: { qr: ReactNode }) {
  const { trade, colour, copy, run, rewardLine, shown } = useTry();
  const Icon = ICONS[trade.icon];
  const ref = useRef<HTMLDivElement>(null);
  // "0" until the pass first comes into view, then "1" for good: the CSS fills the stamps in once on that change (never a loop).
  const [seen, setSeen] = useState<"0" | "1" | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // The server markup shows the card filled; the stamps only empty out once script is here to bring them back in.
    setSeen((s) => s ?? "0");
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setSeen("1");
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const filled = trade.kind === "stamps" ? Math.max(1, trade.goal - 3) : Math.round(trade.goal * 0.6);
  const initial = Array.from(shown)[0]?.toUpperCase() ?? "";
  const style = { "--shop": colour.fill, "--shop-ink": colour.ink } as CSSProperties;
  return (
    <div ref={ref} className="wu-pass lp-try-pass" data-seen={seen} style={style} role="img" aria-label={fill(copy.passLabel, { name: shown, reward: rewardLine })}>
      <div className="wu-pass-card">
        <div className="wu-pass-head">
          <span className="wu-pass-logo" aria-hidden>
            {initial}
          </span>
          <span className="wu-pass-name">{shown}</span>
          <span className="wu-pass-field wu-pass-field-end">
            <small>{trade.kind === "stamps" ? copy.pass.stamps : copy.pass.points}</small>
            <b>
              {filled.toLocaleString("en-CA")}/{trade.goal.toLocaleString("en-CA")}
            </b>
          </span>
        </div>
        {trade.kind === "stamps" ? (
          <div className="wu-pass-strip" data-of={trade.goal} key={`s${run}`}>
            {Array.from({ length: trade.goal }, (_, i) => (
              <span key={i} className={i < filled ? "wu-stamp wu-stamp-on" : "wu-stamp"} style={{ "--i": i } as CSSProperties}>
                {i < filled ? <Icon aria-hidden strokeWidth={2} /> : null}
              </span>
            ))}
          </div>
        ) : (
          <div className="wu-pass-points" key={`p${run}`}>
            <span className="wu-pass-points-icon" aria-hidden>
              <Icon strokeWidth={2} />
            </span>
            <span className="wu-pass-bar" aria-hidden>
              <i style={{ "--to": filled / trade.goal } as CSSProperties} />
            </span>
          </div>
        )}
        <div className="wu-pass-fields">
          <span className="wu-pass-field">
            <small>{copy.pass.reward}</small>
            <b>{trade.reward}</b>
          </span>
          <span className="wu-pass-field wu-pass-field-end">
            <small>{copy.pass.member}</small>
            <b>{copy.pass.memberName}</b>
          </span>
        </div>
        <div className="wu-pass-code">
          <span className="wu-pass-qr">
            {qr}
            <small>{copy.pass.code}</small>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The lock-screen notification a customer gets after a visit: the shop, "Stamp added" (or points), and how far to the reward. */
export function TryNotice() {
  const { trade, colour, copy, shown } = useTry();
  const filled = trade.kind === "stamps" ? Math.max(1, trade.goal - 3) : Math.round(trade.goal * 0.6);
  const left = trade.goal - filled;
  const N = copy.notice;
  return (
    <div className="lp-notice" aria-hidden style={{ "--shop": colour.fill, "--shop-ink": colour.ink } as CSSProperties}>
      <span className="lp-notice-icon">{Array.from(shown)[0]?.toUpperCase()}</span>
      <span className="lp-notice-text">
        <span className="lp-notice-top">
          <span>{shown}</span>
          <small>{N.now}</small>
        </span>
        <b>{trade.kind === "stamps" ? N.stamps : fill(N.points, { n: Math.max(1, Math.round(trade.goal / 10)) })}</b>
        <span>{fill(N.left, { left: left.toLocaleString("en-CA"), reward: trade.reward })}</span>
      </span>
    </div>
  );
}

/** The second notification, a later visit: the card is full and the reward is ready (fills the phone's lower half on desktop). */
export function TryReady() {
  const { trade, colour, copy, shown } = useTry();
  const R = copy.ready;
  return (
    <div className="lp-notice lp-notice-ready" aria-hidden style={{ "--shop": colour.fill, "--shop-ink": colour.ink } as CSSProperties}>
      <span className="lp-notice-icon">{Array.from(shown)[0]?.toUpperCase()}</span>
      <span className="lp-notice-text">
        <span className="lp-notice-top">
          <span>{shown}</span>
          <small>{R.when}</small>
        </span>
        <b>{R.title}</b>
        <span>{fill(R.line, { reward: trade.reward })}</span>
      </span>
    </div>
  );
}
