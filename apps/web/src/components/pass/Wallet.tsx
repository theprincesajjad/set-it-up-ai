"use client";
/**
 * Web pass (`/me`): my card, my shops, rewards with redeem → code, activity and
 * settings (mute, consent, data export, delete). customer-web-pass.md §5.
 */
import { placeKindLabel } from "@ll/shared";
import { InboxList, NotificationSettings } from "./NotificationSettings";
import { InviteSheet } from "./InviteSheet";
import { MemberCardBlock } from "./MemberCardBlock";
import { LanguageChip, PassPanel } from "./PassChrome";
import { NearbyOnStreet } from "./NearbyOnStreet";
import { PassActions } from "./PassActions";
import { heroMembership, ShopPassHero } from "./ShopPassHero";
import { Activity, ChevronRight, Download, Gift, LogOut, Search, Settings, Store, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { PassTabBar } from "./PassTabBar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type campaignsApi, type customerApi, type MessageKey, type networkApi } from "@ll/shared";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { unitCaption, unitsText } from "@/lib/units";
import { copy } from "@/copy/en-CA"; // l10n-ok: only the recorded consent sentence (stored with the opt-in) comes from here
import { browserApi, sessionApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/client";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { formatDate, rewardInSentence } from "@/lib/format";
import { hideQuickUndos, walletHeadline } from "@/lib/walletSummary";
import { formatE164 } from "@/lib/phone";
import { StatusDot } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/Card";
import { DiscountCard } from "@/components/ui/DiscountCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PointsRing } from "@/components/ui/PointsRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { RewardCard } from "@/components/ui/RewardCard";
import { ShopLogo } from "@/components/ui/ShopTile";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { StampCard } from "@/components/ui/StampCard";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";

type Tab = "card" | "shops" | "rewards" | "activity" | "settings";
const TABS: readonly Tab[] = ["card", "shops", "rewards", "activity", "settings"];

export interface WalletProps {
  profile: customerApi.ProfileDto;
  wallet: customerApi.WalletResponse;
  card: customerApi.CardResponse | null;
  /** The shopper's campaigns (street passports): the live one shows under "on your street". */
  campaigns?: campaignsApi.MyCampaign[];
  /** End dates written on the server in the shopper's language, by campaign id (client Intl data differs and would not hydrate). */
  endsLabels?: Record<string, string>;
  /** Server-rendered blocks the page adds around the wallet: the next booking above the card, shortcuts (tiffin, pantry, pets, cars) below it. */
  nextVisit?: React.ReactNode;
  extras?: React.ReactNode;
  /** Shops on the member's street they haven't joined (promo first, nearest first): the "Nearby on your street" card. */
  nearby?: networkApi.ShopListItemDto[];
}

type Details = Record<string, customerApi.MembershipDetailResponse>;

const TX_KEYS = ["earn", "redeem", "adjust", "welcome_bonus", "birthday_bonus", "referral_bonus", "promo_bonus", "network_bonus", "campaign_bonus", "reversal", "expire", "import"] as const;

export function Wallet({ profile, wallet: initialWallet, card, campaigns = [], endsLabels = {}, nextVisit, extras, nearby = [] }: WalletProps) {
  const { t, locale } = useLocaleOrEnglish();
  const [tab, setTab] = useState<Tab>("card");
  const [wallet, setWallet] = useState(initialWallet);
  const [details, setDetails] = useState<Details>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [openShop, setOpenShop] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const h = window.location.hash.replace("#", "") as Tab;
    // Sync from the URL hash once on mount (deep links like /me#settings); the server can't see the hash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (TABS.includes(h)) setTab(h);
  }, []);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "") as Tab;
      if (TABS.includes(h)) setTab(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
  };

  const loadDetails = useCallback(async (ids?: string[]) => {
    const list = ids ?? wallet.items.map((m) => m.id);
    setLoadingDetails(true);
    try {
      const res = await Promise.all(list.map((id) => browserApi.me.membership(id, { historyLimit: 30 }).then((d) => [id, d] as const)));
      setDetails((prev) => ({ ...prev, ...Object.fromEntries(res) }));
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setLoadingDetails(false);
    }
  }, [wallet.items, toast]);

  const hero = useMemo(() => heroMembership(wallet.items), [wallet.items]);
  const firstName = profile.name?.trim().split(/\s+/)[0] ?? "";

  useEffect(() => {
    // Lazy-load per-shop details the first time a tab needs them: every shop for Rewards and Activity, the featured shop for the card.
    const wanted = tab === "rewards" || tab === "activity" ? wallet.items : tab === "card" && hero ? [hero] : [];
    const missing = wanted.filter((m) => !details[m.id]).map((m) => m.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (missing.length) void loadDetails(missing);
  }, [tab, wallet.items, hero, details, loadDetails]);

  const refreshWallet = useCallback(async () => {
    try {
      setWallet(await browserApi.me.memberships());
    } catch {
      /* keep stale */
    }
  }, []);

  // Never sum points and stamps across shops: the card features one shop; the footer only counts rewards ready.
  const headline = useMemo(() => walletHeadline(wallet.items), [wallet.items]);

  const updateMembership = (m: customerApi.MembershipDto) => setWallet((w) => ({ ...w, items: w.items.map((x) => (x.id === m.id ? { ...x, ...m } : x)) }));

  return (
    <div data-trade={hero?.merchant.vertical} className="flex flex-col gap-4 pb-32">
      <header className="flex min-h-11 items-center gap-2">
        <h1 id="total" className="min-w-0 flex-1 font-display text-[clamp(28px,8.5vw,34px)] font-bold leading-[1.15] tracking-[-0.03em] text-foreground">
          {tab === "card" && firstName ? (
            <>
              {t("pass.hi")} <span className="text-trade-deep">{firstName}</span>
            </>
          ) : (
            t("sh.wallet.title")
          )}
        </h1>
        <div className="flex shrink-0 items-center gap-1">
        <Link href="/map" aria-label={t("sh.wallet.search")} className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-hover focus-visible:focus-ring">
          <Search aria-hidden className="size-5" strokeWidth={1.75} />
        </Link>
        <button
          type="button"
          aria-label={t("sh.tab.settings")}
          aria-current={tab === "settings" ? "page" : undefined}
          onClick={() => selectTab("settings")}
          className={cn("flex size-11 items-center justify-center rounded-full text-foreground hover:bg-hover focus-visible:focus-ring", tab === "settings" && "bg-hover")}
        >
          <Settings aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
        <LanguageChip className="ms-1" />
        </div>
      </header>

      {tab === "card" ? (
        <CardTab
          hero={hero}
          wallet={wallet}
          details={details}
          loading={loadingDetails}
          card={card}
          profile={profile}
          nextVisit={nextVisit}
          extras={extras}
          nearby={nearby}
          footer={headline.kind === "ready" && wallet.items.length > 1 ? `${headline.value} ${locale === "en" ? headline.label : t("sh.wallet.heroReady", { n: headline.value })} · ${locale === "en" ? headline.context : t("sh.wallet.heroAcross", { n: wallet.items.length })}` : null}
          onChanged={async () => { await refreshWallet(); if (hero) await loadDetails([hero.id]); }}
        />
      ) : null}
      {tab === "shops" ? (
        <ShopsTab wallet={wallet} details={details} openShop={openShop} setOpenShop={setOpenShop} loadDetails={loadDetails} onChanged={refreshWallet} profile={profile} campaigns={campaigns} endsLabels={endsLabels} />
      ) : null}
      {tab === "rewards" ? <RewardsTab wallet={wallet} details={details} loading={loadingDetails} onShowShops={() => selectTab("shops")} onChanged={async () => { await refreshWallet(); await loadDetails(); }} /> : null}
      {tab === "activity" ? <ActivityTab wallet={wallet} details={details} loading={loadingDetails} /> : null}
      {tab === "settings" ? <SettingsTab wallet={wallet} profile={profile} onMembership={updateMembership} /> : null}
      <PassTabBar active={tab === "settings" ? null : tab} onSelect={selectTab} />
    </div>
  );
}

