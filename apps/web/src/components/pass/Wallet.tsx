"use client";
/**
 * Web pass (`/me`): my card, my shops, rewards with redeem → code, activity and
 * settings (mute, consent, data export, delete). customer-web-pass.md §5.
 */
import { Activity, ChevronRight, Download, Gift, LogOut, QrCode, Store, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { customerApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/client";
import { formatDate, formatPoints, formatTime } from "@/lib/format";
import { walletHeadline } from "@/lib/walletSummary";
import { formatE164 } from "@/lib/phone";
import { StatusDot } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/Card";
import { DiscountCard } from "@/components/ui/DiscountCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { MemberQr } from "@/components/ui/MemberQr";
import { Modal } from "@/components/ui/Modal";
import { PointsRing } from "@/components/ui/PointsRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { RewardCard } from "@/components/ui/RewardCard";
import { ShopLogo, ShopTile } from "@/components/ui/ShopTile";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { platform } from "./JoinFlow";
import { StampCard } from "@/components/ui/StampCard";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";

type Tab = "shops" | "rewards" | "activity" | "settings";

export interface WalletProps {
  profile: customerApi.ProfileDto;
  wallet: customerApi.WalletResponse;
  card: customerApi.CardResponse | null;
}

type Details = Record<string, customerApi.MembershipDetailResponse>;

const TX_LABELS: Record<string, string> = {
  earn: "Earned",
  redeem: "Redeemed",
  adjust: "Adjusted",
  welcome_bonus: "Welcome bonus",
  birthday_bonus: "Birthday bonus",
  referral_bonus: "Referral bonus",
  promo_bonus: "Promo bonus",
  network_bonus: "Neighbourhood bonus",
  campaign_bonus: "Campaign bonus",
  reversal: "Reversed",
  expire: "Expired",
  import: "Imported",
};

export function Wallet({ profile, wallet: initialWallet, card }: WalletProps) {
  const [tab, setTab] = useState<Tab>("shops");
  const [cardOpen, setCardOpen] = useState(false);
  const [wallet, setWallet] = useState(initialWallet);
  const [details, setDetails] = useState<Details>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [openShop, setOpenShop] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const h = window.location.hash.replace("#", "") as Tab;
    // Sync from the URL hash once on mount (deep links like /me#settings); the server can't see the hash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (["shops", "rewards", "activity", "settings"].includes(h)) setTab(h);
    else if ((h as string) === "card") setCardOpen(true);
  }, []);

  const selectTab = (t: string) => {
    setTab(t as Tab);
    history.replaceState(null, "", `#${t}`);
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

  useEffect(() => {
    // Lazy-load per-shop details the first time a tab needs them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ((tab === "rewards" || tab === "activity") && wallet.items.some((m) => !details[m.id])) void loadDetails(wallet.items.filter((m) => !details[m.id]).map((m) => m.id));
  }, [tab, wallet.items, details, loadDetails]);

  const refreshWallet = useCallback(async () => {
    try {
      setWallet(await browserApi.me.memberships());
    } catch {
      /* keep stale */
    }
  }, []);

  // Never sum points and stamps across shops: rewards ready, else the closest reward.
  const headline = useMemo(() => walletHeadline(wallet.items), [wallet.items]);

  const updateMembership = (m: customerApi.MembershipDto) => setWallet((w) => ({ ...w, items: w.items.map((x) => (x.id === m.id ? { ...x, ...m } : x)) }));

  const first = profile.name?.trim().split(/\s+/)[0] ?? null;
  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* Wallet hero (foundations.md "Wallet"): one honest number. Points and stamps are never summed across shops. */}
      <section aria-labelledby="total" className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h1 id="total" className="display text-large-title text-fg">
            Wallet
          </h1>
          <span className="truncate text-meta text-fg-muted">{[first, headline.context].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="flex items-end gap-3">
          <p className={headline.kind === "ready" ? "display text-[64px] leading-[0.9] tabular-nums text-accent-text" : "display text-[64px] leading-[0.9] tabular-nums text-fg"}>{headline.value.toLocaleString("en-CA")}</p>
          <p className="max-w-[220px] pb-1 text-body text-fg-muted">{headline.label}</p>
        </div>
        <Button size="lg" iconStart={QrCode} onClick={() => setCardOpen(true)} fullWidth>
          {copy.action.showCard}
        </Button>
      </section>
      <CardSheet open={cardOpen} onClose={() => setCardOpen(false)} card={card} profile={profile} />
      <Tabs
        label="Wallet"
        value={tab}
        onChange={selectTab}
        items={[
          { id: "shops", label: "Shops" },
          { id: "rewards", label: "Rewards" },
          { id: "activity", label: "Activity" },
          { id: "settings", label: "Settings" },
        ]}
      />

      {tab === "shops" ? (
        <ShopsTab wallet={wallet} details={details} openShop={openShop} setOpenShop={setOpenShop} loadDetails={loadDetails} onChanged={refreshWallet} profile={profile} />
      ) : null}
      {tab === "rewards" ? <RewardsTab wallet={wallet} details={details} loading={loadingDetails} onShowShops={() => selectTab("shops")} onChanged={async () => { await refreshWallet(); await loadDetails(); }} /> : null}
      {tab === "activity" ? <ActivityTab wallet={wallet} details={details} loading={loadingDetails} /> : null}
      {tab === "settings" ? <SettingsTab wallet={wallet} profile={profile} onMembership={updateMembership} /> : null}
    </div>
  );
}

