"use client";
/**
 * Top card of the pass (Main Street Warm, Figma 35:2 and 35:199): the shop's trade gradient, awning stripe, the shop's identity, a
 * "Reward ready" pill, the trade's stamps (or a progress bar for a points shop), the big n / goal numeral and the trade's category
 * illustration. It shows ONE shop (the one with a reward ready, else the one closest to its next reward); points are never summed
 * across shops. The shop's own colour appears only inside its avatar. Text sits on the left of the gradient, where it is at most
 * 30% toward the second colour, so it keeps contrast in every trade (light and dark).
 */
import { placeKindLabel, type customerApi } from "@ll/shared";
import { useState } from "react";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { StampCard } from "@/components/ui/StampCard";
import { shopInitials } from "@/lib/shopAvatar";
import { formatNumber, withArticle } from "@/lib/format";
import { unitCaption } from "@/lib/units";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { rewardNameIn } from "@/lib/i18n/rewardName";
import { cn } from "@/lib/cn";
import { AwningStripe } from "./PassChrome";
import { stampIcon } from "./stampIcons";
import { usePassStyle } from "./useThemeStyle";
import styles from "./ClearPass.module.css";

/** The shop to feature: a reward ready first, else the highest progress to the next reward, else the first shop. */
export function heroMembership(items: customerApi.MembershipDto[]): customerApi.MembershipDto | null {
  const ready = items.filter((m) => m.rewardsAvailableCount > 0).sort((a, b) => b.rewardsAvailableCount - a.rewardsAvailableCount)[0];
  if (ready) return ready;
  const closest = items
    .filter((m) => m.nextReward && m.nextReward.pointsNeeded > 0)
    .sort((a, b) => b.nextReward!.progressPct - a.nextReward!.progressPct || a.nextReward!.pointsNeeded - b.nextReward!.pointsNeeded)[0];
  return closest ?? items[0] ?? null;
}

/** The shop's square white tile on the gradient: its logo, else its initials in the trade colour. */
function PassLogo({ shop }: { shop: customerApi.MerchantBriefDto }) {
  const [failed, setFailed] = useState(false);
  return shop.logoUrl && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logoUrl} alt="" width={52} height={52} onError={() => setFailed(true)} className="size-[52px] shrink-0 rounded-2xl bg-card object-cover" />
  ) : (
    <span aria-hidden className="inline-flex size-[52px] shrink-0 select-none items-center justify-center rounded-2xl bg-trade-pass-text text-body-strong font-extrabold tracking-wide text-trade-pass-from">
      {shopInitials(shop.name)}
    </span>
  );
}

export function ShopPassHero({ m, line, footer }: { m: customerApi.MembershipDto; /** Line under the numeral (points needed, expiry rule). */ line: string | null; footer?: React.ReactNode }) {
  const style = usePassStyle();
  return style === "clear" ? <ClearPassCard m={m} line={line} footer={footer} /> : <WarmPassHero m={m} line={line} footer={footer} />;
}

/** The shop's mark on the Clear pass: 40 r10, its logo, else its initials on the trade colour. */
function ClearMark({ shop }: { shop: customerApi.MerchantBriefDto }) {
  const [failed, setFailed] = useState(false);
  return shop.logoUrl && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logoUrl} alt="" width={40} height={40} onError={() => setFailed(true)} className="size-10 shrink-0 rounded-r3 bg-card object-cover" />
  ) : (
    <span aria-hidden className="inline-flex size-10 shrink-0 select-none items-center justify-center rounded-r3 bg-trade text-[14px] font-semibold leading-5 text-trade-foreground">
      {shopInitials(shop.name)}
    </span>
  );
}

/**
 * The pass in Clear (v3.2-clear-audit.md 2.4 "Pass card", v6 mock `?s=pass`): an Apple Wallet-style card in strong Liquid Glass over the
 * shop's own colour. Above it, on the brand field: "Your pass", the shop's name (30/36) and what kind of place it is. The card (358 wide,
 * r30, padding 20): the 40px shop mark, the card's kind and the progress line, a badge (n to go, or reward ready); the stamps (5 x 54,
 * gap 12) or a points bar; then the Wallet field row over an inset rule (STAMPS n / goal, NEXT REWARD, MEMBER SINCE). The trade colour
 * is the field, the mark and the stamp glyphs only.
 */