/** The pass itself (frame 15:184): the featured shop with its ring, my QR and wallet buttons, that shop's rewards and recent visits. */
function CardTab({ hero, wallet, details, loading, card, profile, nextVisit, extras, nearby, footer, onChanged }: { nearby: networkApi.ShopListItemDto[]; hero: customerApi.MembershipDto | null; wallet: customerApi.WalletResponse; details: Details; loading: boolean; card: customerApi.CardResponse | null; profile: customerApi.ProfileDto; nextVisit?: React.ReactNode; extras?: React.ReactNode; footer: string | null; onChanged: () => Promise<void> }) {
  const { t, locale, date } = useLocaleOrEnglish();
  const d = hero ? details[hero.id] : undefined;
  const visits = useMemo(() => (hero && d ? hideQuickUndos(d.history.items.map((tx) => ({ tx, m: hero }))).slice(0, 3) : []), [hero, d]);
  return (
    <>
      {nextVisit}
      {hero ? <ShopPassHero m={hero} line={progressLine(hero, t, locale)} footer={footer} /> : null}
      {hero ? <PassActions card={card} profile={profile} /> : null}
      <NearbyOnStreet shops={nearby} />
      {!hero ? (
        <EmptyState icon={Store} title={t("sh.wallet.emptyTitle")} description={t("cp.empty.walletBody")} action={<Button variant="secondary" href="/map">{t("sh.wallet.empty")}</Button>} />
      ) : !d ? (
        loading || wallet.items.length ? <SkeletonCard /> : null
      ) : (
        <>
          <MemberRewards membership={hero} detail={d} onChanged={onChanged} />
          {visits.length ? (
            <PassPanel title={t("pass.visits.title")}>
              {visits.map(({ tx }) => (
                <li key={tx.id} className="flex min-h-14 items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-foreground">{txLabelFor(t, locale, tx.type, tx.description)}</p>
                    <p className="truncate text-meta text-muted-foreground">{date(tx.createdAt, { month: "short", day: "numeric" })}{tx.reversed ? ` · ${t("sh.wallet.reversed")}` : ""}</p>
                  </div>
                  <span className={cn("shrink-0 text-body-strong tabular-nums", tx.points >= 0 ? "text-points-text" : "text-muted-foreground")}>
                    {tx.points >= 0 ? "+" : "−"}
                    {unitsText(locale, Math.abs(tx.points), hero.terminology)}
                  </span>
                </li>
              ))}
            </PassPanel>
          ) : null}
        </>
      )}
      <MemberCardBlock card={card} profile={profile} />
      {extras}
    </>
  );
}