/** My card (foundations.md "My card"): white sheet, big QR, member code in mono, one black wallet button for this phone. */
function CardSheet({ open, onClose, card, profile }: { open: boolean; onClose: () => void; card: customerApi.CardResponse | null; profile: customerApi.ProfileDto }) {
  const [walletError, setWalletError] = useState<string | null>(null);
  const [os, setOs] = useState<"ios" | "android" | "other">("other");
  useEffect(() => {
    // The UA is only known on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(platform());
  }, []);
  async function google() {
    try {
      const r = await browserApi.me.googleWallet();
      window.location.href = r.saveUrl;
    } catch {
      setWalletError("Wallet passes aren't available right now. Your card above works at the counter.");
    }
  }
  async function apple() {
    try {
      const s = await browserApi.me.wallet();
      if (s.apple.available && s.apple.downloadUrl) window.location.href = s.apple.downloadUrl;
      else setWalletError("Wallet passes aren't available right now. Your card above works at the counter.");
    } catch {
      setWalletError("Wallet passes aren't available right now. Your card above works at the counter.");
    }
  }
  const primaryGoogle = os === "android";
  return (
    <Modal open={open} onClose={onClose} title="My card" variant="sheet">
      <div className="flex flex-col items-center gap-5 pt-2">
        <p className="text-body-strong text-fg">{profile.name ?? "Member"}</p>
        {card ? <MemberQr memberCode={card.memberCode} svg={card.qrSvg} size={240} caption="Works at every shop on the network" /> : <MemberQr memberCode={profile.memberCode} caption="Show your number at the counter" />}
        {walletError ? <Banner tone="neutral" className="w-full">{walletError}</Banner> : null}
        <div className="flex w-full flex-col gap-1">
          <Button size="lg" fullWidth onClick={primaryGoogle ? google : apple}>
            {primaryGoogle ? copy.action.addToGoogleWallet : copy.action.addToAppleWallet}
          </Button>
          <Button variant="ghost" size="lg" fullWidth onClick={primaryGoogle ? apple : google}>
            {primaryGoogle ? copy.action.addToAppleWallet : copy.action.addToGoogleWallet}
          </Button>
        </div>
        <p className="-mt-2 text-center text-meta text-fg-muted">Turn your brightness up so it scans first time.</p>
      </div>
    </Modal>
  );
}

function progressLine(m: customerApi.MembershipDto) {
  return m.nextReward ? copy.misc.stampsToGo(m.nextReward.pointsNeeded, m.nextReward.name) : m.expiryDisclosure;
}