function ClearPassCard({ m, line, footer }: { m: customerApi.MembershipDto; line: string | null; footer?: React.ReactNode }) {
  const { t, locale, date } = useLocaleOrEnglish();
  const next = m.nextReward;
  const ready = m.rewardsAvailableCount > 0;
  const stamps = m.program?.earnType === "stamps";
  const stampGoal = stamps ? Math.max(1, Math.min(12, m.program!.stampGoal || 10)) : 0;
  const goal = stamps ? stampGoal : (next?.pointsCost ?? (ready ? Math.max(1, m.balance) : 0));
  const shown = goal > 0 ? Math.min(stamps ? (m.balance >= goal ? goal : m.balance % goal) : m.balance, goal) : m.balance;
  const toGo = Math.max(0, goal - shown);
  const unit = unitCaption(locale, 2, m.terminology);
  const pct = goal > 0 ? Math.round((shown / goal) * 100) : 0;
  const Glyph = stampIcon(m.merchant.vertical);
  // Five 54px columns fill the 318px content box exactly; a 6-wide card (11 or 12 stamps) steps the circles down to 42.
  const cols = stampGoal <= 5 ? stampGoal : stampGoal === 8 ? 4 : stampGoal <= 10 ? 5 : 6;
  const size = cols <= 5 ? 54 : 42;
  const rewardName = next ? rewardNameIn(locale, t, next.name) : null;
  const badge = ready ? (m.rewardsAvailableCount > 1 ? t("sh.wallet.rewardsReadyN", { n: m.rewardsAvailableCount }) : t("sh.wallet.rewardReady")) : goal > 0 ? t("ui.stampToGo", { n: formatNumber(toGo) }) : null;
  return (
    <>
    <section aria-label={m.merchant.name} data-trade={m.merchant.vertical} className="relative flex flex-col gap-4">
      <div aria-hidden className={styles.field} />
      <div className="text-trade-pass-text">
        <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] opacity-85">{t("cl.ui.yourPass")}</p>
        <h2 className="mt-1 text-[30px] font-bold leading-9 tracking-[-0.022em]"><bdi>{m.merchant.name}</bdi></h2>
        <p className="text-body opacity-90">{placeKindLabel(locale, m.merchant.vertical)}</p>
      </div>
      <div data-lens data-lens-r="30" data-lens-bezel="24" className="glass-sheet rounded-r8 p-5 text-foreground">
        <div className="flex items-center gap-3 pb-4">
          <ClearMark shop={m.merchant} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold leading-5 tracking-[-0.014em]">{stamps ? t("pass.clear.stampCard") : t("pass.clear.pointsCard")}</p>
            <p className="truncate text-body text-muted-foreground">{line ?? rewardName ?? unitCaption(locale, m.balance, m.terminology)}</p>
          </div>
          {badge ? <span className="inline-flex h-5 shrink-0 items-center rounded-r2 bg-muted px-2 text-[12px] font-medium leading-4 tabular-nums text-foreground">{badge}</span> : null}
        </div>
        {stampGoal > 0 ? (
          <div
            role="img"
            aria-label={`${t("sh.rc.progress", { have: shown, need: stampGoal, unit })}. ${ready || shown >= stampGoal ? t("ui.stampReady", { reward: rewardName ?? t("ui.reward").toLowerCase() }) : t("ui.stampMore", { n: toGo, reward: locale === "en" ? withArticle(rewardName ?? t("ui.reward").toLowerCase()) : (rewardName ?? t("ui.reward").toLowerCase()) })}.`}
            className={cn(styles.stamps, "pb-4")}
            style={{ "--cols": cols, "--size": `${size}px` } as React.CSSProperties}
          >
            {Array.from({ length: stampGoal }, (_, i) => (
              <span key={i} aria-hidden className={cn(styles.stamp, i < shown ? styles.stampOn : i === shown && !ready ? styles.stampNext : null)}>
                {i < shown ? <Glyph className="size-5" strokeWidth={1.8} /> : null}
              </span>
            ))}
          </div>
        ) : goal > 0 ? (
          <div className="pb-4">
            <div role="progressbar" aria-label={t("pass.hero.next")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-trade" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}
        <dl className="rule-top grid grid-cols-[auto_1fr_auto] gap-4 pt-4">
          <div>
            <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted-foreground">{unit}</dt>
            <dd dir="ltr" className="text-start text-[24px] font-semibold leading-8 tracking-[-0.02em] tabular-nums [unicode-bidi:isolate] rtl:text-end">
              {/* Stamps read "8 / 10"; a points balance is the number alone (the bar above shows the way to the reward). */}
              {formatNumber(stamps ? shown : m.balance)}
              {stamps && goal > 0 ? ` / ${formatNumber(goal)}` : null}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="truncate text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted-foreground">{t("pass.hero.next")}</dt>
            <dd className="truncate text-[15px] font-medium leading-8">{rewardName ?? "–"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted-foreground">{t("pass.clear.memberSince")}</dt>
            <dd className="text-[15px] font-medium leading-8 tabular-nums">{date(m.joinedAt, { month: "short", year: "numeric" })}</dd>
          </div>
        </dl>
      </div>
    </section>
    {/* Outside the section, so the brand field keeps its place (8 under the stamps) whether or not there is a footer. */}
    {footer ? <p className="px-4 text-meta text-muted-foreground">{footer}</p> : null}
    </>
  );
}

function WarmPassHero({ m, line, footer }: { m: customerApi.MembershipDto; line: string | null; footer?: React.ReactNode }) {
  const { t, locale } = useLocaleOrEnglish();
  const next = m.nextReward;
  const ready = m.rewardsAvailableCount > 0;
  const stampGoal = m.program?.earnType === "stamps" ? Math.min(12, m.program.stampGoal) : 0;
  const goal = next?.pointsCost ?? (ready ? Math.max(1, m.balance) : 0);
  const shown = goal > 0 ? Math.min(m.balance, goal) : m.balance;
  const unit = unitCaption(locale, m.balance, m.terminology);
  // A long total ("1,190 / 1,190") steps down so it never runs under the illustration.
  const digits = `${formatNumber(shown)}${goal > 0 ? ` / ${formatNumber(goal)}` : ""}`.length;
  const numeral = digits > 12 ? "text-[28px]" : digits > 9 ? "text-[40px]" : digits > 7 ? "text-[46px]" : "text-[54px]";
  const pct = goal > 0 ? Math.round((shown / goal) * 100) : 0;
  return (
    <section
      aria-label={m.merchant.name}
      data-trade={m.merchant.vertical}
      className="overflow-hidden rounded-sheet bg-[linear-gradient(100deg,var(--trade-pass-from)_60%,var(--trade-pass-to)_100%)] text-trade-pass-text shadow-card">
      <AwningStripe />
      <div className="flex flex-col gap-5 p-5 pt-4">
        <div className="flex items-center gap-3">
          <PassLogo shop={m.merchant} />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline font-semibold leading-tight"><bdi>{m.merchant.name}</bdi></h2>
            <p className="mt-0.5 truncate text-meta text-current/90">{placeKindLabel(locale, m.merchant.vertical)}</p>
          </div>
          {ready ? (
            <span className="shrink-0 rounded-full bg-tile-butter px-3 py-1.5 text-meta-strong font-bold text-tile-butter-foreground">
              {m.rewardsAvailableCount > 1 ? t("sh.wallet.rewardsReadyN", { n: m.rewardsAvailableCount }) : t("sh.wallet.rewardReady")}
            </span>
          ) : null}
        </div>
        {stampGoal > 0 ? (
          <StampCard bare frame="plain" tone="onTrade" stamps={m.balance} goal={stampGoal} vertical={m.merchant.vertical} terminology={m.terminology} rewardName={next ? rewardNameIn(locale, t, next.name) : undefined} />
        ) : goal > 0 ? (
          <div
            role="progressbar"
            aria-label={t("pass.hero.next")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2.5 w-full overflow-hidden rounded-full bg-current/25"
          >
            <div className="h-full rounded-full bg-current" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-display ${numeral} font-bold leading-none tracking-tight tabular-nums`}>
              {formatNumber(shown)}
              {goal > 0 ? <span className="mx-1.5 font-normal opacity-90">/</span> : null}
              {goal > 0 ? formatNumber(goal) : null}
            </p>
            <p className="mt-2 text-body text-current/95">{line ?? unit}</p>
            {next && !line ? <p className="mt-1 text-meta text-current/90">{rewardNameIn(locale, t, next.name)}</p> : null}
          </div>
          <CategoryIcon vertical={m.merchant.vertical} size={64} className="mb-1 shrink-0 drop-shadow-md max-[340px]:hidden" />
        </div>
      </div>
      {footer ? <div className="border-t border-current/25 px-5 py-3 text-meta text-current/95">{footer}</div> : null}
    </section>
  );
}