const txLabelFor = (t: Tr, locale: string, type: string, description: string | null | undefined) => {
  const translated = (TX_KEYS as readonly string[]).includes(type) ? t(`sh.tx.${type}` as MessageKey) : type;
  // English keeps the shop's own description ("Purchase $12.50"); other languages show the translated kind.
  return locale === "en" ? description || translated : translated;
};

type Tr = (key: MessageKey, vars?: Record<string, string | number | null | undefined>) => string;

/** The grey line under a shop name: what's left to the next reward, else the expiry rule. English keeps the shop's own wording. */
function progressLine(m: customerApi.MembershipDto, t: Tr, locale: string) {
  if (locale === "en") return m.nextReward ? t("ui.stampMore", { n: m.nextReward.pointsNeeded, reward: rewardInSentence(m.nextReward.name) }) : m.expiryDisclosure;
  if (m.nextReward) return t("sh.n.earnNext", { need: unitsText(locale as never, m.nextReward.pointsNeeded, m.terminology, false), reward: m.nextReward.name }).replace(/[.।۔]$/, "");
  const unit = unitCaption(locale as never, 2, m.terminology);
  const months = m.program?.expiryMonths;
  return months ? t("sh.pass.expireAfter", { unit, months }) : t("sh.pass.neverExpire", { unit });
}