function ShopsTab({ wallet, details, openShop, setOpenShop, loadDetails, onChanged, profile }: { wallet: customerApi.WalletResponse; details: Details; openShop: string | null; setOpenShop: (id: string | null) => void; loadDetails: (ids?: string[]) => Promise<void>; onChanged: () => Promise<void>; profile: customerApi.ProfileDto }) {
  if (!wallet.items.length)
    return <EmptyState icon={Store} title={copy.empty.wallet.title} description={copy.empty.wallet.body} action={<Button href="/map">Find shops nearby</Button>} />;
  // Rewards ready float to the top under their own header (foundations.md "Wallet").
  const ready = wallet.items.filter((m) => m.rewardsAvailableCount > 0);
  const rest = wallet.items.filter((m) => m.rewardsAvailableCount === 0);
  const current = wallet.items.find((m) => m.id === openShop) ?? null;
  const row = (m: customerApi.MembershipDto) => (
    <li key={m.id}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpenShop(m.id);
          if (!details[m.id]) void loadDetails([m.id]);
        }}
        className="-mx-4 block w-[calc(100%+2rem)] px-4 text-start transition-colors hover:bg-bg-subtle active:bg-bg-muted focus-visible:focus-ring"
      >
        <ShopTile
          variant="wallet"
          shop={{ name: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl, brandColor: m.merchant.brandColor }}
          balance={{ value: m.balance, terminology: m.terminology }}
          rewardReady={m.rewardsAvailableCount > 0}
          muted={m.muted}
          subtitle={progressLine(m)}
        />
      </button>
    </li>
  );
  return (
    <div className="flex flex-col gap-6">
      {ready.length ? <ListGroup title="Rewards ready">{ready.map(row)}</ListGroup> : null}
      <ListGroup title={ready.length ? "Your shops" : undefined}>{rest.map(row)}</ListGroup>
      <Modal open={!!current} onClose={() => setOpenShop(null)} title={current?.merchant.name ?? "Shop"} variant="sheet">
        {current ? <ShopSheetBody m={current} d={details[current.id]} profile={profile} onChanged={async () => { await onChanged(); await loadDetails([current.id]); }} /> : null}
      </Modal>
    </div>
  );
}

