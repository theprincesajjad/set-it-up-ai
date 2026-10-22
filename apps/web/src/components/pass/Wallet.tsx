"use client";
/**
 * Web pass (`/me`): my card, my shops, rewards with redeem → code, activity and
 * settings (mute, consent, data export, delete). customer-web-pass.md §5.
 */
import { Activity, CreditCard, Download, Gift, LogOut, Settings, Store, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { customerApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/client";
import { formatDate, formatPoints, formatTime } from "@/lib/format";
import { formatE164 } from "@/lib/phone";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DiscountCard } from "@/components/ui/DiscountCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { MemberQr } from "@/components/ui/MemberQr";
import { Modal } from "@/components/ui/Modal";
import { PointsRing } from "@/components/ui/PointsRing";
import { RedeemCode } from "@/components/ui/RedeemCode";
import { RewardCard } from "@/components/ui/RewardCard";
import { ShopLogo, ShopTile } from "@/components/ui/ShopTile";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { StampCard } from "@/components/ui/StampCard";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";

type Tab = "card" | "shops" | "rewards" | "activity" | "settings";

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
    if (["card", "shops", "rewards", "activity", "settings"].includes(h)) setTab(h);
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

  const updateMembership = (m: customerApi.MembershipDto) => setWallet((w) => ({ ...w, items: w.items.map((x) => (x.id === m.id ? m : x)) }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-body-sm text-fg-muted">{profile.name ? `Hi, ${profile.name.split(" ")[0]}` : "Your card"}</p>
        <h1 className="text-h1 text-fg">My shops</h1>
        <p className="text-body-sm text-fg-muted">
          {wallet.totals.shops} {wallet.totals.shops === 1 ? "shop" : "shops"}
          {wallet.totals.rewardsAvailable ? ` · ${wallet.totals.rewardsAvailable} ${wallet.totals.rewardsAvailable === 1 ? "reward" : "rewards"} ready` : ""}
        </p>
      </div>
      <Tabs
        label="Wallet"
        value={tab}
        onChange={selectTab}
        items={[
          { id: "card", label: <span className="inline-flex items-center gap-1.5"><CreditCard aria-hidden className="size-4" />Card</span> },
          { id: "shops", label: <span className="inline-flex items-center gap-1.5"><Store aria-hidden className="size-4" />Shops</span> },
          { id: "rewards", label: <span className="inline-flex items-center gap-1.5"><Gift aria-hidden className="size-4" />Rewards</span> },
          { id: "activity", label: <span className="inline-flex items-center gap-1.5"><Activity aria-hidden className="size-4" />Activity</span> },
          { id: "settings", label: <span className="inline-flex items-center gap-1.5"><Settings aria-hidden className="size-4" />Settings</span> },
        ]}
      />

      {tab === "card" ? <CardTab card={card} profile={profile} /> : null}
      {tab === "shops" ? (
        <ShopsTab wallet={wallet} details={details} openShop={openShop} setOpenShop={setOpenShop} loadDetails={loadDetails} onChanged={refreshWallet} profile={profile} />
      ) : null}
      {tab === "rewards" ? <RewardsTab wallet={wallet} details={details} loading={loadingDetails} onShowShops={() => selectTab("shops")} onChanged={async () => { await refreshWallet(); await loadDetails(); }} /> : null}
      {tab === "activity" ? <ActivityTab wallet={wallet} details={details} loading={loadingDetails} /> : null}
      {tab === "settings" ? <SettingsTab wallet={wallet} profile={profile} onMembership={updateMembership} /> : null}
    </div>
  );
}

function CardTab({ card, profile }: { card: customerApi.CardResponse | null; profile: customerApi.ProfileDto }) {
  const [walletError, setWalletError] = useState<string | null>(null);
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
  return (
    <div className="flex flex-col items-center gap-4">
      {card ? <MemberQr memberCode={card.memberCode} svg={card.qrSvg} /> : <MemberQr memberCode={profile.memberCode} caption="Show your number at the counter" />}
      <p className="text-center text-body-sm text-fg-muted">Works at every shop on the network. Turn your brightness up.</p>
      {walletError ? <Banner tone="neutral">{walletError}</Banner> : null}
      <div className="grid w-full gap-2">
        <Button variant="secondary" fullWidth onClick={apple}>
          {copy.action.addToAppleWallet}
        </Button>
        <Button variant="secondary" fullWidth onClick={google}>
          {copy.action.addToGoogleWallet}
        </Button>
      </div>
    </div>
  );
}

function ShopsTab({ wallet, details, openShop, setOpenShop, loadDetails, onChanged, profile }: { wallet: customerApi.WalletResponse; details: Details; openShop: string | null; setOpenShop: (id: string | null) => void; loadDetails: (ids?: string[]) => Promise<void>; onChanged: () => Promise<void>; profile: customerApi.ProfileDto }) {
  if (!wallet.items.length)
    return <EmptyState icon={Store} title={copy.empty.wallet.title} description={copy.empty.wallet.body} action={<Button href="/map">Find shops nearby</Button>} />;
  return (
    <ul className="flex flex-col gap-3">
      {wallet.items.map((m) => {
        const open = openShop === m.id;
        const d = details[m.id];
        return (
          <li key={m.id} className="flex flex-col gap-3">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => {
                setOpenShop(open ? null : m.id);
                if (!open && !d) void loadDetails([m.id]);
              }}
              className="text-start focus-visible:focus-ring rounded-lg"
            >
              <ShopTile
                variant="wallet"
                shop={{ name: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl }}
                balance={{ value: m.balance, terminology: m.terminology }}
                rewardReady={m.rewardsAvailableCount > 0}
                muted={m.muted}
                subtitle={m.nextReward ? copy.misc.stampsToGo(m.nextReward.pointsNeeded, m.nextReward.name) : m.expiryDisclosure}
              />
            </button>
            {open ? (
              <div className="flex flex-col gap-3 rounded-lg bg-canvas-subtle p-3">
                {m.program?.earnType === "stamps" ? (
                  <StampCard stamps={m.balance} goal={m.program.stampGoal} rewardName={m.nextReward?.name ?? "reward"} vertical={m.merchant.vertical} terminology={m.terminology} />
                ) : (
                  <Card className="flex justify-center">
                    <PointsRing balance={m.balance} goal={m.nextReward?.pointsCost ?? 0} terminology={m.terminology} rewardName={m.nextReward?.name} size={120} />
                  </Card>
                )}
                <p className="text-caption text-fg-muted">{m.expiryDisclosure}</p>
                {!d ? (
                  <SkeletonCard />
                ) : (
                  <>
                    <MemberRewards membership={m} detail={d} onChanged={async () => { await onChanged(); await loadDetails([m.id]); }} />
                    {d.discountCards.map((c) => (
                      <DiscountCard key={c.id} card={c} shop={m.merchant} memberName={profile.name} />
                    ))}
                  </>
                )}
                <Button variant="ghost" size="sm" href={`/shops/${m.merchant.slug}`} className="self-start">
                  Shop page
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
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
  return (
    <div className="flex flex-col gap-3">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {open.map((r) => (
        <Card key={r.id} tone="flat" className="flex items-center justify-between gap-3">
          <div>
            <p className="text-title">{r.rewardName}</p>
            <p className="text-body-sm text-fg-muted">Code ready to show</p>
          </div>
          <Button variant="accent" size="sm" onClick={() => setActive({ redemption: r, used: false })}>
            {copy.action.showCodeToStaff}
          </Button>
        </Card>
      ))}
      {detail.rewards.map((r) => (
        <RewardCard
          key={r.id}
          reward={r}
          balance={membership.balance}
          terminology={membership.terminology}
          state={busy === r.id ? "redeeming" : r.affordable ? "available" : "locked"}
          onRedeem={() => void redeem(r.id)}
        >
          <Skeleton className="h-10 w-full" />
        </RewardCard>
      ))}
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
          <div className="flex flex-col items-center gap-3">
            <ShopLogo shop={membership.merchant} size={48} />
            <p className="text-h2 text-fg">{active.redemption.rewardName}</p>
            <RedeemCode code={active.redemption.code} rewardName={membership.merchant.name} status={active.used ? "used" : "issued"} onCancel={active.used ? undefined : cancel} />
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
    const closest = [...wallet.items].filter((m) => m.nextReward).sort((a, b) => (a.nextReward!.pointsNeeded - b.nextReward!.pointsNeeded))[0];
    return (
      <EmptyState
        icon={Gift}
        title={copy.empty.rewardsReady.title}
        description={closest ? `${copy.empty.rewardsReady.body} Closest: ${closest.nextReward!.pointsNeeded} more at ${closest.merchant.name}.` : copy.empty.rewardsReady.body}
        action={<Button variant="tonal" onClick={onShowShops}>{copy.empty.rewardsReady.action}</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {ready.map((m) => (
        <section key={m.id} aria-label={m.merchant.name} className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-title text-fg">
            <ShopLogo shop={m.merchant} size={24} />
            {m.merchant.name}
            <span className="text-body-sm font-normal text-fg-muted">· {formatPoints(m.balance, m.terminology)}</span>
          </h2>
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
    <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface px-4 shadow-sm">
      {rows.map(({ t, m }) => (
        <li key={t.id} className="flex min-h-16 items-center gap-3 py-2">
          <ShopLogo shop={m.merchant} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-strong text-fg">{t.description || TX_LABELS[t.type] || t.type}</p>
            <p className="truncate text-body-sm text-fg-muted">
              {m.merchant.name} · {formatDate(t.createdAt, true)}, {formatTime(t.createdAt)}
              {t.reversed ? " · reversed" : ""}
            </p>
          </div>
          <span className={t.points >= 0 ? "text-body-strong tabular-nums text-success" : "text-body-strong tabular-nums text-fg"}>
            {t.points >= 0 ? "+" : "−"}
            {formatPoints(Math.abs(t.points), m.terminology)}
          </span>
        </li>
      ))}
    </ul>
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
    <div id="settings" className="flex flex-col gap-6">
      <Card>
        <h2 className="text-title text-fg">Messages from shops</h2>
        <p className="mt-1 text-body-sm text-fg-muted">Each shop asks separately. Muting stops all offers from a shop; your points keep working.</p>
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {wallet.items.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 py-3">
              <p className="flex items-center gap-2 text-body-strong text-fg">
                <ShopLogo shop={m.merchant} size={24} />
                {m.merchant.name}
                {m.marketingConsent.granted ? <Badge tone="success">Offers on</Badge> : null}
              </p>
              <Switch label={`Get offers from ${m.merchant.name}`} description={m.marketingConsent.granted && m.marketingConsent.grantedAt ? `Since ${formatDate(m.marketingConsent.grantedAt)}` : "By text and email. Unsubscribe anytime."} checked={m.marketingConsent.granted} onChange={(v) => void setConsent(m, v)} />
              <Switch label={`Mute ${m.merchant.name}`} checked={m.muted} onChange={(v) => void setMuted(m, v)} />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-title text-fg">Your details</h2>
        <div className="mt-3 flex flex-col gap-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <TextField label="Email" type="email" optionalLabel value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <p className="text-body-sm text-fg-muted">
            Phone: <span className="tabular-nums">{formatE164(profile.phone)}</span> · Member number <span className="tabular-nums">{profile.memberCode}</span>
          </p>
          <Button onClick={save} loading={saving} className="self-start">
            Save
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-title text-fg">Your data</h2>
        <p className="mt-1 text-body-sm text-fg-muted">Download everything we hold about you, or delete your account.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" iconStart={Download} onClick={exportData}>
            Download my data
          </Button>
          <Button variant="secondary" iconStart={LogOut} onClick={signOut}>
            Sign out
          </Button>
          <Button variant="ghost" iconStart={Trash2} onClick={() => setDeleteOpen(true)} className="text-danger">
            {"Delete my account"}
          </Button>
        </div>
      </Card>

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