function ShopsTab({ wallet, details, openShop, setOpenShop, loadDetails, onChanged, profile, campaigns, endsLabels }: { wallet: customerApi.WalletResponse; details: Details; openShop: string | null; setOpenShop: (id: string | null) => void; loadDetails: (ids?: string[]) => Promise<void>; onChanged: () => Promise<void>; profile: customerApi.ProfileDto; campaigns: campaignsApi.MyCampaign[]; endsLabels: Record<string, string> }) {
  const { t, locale } = useLocaleOrEnglish();
  if (!wallet.items.length)
    return <EmptyState icon={Store} title={t("sh.wallet.emptyTitle")} description={t("cp.empty.walletBody")} action={<Button href="/map">{t("sh.wallet.empty")}</Button>} />;
  // Rewards ready float to the top under their own header (foundations.md "Wallet").
  const ready = wallet.items.filter((m) => m.rewardsAvailableCount > 0);
  const rest = wallet.items.filter((m) => m.rewardsAvailableCount === 0);
  const current = wallet.items.find((m) => m.id === openShop) ?? null;
  const live = campaigns.find((c) => c.status === "live") ?? null;
  // canvas Wallet rows: 44 px avatar, name 16/500, one line (accent when ready), a thin bar while earning,
  // the balance right-aligned (accent when a reward is ready, black otherwise).
  const row = (m: customerApi.MembershipDto) => {
    const ready = m.rewardsAvailableCount > 0;
    const pct = m.nextReward && m.nextReward.pointsCost > 0 ? Math.max(0, Math.min(100, ((m.nextReward.pointsCost - m.nextReward.pointsNeeded) / m.nextReward.pointsCost) * 100)) : null;
    const unit = unitCaption(locale, m.balance, m.terminology);
    return (
      <li key={m.id} className="-mx-4">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            setOpenShop(m.id);
            if (!details[m.id]) void loadDetails([m.id]);
          }}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors hover:bg-hover focus-visible:focus-ring"
        >
          <ShopLogo shop={{ name: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl, brandColor: m.merchant.brandColor }} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-strong text-foreground"><bdi>{m.merchant.name}</bdi></span>
            <span className={cn("mt-0.5 block truncate text-meta", ready ? "text-points-text" : "text-muted-foreground")}>{ready ? (m.rewardsAvailableCount > 1 ? t("sh.wallet.rewardsReadyN", { n: m.rewardsAvailableCount }) : t("sh.wallet.rewardReady")) : progressLine(m, t, locale)}</span>
            {!ready && pct != null ? (
              <span aria-hidden className="mt-2 block h-0.75 w-36 overflow-hidden rounded-full bg-muted">
                <span className="block h-0.75 rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
            ) : null}
          </span>
          <span className="ms-auto shrink-0 text-end">
            <b className={cn("display block text-title tabular-nums", ready ? "text-points-text" : "text-foreground")}>{m.balance.toLocaleString("en-CA")}</b>
            <span className="text-caption text-muted-foreground">{unit}</span>
          </span>
        </button>
      </li>
    );
  };
  const section = (title: string, items: customerApi.MembershipDto[]) => <PassPanel title={title}>{items.map((m) => row(m))}</PassPanel>;
  return (
    <div className="flex flex-col gap-4">
      {ready.length ? section(t("sh.wallet.readyNow"), ready) : null}
      {rest.length ? section(ready.length ? t("sh.wallet.earning") : t("sh.wallet.yourShops"), rest) : null}
      {live ? <StreetBlock campaign={live} t={t} ends={endsLabels[live.id] ?? ""} /> : null}
      <Link href="/discover" className="inline-flex min-h-11 items-center gap-1 self-start text-meta-strong text-muted-foreground hover:text-foreground focus-visible:focus-ring">
        {t("sh.wallet.empty")}
        <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
      </Link>
      <Modal open={!!current} onClose={() => setOpenShop(null)} title={current?.merchant.name ?? t("wp.t.shop")} variant="sheet" icon={current ? <ShopLogo shop={current.merchant} size={40} /> : undefined} description={current ? <span className="italic">{placeKindLabel(locale, current.merchant.vertical)}</span> : undefined}>
        {current ? <ShopSheetBody m={current} d={details[current.id]} profile={profile} onChanged={async () => { await onChanged(); await loadDetails([current.id]); }} /> : null}
      </Modal>
    </div>
  );
}

/**
 * "on your street": the live neighbourhood passport, the thing one shared card can show that seven shop cards cannot.
 * Progress dots, the deadline, and a link to the campaign page. Hidden when no campaign is live.
 */