/** Shop sheet: italic vertical line, a stamp row or points ring, rewards, discount cards, then the shop page. */
function ShopSheetBody({ m, d, profile, onChanged }: { m: customerApi.MembershipDto; d: customerApi.MembershipDetailResponse | undefined; profile: customerApi.ProfileDto; onChanged: () => Promise<void> }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="-mt-1 flex items-center gap-3">
        <ShopLogo shop={m.merchant} size={44} />
        <p className="text-meta italic text-fg-muted">{verticalLabel(m.merchant.vertical).toLowerCase()}</p>
      </div>
      {m.program?.earnType === "stamps" ? (
        <StampCard stamps={m.balance} goal={m.program.stampGoal} rewardName={m.nextReward?.name ?? "reward"} vertical={m.merchant.vertical} terminology={m.terminology} />
      ) : (
        <div className="flex items-center gap-4 rounded-card border border-line p-4">
          <PointsRing balance={m.balance} goal={m.nextReward?.pointsCost ?? 0} terminology={m.terminology} size={64} showCaption={false} />
          <div className="min-w-0 flex-1">
            <p className="display text-title tabular-nums text-accent-text">{formatPoints(m.balance, m.terminology, false)}</p>
            <p className="text-meta text-fg-muted">{progressLine(m)}</p>
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
      <p className="text-meta text-fg-muted">{m.expiryDisclosure}</p>
      <Button variant="secondary" size="lg" fullWidth href={`/shops/${m.merchant.slug}`} iconEnd={ChevronRight}>
        Shop page
      </Button>
    </div>
  );
}

/** Rewards for one shop with redeem → code sheet. */
function MemberRewards({ membership, detail, onChanged }: { membership: customerApi.MembershipDto; detail: customerApi.MembershipDetailResponse; onChanged: () => Promise<void> }) {
  const [active, setActive] = useState<{ redemption: customerApi.RedemptionDto; used: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

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
      toast({ message: "Cancelled. Your points are back.", tone: "success" });
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
      <ListGroup title="Rewards">
        {open.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-3.5">
            <div className="min-w-0">
              <p className="text-body-strong text-fg">{r.rewardName}</p>
              <p className="text-meta font-semibold text-accent-text">Code ready to show</p>
            </div>
            <Button size="sm" onClick={() => setActive({ redemption: r, used: false })}>
              {copy.action.showCodeToStaff}
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
      </ListGroup>
      <Modal
        open={!!active}
        onClose={async () => {
          const wasUsed = active?.used;
          setActive(null);
          if (wasUsed) await onChanged();
        }}
        title={active?.used ? "Redeemed" : copy.action.showCodeToStaff}
        variant="sheet"
      >
        {active ? (
          <div className="flex flex-col items-center gap-4 pt-1">
            <div className="flex items-center gap-2.5">
              <ShopLogo shop={membership.merchant} size={32} />
              <p className="text-body-strong text-fg">{membership.merchant.name}</p>
            </div>
            <p className="display text-large-title text-fg">{active.redemption.rewardName}</p>
            <RedeemCode code={active.redemption.code} rewardName="Your code" expiresAt={active.redemption.expiresAt} onExpired={() => void onChanged()} status={active.used ? "used" : "issued"} onCancel={active.used ? undefined : cancel} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RewardsTab({ wallet, details, loading, onChanged, onShowShops }: { wallet: customerApi.WalletResponse; details: Details; loading: boolean; onChanged: () => Promise<void>; onShowShops: () => void }) {
  const ready = wallet.items.filter((m) => m.rewardsAvailableCount > 0 || (details[m.id]?.openRedemptions.length ?? 0) > 0);
  if (loading && !Object.keys(details).length) return <div className="flex flex-col gap-3"><SkeletonCard /><SkeletonCard /></div>;
  if (!ready.length) {
    const close = [...wallet.items].filter((m) => m.nextReward).sort((a, b) => b.nextReward!.progressPct - a.nextReward!.progressPct).slice(0, 5);
    if (!close.length)
      return <EmptyState icon={Gift} title={copy.empty.rewardsReady.title} description={copy.empty.rewardsReady.body} action={<Button variant="secondary" onClick={onShowShops}>{copy.empty.rewardsReady.action}</Button>} />;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-fg-muted">{copy.empty.rewardsReady.body}</p>
        <ListGroup title="Closest rewards">
          {close.map((m) => (
            <li key={m.id} className="flex flex-col gap-2.5 py-3.5">
              <div className="flex items-center gap-3">
                <ShopLogo shop={m.merchant} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-strong text-fg">{m.nextReward!.name}</p>
                  <p className="truncate text-meta text-fg-muted">{m.merchant.name}</p>
                </div>
                <span className="shrink-0 text-meta tabular-nums text-fg-muted">{formatPoints(m.nextReward!.pointsNeeded, m.terminology)} to go</span>
              </div>
              <ProgressBar value={m.nextReward!.progressPct} max={100} showValue={false} valueText={`${m.nextReward!.progressPct}% of the way to ${m.nextReward!.name}`} />
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
            <h2 className="min-w-0 flex-1 truncate text-body-strong text-fg">{m.merchant.name}</h2>
            <span className="text-meta tabular-nums text-fg-muted">{formatPoints(m.balance, m.terminology)}</span>
          </div>
          {details[m.id] ? <MemberRewards membership={m} detail={details[m.id]!} onChanged={onChanged} /> : <SkeletonCard />}
        </section>
      ))}
    </div>
  );
}

function ActivityTab({ wallet, details, loading }: { wallet: customerApi.WalletResponse; details: Details; loading: boolean }) {
  const rows = useMemo(
    () =>
      wallet.items
        .flatMap((m) => (details[m.id]?.history.items ?? []).map((t) => ({ t, m })))
        .sort((a, b) => b.t.createdAt.localeCompare(a.t.createdAt))
        .slice(0, 100),
    [wallet.items, details],
  );
  if (loading && !rows.length) return <div className="flex flex-col gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  if (!rows.length) {
    const e = copy.empty.activity("points");
    return <EmptyState icon={Activity} title={e.title} description={e.body} action={<Button href="/map">{e.action}</Button>} />;
  }
  return (
    <ListGroup>
      {rows.map(({ t, m }) => (
        <li key={t.id} className="flex min-h-16 items-center gap-3 py-2.5">
          <ShopLogo shop={m.merchant} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-strong text-fg">{t.description || TX_LABELS[t.type] || t.type}</p>
            <p className="truncate text-meta text-fg-muted">
              {m.merchant.name} · {formatDate(t.createdAt, true)}, {formatTime(t.createdAt)}
              {t.reversed ? " · reversed" : ""}
            </p>
          </div>
          <span className={t.points >= 0 ? "shrink-0 text-body-strong tabular-nums text-fg" : "shrink-0 text-body-strong tabular-nums text-fg-muted"}>
            {t.points >= 0 ? "+" : "−"}
            {formatPoints(Math.abs(t.points), m.terminology)}
          </span>
        </li>
      ))}
    </ListGroup>
  );
}

function SettingsTab({ wallet, profile, onMembership }: { wallet: customerApi.WalletResponse; profile: customerApi.ProfileDto; onMembership: (m: customerApi.MembershipDto) => void }) {
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
      toast({ message: copy.ok.saved, tone: "success" });
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function setMuted(m: customerApi.MembershipDto, muted: boolean) {
    try {
      onMembership(await browserApi.me.setMuted(m.id, muted));
      if (muted) toast(copy.ok.muted(m.merchant.name, m.terminology));
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
  }

  async function setConsent(m: customerApi.MembershipDto, on: boolean) {
    try {
      onMembership(on ? await browserApi.me.grantConsent(m.id, copy.consent.merchant(m.merchant.name)) : await browserApi.me.withdrawConsent(m.id));
      toast(on ? copy.ok.consentOn(m.merchant.name) : `${copy.ok.consentOff(m.merchant.name)} Your ${m.terminology} keep working.`);
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
      <ListGroup title="Messages from shops" footer="Each shop asks separately. Muting stops all offers from a shop; your points keep working.">
        {wallet.items.map((m) => (
          <li key={m.id} className="flex flex-col py-3">
            <p className="flex items-center gap-2.5 py-1 text-body-strong text-fg">
              <ShopLogo shop={m.merchant} size={24} />
              <span className="min-w-0 flex-1 truncate">{m.merchant.name}</span>
              {m.marketingConsent.granted ? <StatusDot tone="positive" className="text-meta font-normal text-fg-muted">Offers on</StatusDot> : null}
            </p>
            <Switch label={`Get offers from ${m.merchant.name}`} description={m.marketingConsent.granted && m.marketingConsent.grantedAt ? `Since ${formatDate(m.marketingConsent.grantedAt)}` : "By text and email. Unsubscribe anytime."} checked={m.marketingConsent.granted} onChange={(v) => void setConsent(m, v)} />
            <Switch label={`Mute ${m.merchant.name}`} checked={m.muted} onChange={(v) => void setMuted(m, v)} />
          </li>
        ))}
      </ListGroup>

      <ListGroup title="Your details" as="div" footer={<>Phone <span className="tabular-nums">{formatE164(profile.phone)}</span> · Member number <span className="tabular-nums">{profile.memberCode}</span></>}>
        <div className="flex flex-col gap-4 py-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <TextField label="Email" type="email" optionalLabel value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Button onClick={save} loading={saving} variant="secondary" className="self-start">
            Save
          </Button>
        </div>
      </ListGroup>

      <ListGroup title="Your data" as="div" footer="Download everything we hold about you, or delete your account.">
        <button type="button" onClick={exportData} className="-mx-4 flex min-h-12 items-center gap-3 px-4 text-start text-body text-fg hover:bg-bg-subtle focus-visible:focus-ring">
          <Download aria-hidden className="size-[18px] text-fg-muted" strokeWidth={1.75} />
          <span className="flex-1">Download my data</span>
        </button>
        <button type="button" onClick={signOut} className="-mx-4 flex min-h-12 items-center gap-3 px-4 text-start text-body text-fg hover:bg-bg-subtle focus-visible:focus-ring">
          <LogOut aria-hidden className="size-[18px] text-fg-muted" strokeWidth={1.75} />
          <span className="flex-1">Sign out</span>
        </button>
        <button type="button" onClick={() => setDeleteOpen(true)} className="-mx-4 flex min-h-12 items-center gap-3 px-4 text-start text-body text-negative hover:bg-bg-subtle focus-visible:focus-ring">
          <Trash2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
          <span className="flex-1">Delete my account</span>
        </button>
      </ListGroup>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        description="Your name, phone and email are erased and your card stops working at every shop. Shops keep anonymous points history. This can't be undone."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} disabled={confirmText !== "DELETE"} onClick={deleteAccount}>
              Delete my account
            </Button>
          </>
        }
      >
        <TextField label="Type DELETE to confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
      </Modal>
    </div>
  );
}