function StreetBlock({ campaign, t, ends }: { campaign: campaignsApi.MyCampaign; t: Tr; ends: string }) {
  const { visited, goal } = campaign.progress;
  // Progress dots only mean something for a passport (visit N shops); a points weekend just states its bonus and end date.
  const passport = campaign.kind === "passport";
  const dots = passport ? Math.min(goal, 12) : 0;
  const line = passport
    ? t("sh.wallet.passportLine", { visited: Math.min(visited, goal), goal, date: ends })
    : `${campaign.bonusPoints > 0 ? t("sh.camp.stepBonus", { n: campaign.bonusPoints }) : campaign.multiplierPct ? t("sh.camp.stepMult", { n: campaign.multiplierPct / 100 }) : ""} ${t("sh.disc.endsOn", { date: ends })}`.trim();
  return (
    <PassPanel title={t("sh.wallet.street")} id="street">
      <li className="-mx-4">
        <Link href={`/c/${campaign.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-hover focus-visible:focus-ring">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-points-soft text-caption font-bold tabular-nums text-points-text">
            {passport ? `${Math.min(visited, goal)}/${goal}` : "+"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-strong text-foreground">{campaign.name}</span>
            <span className="mt-0.5 line-clamp-2 block text-meta text-muted-foreground">{line}</span>
            <span aria-hidden className={cn("mt-2 flex gap-1.5", !dots && "hidden")}>
              {Array.from({ length: dots }, (_, i) => (
                <span key={i} className={cn("size-2.5 rounded-full", i < visited ? "bg-points" : "bg-muted")} />
              ))}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-4 text-muted-foreground rtl:rotate-180" />
        </Link>
      </li>
    </PassPanel>
  );
}

/** Shop sheet: italic vertical line, a stamp row or points ring, rewards, discount cards, then the shop page. */
function ShopSheetBody({ m, d, profile, onChanged }: { m: customerApi.MembershipDto; d: customerApi.MembershipDetailResponse | undefined; profile: customerApi.ProfileDto; onChanged: () => Promise<void> }) {
  const { t, locale } = useLocaleOrEnglish();
  const [inviting, setInviting] = useState(false);
  // Referrals are a paid shop feature: the API reports the bonus as 0 when the shop doesn't have them.
  const canInvite = (m.program?.referralBonus ?? 0) > 0 && (m as { features?: { referrals?: boolean } }).features?.referrals !== false;
  return (
    <div className="flex flex-col gap-5">
      {m.program?.earnType === "stamps" ? (
        <StampCard stamps={m.balance} goal={m.program.stampGoal} rewardName={m.nextReward?.name ?? "reward"} vertical={m.merchant.vertical} terminology={m.terminology} />
      ) : (
        <div className="flex items-center gap-4 rounded-card border border-line p-4">
          <PointsRing balance={m.balance} goal={m.nextReward?.pointsCost ?? 0} terminology={m.terminology} size={64} showCaption={false} />
          <div className="min-w-0 flex-1">
            <p className="display text-title tabular-nums text-points-text">{unitsText(locale, m.balance, m.terminology, false)}</p>
            <p className="text-meta text-fg-muted">{progressLine(m, t, locale)}</p>
          </div>
        </div>
      )}
      {!d ? (
        <SkeletonCard />
      ) : (
        <>
          <MemberRewards membership={m} detail={d} onChanged={onChanged} />
          {d.discountCards.map((c) => (
            <DiscountCard key={c.id} card={c} shop={m.merchant} memberName={profile.name} />
          ))}
        </>
      )}
      <p className="text-meta text-fg-muted">{locale === "en" ? m.expiryDisclosure : progressLine({ ...m, nextReward: null }, t, locale)}</p>
      {canInvite ? (
        <Button variant="secondary" size="lg" fullWidth iconStart={UserPlus} onClick={() => setInviting(true)}>
          {t("sh.inv.title")}
        </Button>
      ) : null}
      <Button variant="secondary" size="lg" fullWidth href={`/shops/${m.merchant.slug}`} iconEnd={ChevronRight}>
        {t("sh.wallet.shopPage")}
      </Button>
      {canInvite ? <InviteSheet open={inviting} onClose={() => setInviting(false)} membership={m} /> : null}
    </div>
  );
}

/** Rewards for one shop with redeem → code sheet. */
function MemberRewards({ membership, detail, onChanged }: { membership: customerApi.MembershipDto; detail: customerApi.MembershipDetailResponse; onChanged: () => Promise<void> }) {
  const [active, setActive] = useState<{ redemption: customerApi.RedemptionDto; used: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const { t } = useLocaleOrEnglish();

  // While a code is showing, poll until staff confirm it at the counter.
  useEffect(() => {
    if (!active || active.used) return;
    const t = setInterval(async () => {
      try {
        const d = await browserApi.me.membership(membership.id, { historyLimit: 1 });
        if (!d.openRedemptions.some((r) => r.id === active.redemption.id)) setActive((a) => (a ? { ...a, used: true } : a));
      } catch {
        /* offline: keep showing the code */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [active, membership.id]);

  async function redeem(rewardId: string) {
    setBusy(rewardId);
    setError(null);
    try {
      const r = await browserApi.me.redeem(membership.id, rewardId, newIdempotencyKey("redeem"));
      setActive({ redemption: r.redemption, used: false });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!active) return;
    try {
      await browserApi.me.cancelRedemption(active.redemption.id);
      toast({ message: t("sh.wallet.cancelled"), tone: "success" });
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
    setActive(null);
    await onChanged();
  }

  const open = detail.openRedemptions;
  if (!open.length && !detail.rewards.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <PassPanel title={t("sh.wallet.rewards")}>
        {open.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-3.5">
            <div className="min-w-0">
              <p className="text-body-strong text-foreground">{r.rewardName}</p>
              <p className="text-meta font-semibold text-points-text">{t("sh.wallet.codeReady")}</p>
            </div>
            <Button size="sm" onClick={() => setActive({ redemption: r, used: false })}>
              {t("sh.wallet.showCode")}
            </Button>
          </li>
        ))}
        {detail.rewards.map((r) => (
          <li key={r.id}>
            <RewardCard
              layout="row"
              reward={r}
              balance={membership.balance}
              terminology={membership.terminology}
              state={busy === r.id ? "redeeming" : r.affordable ? "available" : "locked"}
              onRedeem={() => void redeem(r.id)}
            >
              <Skeleton className="h-10 w-full" />
            </RewardCard>
          </li>
        ))}
      </PassPanel>
      <Modal
        open={!!active}
        onClose={async () => {
          const wasUsed = active?.used;
          setActive(null);
          if (wasUsed) await onChanged();
        }}
        title={active?.used ? t("sh.wallet.redeemed") : t("sh.wallet.showCode")}
        variant="sheet"
      >
        {active ? (
          <div className="flex flex-col items-center gap-4 pt-1">
            <div className="flex items-center gap-2.5">
              <ShopLogo shop={membership.merchant} size={32} />
              <p className="text-body-strong text-fg"><bdi>{membership.merchant.name}</bdi></p>
            </div>
            <p className="display text-large-title text-fg">{active.redemption.rewardName}</p>
            <RedeemCode code={active.redemption.code} rewardName={t("sh.wallet.yourCode")} expiresAt={active.redemption.expiresAt} onExpired={() => void onChanged()} status={active.used ? "used" : "issued"} onCancel={active.used ? undefined : cancel} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RewardsTab({ wallet, details, loading, onChanged, onShowShops }: { wallet: customerApi.WalletResponse; details: Details; loading: boolean; onChanged: () => Promise<void>; onShowShops: () => void }) {
  const { t, locale } = useLocaleOrEnglish();
  const ready = wallet.items.filter((m) => m.rewardsAvailableCount > 0 || (details[m.id]?.openRedemptions.length ?? 0) > 0);
  if (loading && !Object.keys(details).length) return <div className="flex flex-col gap-3"><SkeletonCard /><SkeletonCard /></div>;
  if (!ready.length) {
    const close = [...wallet.items].filter((m) => m.nextReward).sort((a, b) => b.nextReward!.progressPct - a.nextReward!.progressPct).slice(0, 5);
    if (!close.length)
      return <EmptyState icon={Gift} title={t("sh.rewards.emptyTitle")} description={t("sh.rewards.emptyBody")} action={<Button variant="secondary" onClick={onShowShops}>{t("sh.rewards.seeShops")}</Button>} />;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-fg-muted">{t("sh.rewards.emptyBody")}</p>
        <ListGroup title={t("sh.wallet.closest")}>
          {close.map((m) => (
            <li key={m.id} className="flex flex-col gap-2.5 py-3.5">
              <div className="flex items-center gap-3">
                <ShopLogo shop={m.merchant} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-strong text-fg">{m.nextReward!.name}</p>
                  <p className="truncate text-meta text-fg-muted"><bdi>{m.merchant.name}</bdi></p>
                </div>
                <span className="shrink-0 text-meta tabular-nums text-fg-muted">{t("sh.wallet.toGo", { amount: unitsText(locale, m.nextReward!.pointsNeeded, m.terminology) })}</span>
              </div>
              <ProgressBar value={m.nextReward!.progressPct} max={100} showValue={false} valueText={t("wp.w.wayTo", { pct: m.nextReward!.progressPct, reward: m.nextReward!.name })} />
            </li>
          ))}
        </ListGroup>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {ready.map((m) => (
        <section key={m.id} aria-label={m.merchant.name} className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 px-1">
            <ShopLogo shop={m.merchant} size={24} />
            <h2 className="min-w-0 flex-1 truncate text-body-strong text-fg"><bdi>{m.merchant.name}</bdi></h2>
            <span className="text-meta tabular-nums text-fg-muted">{unitsText(locale, m.balance, m.terminology)}</span>
          </div>
          {details[m.id] ? <MemberRewards membership={m} detail={details[m.id]!} onChanged={onChanged} /> : <SkeletonCard />}
        </section>
      ))}
    </div>
  );
}

/**
 * Activity: the inbox first (what we held back from a push, with the day's budget said out loud), then the points history
 * below it. The avatar in the tab bar and the bell on Discover both land here.
 */
function ActivityTab({ wallet, details, loading }: { wallet: customerApi.WalletResponse; details: Details; loading: boolean }) {
  const { t, locale, date, time } = useLocaleOrEnglish();
  const rows = useMemo(
    () =>
      hideQuickUndos(
        wallet.items
          .flatMap((m) => (details[m.id]?.history.items ?? []).map((tx) => ({ tx, m })))
          .sort((x, y) => y.tx.createdAt.localeCompare(x.tx.createdAt)),
      ).slice(0, 100),
    [wallet.items, details],
  );
  const txLabel = (type: string, description: string | null | undefined) => txLabelFor(t, locale, type, description);
  let history: React.ReactNode;
  if (loading && !rows.length) history = <div className="flex flex-col gap-3"><SkeletonCard /><SkeletonCard /></div>;
  else if (!rows.length) {
    history = <EmptyState icon={Activity} title={t("sh.activity.emptyTitle")} description={t("sh.activity.emptyBody")} action={<Button href="/map">{t("sh.wallet.empty")}</Button>} />;
  } else
    history = (
      <PassPanel title={t("sh.activity.history")}>
        {rows.map(({ tx, m }) => (
          <li key={tx.id} className="flex min-h-16 items-center gap-3 py-2.5">
            <ShopLogo shop={m.merchant} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-strong text-fg">{txLabel(tx.type, tx.description)}</p>
              <p className="truncate text-meta text-fg-muted">
                {m.merchant.name} · {date(tx.createdAt, { weekday: "short", month: "short", day: "numeric" })}, {time(tx.createdAt)}
                {tx.reversed ? ` · ${t("sh.wallet.reversed")}` : ""}
              </p>
            </div>
            <span className={tx.points >= 0 ? "shrink-0 text-body-strong tabular-nums text-fg" : "shrink-0 text-body-strong tabular-nums text-fg-muted"}>
              {tx.points >= 0 ? "+" : "−"}
              {unitsText(locale, Math.abs(tx.points), m.terminology)}
            </span>
          </li>
        ))}
      </PassPanel>
    );
  return (
    <div className="flex flex-col gap-4">
      <InboxList />
      {history}
    </div>
  );
}

function SettingsTab({ wallet, profile, onMembership }: { wallet: customerApi.WalletResponse; profile: customerApi.ProfileDto; onMembership: (m: customerApi.MembershipDto) => void }) {
  const { t, locale, date } = useLocaleOrEnglish();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(profile.name ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await browserApi.me.updateProfile({ name: name.trim() || null, email: email.trim() || null });
      toast({ message: t("cp.ok.saved"), tone: "success" });
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function setMuted(m: customerApi.MembershipDto, muted: boolean) {
    try {
      onMembership(await browserApi.me.setMuted(m.id, muted));
      if (muted) toast(t("cp.ok.muted", { shop: m.merchant.name, terminology: unitCaption(locale, 2, m.terminology) }));
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
  }

  async function setConsent(m: customerApi.MembershipDto, on: boolean) {
    try {
      onMembership(on ? await browserApi.me.grantConsent(m.id, copy.consent.merchant(m.merchant.name)) : await browserApi.me.withdrawConsent(m.id));
      toast(on ? t("cp.ok.consentOn", { shop: m.merchant.name }) : t("cp.consent.withdrawn", { shop: m.merchant.name, terminology: unitCaption(locale, 2, m.terminology) }));
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
  }

  async function exportData() {
    try {
      const data = await browserApi.me.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
  }

  async function signOut() {
    await sessionApi.logout().catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await browserApi.me.deleteAccount();
      await sessionApi.logout().catch(() => undefined);
      router.push("/");
      router.refresh();
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
      setDeleting(false);
    }
  }

  return (
    <div id="settings" className="flex flex-col gap-7">
      <NotificationSettings />
      <ListGroup title={t("sh.priv.shopsTitle")} footer={t("sh.priv.shopsFoot")}>
        {wallet.items.map((m) => (
          <li key={m.id} className="flex flex-col py-3">
            <p className="flex items-center gap-2.5 py-1 text-body-strong text-fg">
              <ShopLogo shop={m.merchant} size={24} />
              <span className="min-w-0 flex-1 truncate"><bdi>{m.merchant.name}</bdi></span>
              {m.marketingConsent.granted ? <StatusDot tone="positive" className="text-meta font-normal text-fg-muted">{t("sh.priv.offersOn")}</StatusDot> : null}
            </p>
            <Switch label={t("sh.priv.offersBy")} ariaLabel={t("sh.priv.offersFrom", { shop: m.merchant.name })} description={m.marketingConsent.granted && m.marketingConsent.grantedAt ? t("sh.priv.since", { date: locale === "en" ? formatDate(m.marketingConsent.grantedAt) : date(m.marketingConsent.grantedAt, { month: "short", day: "numeric" }) }) : t("sh.priv.byHint")} checked={m.marketingConsent.granted} onChange={(v) => void setConsent(m, v)} />
            <Switch label={t("sh.priv.mute")} ariaLabel={t("sh.priv.muteShop", { shop: m.merchant.name })} checked={m.muted} onChange={(v) => void setMuted(m, v)} />
          </li>
        ))}
      </ListGroup>

      <ListGroup title={t("sh.priv.details")} as="div" footer={<span className="tabular-nums">{t("sh.priv.phoneMember", { phone: formatE164(profile.phone), code: profile.memberCode })}</span>}>
        <div className="flex flex-col gap-4 py-4">
          <TextField label={t("sh.priv.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <TextField label={t("sh.priv.email")} type="email" optionalLabel value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Button onClick={save} loading={saving} className="self-start">
            {t("sh.priv.save")}
          </Button>
        </div>
      </ListGroup>

      <ListGroup title={t("sh.priv.data")} as="div" footer={t("sh.priv.dataFoot")}>
        <button type="button" onClick={exportData} className="-mx-4 flex min-h-12 items-center gap-3 px-4 text-start text-body text-fg hover:bg-bg-subtle focus-visible:focus-ring">
          <Download aria-hidden className="size-[18px] text-fg-muted" strokeWidth={1.75} />
          <span className="flex-1">{t("sh.priv.download")}</span>
        </button>
        <button type="button" onClick={signOut} className="-mx-4 flex min-h-12 items-center gap-3 px-4 text-start text-body text-fg hover:bg-bg-subtle focus-visible:focus-ring">
          <LogOut aria-hidden className="size-[18px] text-fg-muted" strokeWidth={1.75} />
          <span className="flex-1">{t("sh.priv.signOut")}</span>
        </button>
        <button type="button" onClick={() => setDeleteOpen(true)} className="-mx-4 flex min-h-12 items-center gap-3 px-4 text-start text-body text-negative hover:bg-bg-subtle focus-visible:focus-ring">
          <Trash2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
          <span className="flex-1">{t("sh.priv.delete")}</span>
        </button>
      </ListGroup>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("sh.priv.deleteTitle")}
        description={t("sh.priv.deleteBody")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t("sh.priv.cancel")}
            </Button>
            <Button variant="danger" loading={deleting} disabled={confirmText !== "DELETE"} onClick={deleteAccount}>
              {t("sh.priv.delete")}
            </Button>
          </>
        }
      >
        <TextField label={t("sh.priv.deleteType")} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
      </Modal>
    </div>
  );
}
