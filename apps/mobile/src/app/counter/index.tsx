import { layout } from "@ll/design-tokens";
import type { staffApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isApiError, type ApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { AmountDisplay, AwardButton, CounterHeader, CounterSecondary, CustomerCard, EntryDisplay, NoticeCard, QuantityChips, QueueSheet, RecentStrip, RewardPicker, SuccessCard } from "../../features/counter/components";
import { DigitBoxes, MatchList, NoMatch, RewardReadyScreen, ScanFooter, ScanKeypad, ScanViewfinder, StampedScreen, UndoToast } from "../../features/counter/ScanFirst";
import { scanBus } from "../../features/scanBus";
import {
  activeMultiplier,
  AUTO_RETURN_SECONDS,
  awardButtonLabel,
  awardQuantity,
  quantityChips,
  awardErrorMessage,
  awardRef,
  classifyScan,
  cooldownWarning,
  counterReducer,
  entryDisplay,
  estimatePoints,
  firstName,
  formatPts,
  initialCounterState,
  normalizeRedeemInput,
  shortName,
  shouldQueueAward,
  termWord,
  successView,
  type CounterCustomer,
  type SuccessView,
} from "../../lib/award";
import { formatTime } from "../../lib/format";
import { newIdempotencyKey } from "../../lib/ids";
import { last4, toE164 } from "../../lib/phone";
import { api } from "../../state/api";
import { useCounter, type RecentAward } from "../../state/counter";
import { qk } from "../../state/query";
import { useLocale } from "../../lib/i18n";
import { typo, useTheme } from "../../theme";
import { Banner, Button, Camera, Chip, EmptyState, Keypad, ListRow, OfflineBanner, Search, Sheet, Text, Ticket, useToast, Avatar, type KeypadKey } from "../../ui";

type Panel = { kind: "redeemSuccess"; view: SuccessView; transactionId: string | null; startedAt: number } | null;

/** Counter mode main screen: keypad / scan → customer → award in ≤ 2 taps → success + 10 s undo. */
export default function Counter() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const { t: tr } = useLocale();
  const ctx = useCounter();
  const { config, merchant, program, programPaused, staff, online, queue, queueState, flush, recent, addRecent, markUndone, touch, cacheMembers, cachedMember } = ctx;
  const merchantId = config.merchantId ?? "";
  const [state, dispatch] = useReducer(counterReducer, initialCounterState);
  const [panel, setPanel] = useState<Panel>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Restaurant tools show only when the shop's plan has them (402 / empty list means off).
  const featuresQ = useQuery({ queryKey: ["counter", "features", config.merchantId ?? "none"], queryFn: () => api.kitchen.features(config.merchantId!), enabled: !!config.merchantId, staleTime: 5 * 60_000 });
  const on = (k: string) => !!featuresQ.data?.features.find((f) => f.key === k)?.enabled;
  const restaurantTools = { kds: on("restaurant.kds"), order: on("orders.order_ahead") && featuresQ.data?.features.some((f) => f.key.startsWith("restaurant.") && f.enabled) === true };
  const [queueOpen, setQueueOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [qty, setQty] = useState(1);
  /** Typing a full phone number (to add a new member) instead of the last 4 digits. */
  const [phoneMode, setPhoneMode] = useState(false);
  /** The latest stamp: its Undo toast outlives the 3 s auto-return (10 s in all). */
  const [lastStamp, setLastStamp] = useState<{ at: number; name: string | null; transactionId: string | null; queuedKey: string | null; key: string } | null>(null);
  const stamping = useRef<string | null>(null);
  // Each customer starts at +1.
  useEffect(() => {
    if (state.step !== "customer") setQty(1);
  }, [state.step]);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const rewards = useQuery({ queryKey: qk.counterRewards(merchantId), queryFn: () => api.merchant.rewards(merchantId), enabled: !!merchantId, staleTime: 5 * 60_000 });
  const promos = useQuery({ queryKey: qk.counterPromos(merchantId), queryFn: () => api.merchant.promos(merchantId), enabled: !!merchantId, staleTime: 5 * 60_000 });
  const categories = useQuery({ queryKey: qk.counterCategories(merchantId), queryFn: () => api.merchant.categories(merchantId), enabled: !!merchantId, staleTime: 30 * 60_000 });
  const noEarnCategories = (categories.data?.items ?? []).filter((x) => !x.earnEligible);
  const activeRewards = (rewards.data?.items ?? []).filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost);
  const multiplier = activeMultiplier(promos.data?.items ?? [], new Date());
  const vertical = merchant?.merchant.vertical ?? "other";

  // Clear any pending auto-return when leaving success.
  useEffect(() => () => void (returnTimer.current && clearTimeout(returnTimer.current)), []);

  const scheduleReturn = useCallback(() => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => {
      setPanel(null);
      setPhoneMode(false);
      dispatch({ type: "reset" });
    }, AUTO_RETURN_SECONDS * 1000);
  }, []);

  // ---------------------------------------------------------------- lookup
  const lookup = useCallback(
    async (query: string, digits: string) => {
      const isPhone = /^\+1\d{10}$/.test(query);
      if (!online) {
        const cached = cachedMember(query);
        if (cached) dispatch({ type: "pick", member: cached });
        else if (isPhone) dispatch({ type: "lookupOffline", phone: query, label: `•• ${last4(query)}` });
        else if (query.startsWith("LL:") || /^[A-Z0-9]{8}$/.test(query)) dispatch({ type: "lookupOffline", memberCode: query, label: "Member card" });
        else dispatch({ type: "lookupError", message: "Last-4 search needs internet. Type the full number." });
        return;
      }
      try {
        const res = await api.counter.lookup(merchantId, query);
        if (res.items.length) cacheMembers(query, res.items);
        dispatch({ type: "lookupResult", res, digits, program: program ?? null });
      } catch (e) {
        const err = e as ApiError;
        if (isApiError(err) && err.isRetryable) {
          if (isPhone) dispatch({ type: "lookupOffline", phone: query, label: `•• ${last4(query)}` });
          else if (query.startsWith("LL:")) dispatch({ type: "lookupOffline", memberCode: query, label: "Member card" });
          else dispatch({ type: "lookupError", message: t("err.network") });
        } else if (isApiError(err) && err.status === 404) {
          dispatch({ type: "lookupError", message: t("err.qr.invalid") });
        } else dispatch({ type: "lookupError", message: isApiError(err) ? err.message : t("err.server") });
      }
    },
    [online, merchantId, cacheMembers, cachedMember, program],
  );

  useEffect(() => {
    if (state.step === "lookingUp") void lookup(state.query, state.digits);
  }, [state, lookup]);

  // The 4th digit looks up straight away (no Find press); a full 10-digit number does the same in phone mode.
  useEffect(() => {
    if (state.step !== "entry") return;
    if (!phoneMode && state.digits.length === 4) dispatch({ type: "lookup" });
    else if (phoneMode && state.digits.length === 10 && toE164(state.digits)) dispatch({ type: "lookup" });
  }, [state, phoneMode]);

  // Stamp on scan: the screen awards the moment one member is identified.
  const stampsToday = useQuery({ queryKey: ["counter", "stamps-today", merchantId], queryFn: () => api.counter.today(merchantId, config.locationId ?? undefined), enabled: !!merchantId && online, staleTime: 30_000, refetchInterval: 60_000 });

  // Scanned card / code from the camera screen.
  const verifyCode = useCallback(
    async (raw: string) => {
      const value = normalizeRedeemInput(raw);
      if (value.length < 4) return;
      if (!online) {
        setCodeError(t("err.redeem.offline"));
        return;
      }
      setCodeBusy(true);
      setCodeError(null);
      try {
        const res = await api.counter.verifyRedemption(merchantId, value, vertical === "pharmacy" ? true : undefined);
        setCodeOpen(false);
        setCode("");
        showRedeemSuccess(res);
      } catch (e) {
        if (isApiError(e) && e.status === 404) setCodeError("No reward code like that at this shop. Check the code, or ask them to tap Redeem again.");
        else if (isApiError(e) && e.code === "already_used") setCodeError(e.message || "Already redeemed.");
        else if (isApiError(e) && e.code === "void") setCodeError("This code was cancelled. Ask them to tap Redeem again.");
        else setCodeError(isApiError(e) ? e.message : t("err.server"));
        setCodeOpen(true);
      } finally {
        setCodeBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [online, merchantId],
  );

  const handleScan = useCallback(
    (data: string) => {
      touch();
      const s = classifyScan(data);
      // A scan only starts a lookup from the idle keypad; a card held in view during a stamp is ignored.
      const idle = stateRef.current.step === "entry";
      if (s.kind === "member") {
        if (!idle && stateRef.current.step !== "success") return;
        dispatch({ type: "reset" });
        dispatch({ type: "lookup", query: `LL:${s.memberCode}` });
      } else if (s.kind === "phone") {
        dispatch({ type: "reset" });
        const e164 = toE164(s.digits);
        if (e164) dispatch({ type: "lookup", query: e164 });
      } else if (s.kind === "redeem") {
        setCode(s.code);
        void verifyCode(s.code);
      } else toast({ tone: "error", message: t("err.qr.invalid") });
    },
    [toast, verifyCode, touch],
  );
  useEffect(() => scanBus.subscribe(handleScan), [handleScan]);

  // ---------------------------------------------------------------- award
  const customer = state.step === "customer" ? state.customer : null;
  const member = customer?.kind === "member" ? customer.member : null;
  const perDollar = program?.earnType === "per_dollar";
  const noEarn = !!categoryId;
  const estimate = program ? estimatePoints({ program, amountCents: state.step === "customer" ? state.amountCents : 0, noEarn, multiplier, vipMultiplierPct: member?.vip?.multiplierPct }) : 0;
  const label = program ? awardButtonLabel(program, { points: estimate, noEarn, multiplier, newCustomer: customer?.kind === "new" }) : "Award";
  const cooldown = member && program ? cooldownWarning(member, program, Date.now()) : null;

  const who = (cust: CounterCustomer) => (cust.kind === "member" ? `${shortName(cust.member.name)} ${cust.member.maskedPhone ? `•• ${last4(cust.member.maskedPhone)}` : ""}`.trim() : cust.kind === "new" ? `•• ${cust.digits.slice(-4)}` : cust.label);

  /** quantity > 1: the +2 / +3 chips (two coffees = one visit, quantity × pointsPerVisit). */
  const award = (quantity = 1) => {
    if (state.step !== "customer") return Promise.resolve();
    return awardFor(state.customer, { quantity, amountCents: state.amountCents });
  };

  /** One award for an identified customer: from the confirm panel, from Stamp on scan, or "Stamp instead" on a ready reward. */
  const awardFor = async (cust: CounterCustomer, opts: { quantity?: number; amountCents?: number; fromScan?: boolean } = {}) => {
    if (!program || !merchantId) return;
    touch();
    const quantity = opts.quantity ?? 1;
    const amount = opts.amountCents ?? 0;
    const qty = awardQuantity(program, quantity);
    const unitEstimate = estimatePoints({ program, amountCents: amount, noEarn, multiplier, vipMultiplierPct: cust.kind === "member" ? cust.member.vip?.multiplierPct : undefined });
    const estimated = unitEstimate * (qty.quantity ?? 1);
    const tapLabel = awardButtonLabel(program, { points: estimated, noEarn, multiplier, newCustomer: cust.kind === "new" });
    const key = newIdempotencyKey();
    const amountCents = perDollar ? amount : undefined;
    const body = {
      ...awardRef(cust),
      ...(categoryId ? { lines: [{ amountCents: amount, categoryId }] } : amountCents !== undefined ? { amountCents } : {}),
      // Pharmacy: the "Front store" chip is the cashier's confirmation that the total has no prescriptions or pharmacy services.
      ...(vertical === "pharmacy" && !categoryId ? { frontStoreOnly: true } : {}),
      ...(config.locationId ? { locationId: config.locationId } : {}),
      ...(cust.kind === "new" && newName.trim() ? { customerName: newName.trim() } : {}),
      ...qty,
      idempotencyKey: key,
    };
    const baseBalance = cust.kind === "member" ? cust.member.balance : null;
    const optimistic = successView({
      program,
      pointsEarned: estimated,
      balance: baseBalance === null ? null : baseBalance + estimated,
      nextReward: cust.kind === "member" && cust.member.nextReward ? { name: cust.member.nextReward.name, pointsNeeded: Math.max(0, cust.member.nextReward.pointsNeeded - estimated) } : null,
      firstName: cust.kind === "member" ? firstName(cust.member.name) : null,
      offline: !online,
    });
    const display = { label: tapLabel, who: who(cust), name: cust.kind === "member" ? cust.member.name : null };
    const enqueue = async () => {
      await queue.enqueue(merchantId, { type: "award", occurredAt: new Date().toISOString(), ...body } as staffApi.SyncEvent, display);
      addRecent({ key, transactionId: null, label: tapLabel, who: display.who, at: Date.now(), queued: true });
    };

    // Optimistic success in <= 150 ms; the server result replaces it.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    dispatch({ type: "awarded", view: optimistic, customer: cust, transactionId: null, queuedKey: online ? null : key, at: Date.now() });
    setLastStamp({ at: Date.now(), name: display.name, transactionId: null, queuedKey: online ? null : key, key });
    setCategoryId(null);
    setNewName("");
    if (!online) {
      await enqueue();
      AccessibilityInfo.announceForAccessibility(`${optimistic.title}. ${t("ok.counter.offlineSaved")}`);
      scheduleReturn();
      return;
    }
    try {
      const res = await api.counter.award(merchantId, body);
      // Title = what staff added ("Added 2 stamps"); bonuses (promo, passport) are listed under it, and the balance includes them.
      const bonus = res.extraPoints > 0 ? [`Plus ${formatPts(res.extraPoints, program.terminology)} bonus`] : [];
      const view = successView({ program, pointsEarned: res.pointsEarned, balance: res.balance, nextReward: res.member.nextReward, rewardsAvailable: res.rewardsAvailable, messages: [...bonus, ...res.messages], firstName: firstName(res.member.name), fullName: res.member.name, visitsThisMonth: res.visitsThisMonth });
      dispatch({ type: "awarded", view, customer: { kind: "member", member: res.member }, transactionId: res.transactionId, queuedKey: null, at: Date.now() });
      setLastStamp({ at: Date.now(), name: res.member.name, transactionId: res.transactionId, queuedKey: null, key });
      addRecent({ key, transactionId: res.transactionId, label: view.title, who: who({ kind: "member", member: res.member }), at: Date.now() });
      cacheMembers(`code:${res.member.memberCode}`, [res.member]);
      AccessibilityInfo.announceForAccessibility(view.announcement);
      scheduleReturn();
    } catch (e) {
      if (shouldQueueAward(e)) {
        await enqueue();
        dispatch({ type: "awarded", view: { ...optimistic, offline: true, hero: optimistic.hero.startsWith("~") ? optimistic.hero : `~${optimistic.hero}` }, customer: cust, transactionId: null, queuedKey: key, at: Date.now() });
        toast("Saved. We'll retry.");
        scheduleReturn();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        const message = awardErrorMessage(isApiError(e) ? e : {}, { last4: cust.kind === "member" ? last4(cust.member.maskedPhone) : undefined, terminology: program.terminology });
        if (opts.fromScan) {
          // Stamped on scan and refused (cooldown, paused): say so and go back to scan. Never a second stamp.
          dispatch({ type: "notice", tone: "danger", message });
          scheduleReturn();
        } else {
          dispatch({ type: "identified", customer: cust });
          dispatch({ type: "awardError", message });
        }
      }
    }
  };

  // Stamp on scan: one member identified, below the goal, setting on. One award per identification, never two.
  useEffect(() => {
    if (state.step !== "stamping") {
      stamping.current = null;
      return;
    }
    if (stamping.current === state.member.memberId) return;
    stamping.current = state.member.memberId;
    void awardFor({ kind: "member", member: state.member }, { fromScan: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ---------------------------------------------------------------- undo
  const undo = async (target: { transactionId: string | null; queuedKey: string | null; key?: string }) => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setUndoBusy(true);
    try {
      if (target.queuedKey && queue.has(target.queuedKey)) {
        await queue.remove(target.queuedKey);
        markUndone(target.queuedKey);
        dispatch({ type: "notice", tone: "neutral", message: "Undone. Nothing was sent." });
      } else if (target.transactionId) {
        const res = await api.counter.undo(merchantId, target.transactionId);
        if (target.key) markUndone(target.key);
        dispatch({ type: "notice", tone: "neutral", message: t("ok.counter.undone", { firstName: firstName(res.member.name) ?? "They", pts: formatPts(res.member.balance, res.member.terminology) }) });
      } else {
        dispatch({ type: "notice", tone: "neutral", message: "Still sending. Undo it from Today once it's sent." });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    } catch (e) {
      dispatch({ type: "notice", tone: "danger", message: isApiError(e) && e.status === 403 ? "Too late to undo here. Ask a manager to adjust it." : isApiError(e) ? e.message : t("err.network") });
    } finally {
      setUndoBusy(false);
      setPanel(null);
      scheduleReturn();
    }
  };
  const undoRecent = (r: RecentAward) => undo({ transactionId: r.transactionId, queuedKey: r.queued ? r.key : null, key: r.key });
  /** Undo from the toast: still there after the screen returned to scan, for 10 s from the stamp. */
  const undoLast = async () => {
    if (!lastStamp) return;
    const t = lastStamp;
    setLastStamp(null);
    await undo({ transactionId: t.transactionId, queuedKey: t.queuedKey, key: t.key });
  };

  // ---------------------------------------------------------------- redeem
  const showRedeemSuccess = (res: staffApi.CounterRedemptionResponse) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    const view: SuccessView = {
      title: t("ok.counter.redeemed", { reward: res.redemption.reward.name }),
      hero: program?.earnType === "stamps" && program.stampGoal && res.member.balance <= program.stampGoal ? `${res.member.balance} / ${program.stampGoal}` : formatPts(res.member.balance, res.member.terminology),
      next: `${shortName(res.member.name)} has ${formatPts(res.member.balance, res.member.terminology)} left`,
      rewardReady: false,
      offline: false,
      messages: res.redemption.discountCents ? [`Discount ${(res.redemption.discountCents / 100).toFixed(2)}`] : [],
      announcement: `${res.redemption.reward.name} redeemed. Hand it over.`,
    };
    AccessibilityInfo.announceForAccessibility(view.announcement);
    setPanel({ kind: "redeemSuccess", view, transactionId: res.redemption.transactionId, startedAt: Date.now() });
    addRecent({ key: res.redemption.id, transactionId: res.redemption.transactionId, label: `Redeemed ${res.redemption.reward.name}`, who: shortName(res.member.name), at: Date.now() });
    scheduleReturn();
  };

  const redeemMember = state.step === "reward" ? state.member : state.step === "customer" && state.customer.kind === "member" ? state.customer.member : state.step === "success" && state.customer.kind === "member" ? state.customer.member : null;
  const redeem = async (rewardId: string) => {
    if (!redeemMember) return;
    setRedeemBusy(true);
    setRedeemError(null);
    try {
      // Pharmacy: a reward goes on front-store items only (the server asks for this confirmation).
      const res = await api.counter.redeem(merchantId, { memberId: redeemMember.memberId, rewardId, locationId: config.locationId ?? undefined, ...(vertical === "pharmacy" ? { frontStoreOnly: true } : {}), idempotencyKey: newIdempotencyKey() });
      setRedeemOpen(false);
      showRedeemSuccess(res);
    } catch (e) {
      setRedeemError(isApiError(e) && e.code === "insufficient_points" ? "Not enough yet for that reward." : isApiError(e) ? e.message : t("err.network"));
    } finally {
      setRedeemBusy(false);
    }
  };

  /** Back to the keypad now (staff don't wait for the 4 s auto-return). */
  const nextCustomer = () => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setPhoneMode(false);
    setPanel(null);
    setCategoryId(null);
    setNewName("");
    dispatch({ type: "reset" });
  };

  const onKey = (k: KeypadKey) => {
    touch();
    if (panel) setPanel(null);
    if (returnTimer.current && state.step !== "customer") clearTimeout(returnTimer.current);
    dispatch({ type: "key", key: k });
  };

  // ---------------------------------------------------------------- guards
  const queuedForCount = useMemo(() => queueState.pendingCount, [queueState.pendingCount]);
  if (!ctx.ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!config.merchantId || !config.locationId) return <Redirect href="/counter/select" />;
  if (config.sharedDevice && !staff) return <Redirect href="/counter/pin" />;
  if (config.kiosk) return <Redirect href="/counter/kiosk" />;

  const wide = width >= 768;
  const idleStep = state.step === "entry" || state.step === "lookingUp";
  const showKeypad = state.step === "entry" || state.step === "pick" || state.step === "lookingUp" || (state.step === "customer" && perDollar);
  const digits = state.step === "entry" || state.step === "pick" || state.step === "lookingUp" ? state.digits : "";

  const autoHint = program?.counterAutoStamp && !perDollar ? "Wallet pass, app, or printed QR. Stamps on scan." : "Wallet pass, app, or printed QR.";
  const onScanKey = (k: string) => {
    touch();
    if (k === "clear") dispatch({ type: "key", key: "clear" });
    else dispatch({ type: "key", key: k });
  };
  // Scan first (cafes-retail.md 7.2): the camera in the main screen, the last 4 digits second, then Redeem a code.
  const scanPane = (
    <View style={{ gap: 14, flexGrow: 1 }}>
      <ScanViewfinder onScan={handleScan} hint={autoHint} />
      <Text style={{ textAlign: "center", fontSize: 14, lineHeight: 19 }} rawColor={c.fgMuted}>
        or type the last 4 digits of their phone
      </Text>
      <DigitBoxes digits={digits} />
      {state.step === "entry" && state.error ? (
        <Text variant="meta" rawColor={c.negative} center>
          {state.error}
        </Text>
      ) : null}
      <ScanKeypad onKey={onScanKey} disabled={state.step === "lookingUp"} />
      <ScanFooter online={online} stampsToday={stampsToday.data?.pointsIssued ?? null} terminology={program?.terminology ?? "stamps"} onCode={() => setCodeOpen(true)} />
    </View>
  );

  // Display + Scan / Code on top; keypad and the primary button in the thumb zone at the bottom (staff-counter.md § Principles 2).
  const entryPane = (
    <View style={{ gap: 12, flexGrow: 1, justifyContent: "space-between" }}>
      <View style={{ gap: 12 }}>
        {phoneMode ? (
          <Button variant="ghost" size="lg" onPress={() => { setPhoneMode(false); dispatch({ type: "toEntry" }); }}>
            Back to scan
          </Button>
        ) : null}
        {state.step === "customer" && perDollar ? (
          <AmountDisplay cents={state.amountCents} />
        ) : (
          <EntryDisplay text={entryDisplay(digits)} placeholder={t("counter.placeholder")} error={state.step === "entry" ? state.error : null} />
        )}
        {state.step !== "customer" ? (
          <View style={styles.row}>
            <Button variant="secondary" size="lg" iconStart={Camera} style={{ flex: 1 }} onPress={() => router.push("/counter/scan")}>
              {tr("counter.scanCard")}
            </Button>
            <Button variant="secondary" size="lg" iconStart={Ticket} style={{ flex: 1 }} onPress={() => setCodeOpen(true)}>
              {tr("counter.enterCode")}
            </Button>
          </View>
        ) : null}
        {state.step === "entry" && digits.length === 4 ? (
          <View style={{ alignItems: "center" }}>
            <Chip large icon={Search} label={t("counter.searchLast4")} onPress={() => dispatch({ type: "lookup", query: digits })} />
          </View>
        ) : null}
      </View>
      <View style={{ gap: 12 }}>
        {showKeypad ? <Keypad onKey={onKey} /> : null}
        {state.step === "entry" || state.step === "lookingUp" ? (
          <Button size="counter" loading={state.step === "lookingUp"} disabled={digits.length < 4} onPress={() => dispatch({ type: "lookup" })}>
            {tr("counter.findCustomer")}
          </Button>
        ) : null}
      </View>
    </View>
  );

  const customerPane = (() => {
    if (state.step === "stamping") {
      return (
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 48 }} accessibilityLiveRegion="polite">
          <Text variant="title" center>
            {`Adding a ${program ? termWord(program.terminology, 1) : "stamp"} for ${firstName(state.member.name) ?? "them"}`}
          </Text>
        </View>
      );
    }
    if (state.step === "nomatch") {
      return <NoMatch digits={state.digits} onTryAgain={nextCustomer} onNew={() => { setPhoneMode(true); dispatch({ type: "toEntry" }); }} />;
    }
    // Redeeming from the reward screen leaves the step on "reward", so the success card has to win over it.
    if (panel?.kind === "redeemSuccess") {
      return <SuccessCard tone="accent" view={panel.view} startedAt={panel.startedAt} undoLabel="Undo redeem" undoBusy={undoBusy} onUndo={panel.transactionId ? () => undo({ transactionId: panel.transactionId, queuedKey: null }) : undefined} onNext={nextCustomer} />;
    }
    if (state.step === "reward") {
      const m = state.member;
      return (
        <RewardReadyScreen
          member={m}
          program={program ?? { earnType: "stamps", terminology: m.terminology, pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0, stampGoal: m.nextReward?.pointsCost ?? 10 }}
          busy={redeemBusy || state.step !== "reward"}
          onRedeem={() => {
            if (m.rewardsAffordable.length === 1) void redeem(m.rewardsAffordable[0]!.id);
            else setRedeemOpen(true);
          }}
          onStamp={() => void awardFor({ kind: "member", member: m }, { fromScan: true })}
          onBack={nextCustomer}
        />
      );
    }
    if (state.step === "success" && program && program.earnType !== "per_dollar" && state.view.name !== undefined && !panel) {
      return <StampedScreen view={state.view} program={program} onNext={nextCustomer} />;
    }
    if (state.step === "success") {
      return (
        <SuccessCard
          tone="success"
          view={state.view}
          startedAt={state.startedAt}
          undoBusy={undoBusy}
          onUndo={state.transactionId || state.queuedKey ? () => undo({ transactionId: state.transactionId, queuedKey: state.queuedKey, key: recent[0]?.key }) : undefined}
          onRedeemNow={online && state.customer.kind === "member" ? () => { if (returnTimer.current) clearTimeout(returnTimer.current); setRedeemOpen(true); } : undefined}
          onNext={nextCustomer}
        />
      );
    }
    if (state.step === "notice") {
      return <NoticeCard message={state.message} tone={state.tone} onNext={nextCustomer} />;
    }
    if (state.step === "pick" && program) {
      return <MatchList digits={state.digits} items={state.matches} program={program} now={new Date()} onPick={(m) => dispatch({ type: "pick", member: m, program })} onNew={() => { setPhoneMode(true); dispatch({ type: "toEntry" }); }} />;
    }
    if (state.step === "pick") {
      return (
        <View style={{ gap: 4 }}>
          <Text variant="metaStrong" color="fgMuted" tabular>{`numbers ending in ${state.digits}`}</Text>
          {state.matches.map((m) => (
            <ListRow
              key={m.memberId}
              leading={<Avatar name={m.name} id={m.memberId} size={40} />}
              title={`${shortName(m.name)} · ${m.maskedPhone ?? ""}`}
              subtitle={m.lastVisitAt ? `Visited ${new Date(m.lastVisitAt).toDateString().slice(0, 10)}` : "New here"}
              minHeight={64}
              onPress={() => dispatch({ type: "pick", member: m })}
            />
          ))}
        </View>
      );
    }
    if (state.step === "customer") {
      const reset = () => {
        setCategoryId(null);
        setQty(1);
        dispatch({ type: "reset" });
      };
      const chipsFor = programPaused ? [] : quantityChips(program);
      const q = chipsFor.length > 0 ? qty : 1;
      const stamps = program?.earnType === "stamps";
      // "Add 1 stamp" / "Add 3 stamps" (canvas), visits "Add visit (+30 pts)", per-dollar "Award 24 pts".
      const mainLabel = program
        ? stamps && state.customer.kind !== "new"
          ? awardButtonLabel(program, { points: estimate * q, multiplier, newCustomer: false }).replace(/^Add ([a-z])/i, "Add 1 $1")
          : awardButtonLabel(program, { points: estimate * q, noEarn, multiplier, newCustomer: state.customer.kind === "new" })
        : label;
      const canRedeem = !!member && member.rewardsAffordable.length > 0 && activeRewards.length > 0;
      const needs = member?.nextReward?.pointsCost ?? program?.stampGoal ?? null;
      return (
        <View style={{ flexGrow: 1 }}>
          <CustomerCard customer={state.customer} program={program} vertical={vertical} cooldown={cooldown} onRedeem={() => setRedeemOpen(true)} onCode={() => setCodeOpen(true)} onClear={reset} />
          {state.customer.kind === "new" ? (
            <View style={[styles.nameField, { borderColor: c.lineStrong, backgroundColor: c.bg, marginTop: 16 }]}>
              <TextInput value={newName} onChangeText={setNewName} placeholder="Ask for their name (optional)" placeholderTextColor={c.fgSubtle} accessibilityLabel="Customer's first name, optional" autoCapitalize="words" style={[typo("bodyLg"), { color: c.fg, flex: 1, minWidth: 0 }]} />
            </View>
          ) : null}
          {perDollar && noEarnCategories.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 16 }}>
              <Chip large label="Front store" selected={!categoryId} onPress={() => setCategoryId(null)} />
              {noEarnCategories.map((cat) => (
                <Chip key={cat.id} large label={cat.name} selected={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
              ))}
            </ScrollView>
          ) : null}
          {categoryId ? <View style={{ marginTop: 12 }}><Banner variant="info">{`${noEarnCategories.find((x) => x.id === categoryId)?.name ?? "This category"} doesn't earn ${program?.terminology ?? "points"}.`}</Banner></View> : null}
          {chipsFor.length > 0 ? (
            <View style={{ marginTop: 36 }}>
              {/* Canvas: +1 / +2 / +3 pick how many for this visit; the big button awards them in one tap. */}
              <QuantityChips values={[1, ...chipsFor]} value={q} onChange={setQty} unit={program?.terminology ?? "stamps"} />
              <Text style={{ fontSize: 12, lineHeight: 16, marginTop: 10, textAlign: "center" }} rawColor={c.fgSubtle}>
                {stamps ? "One per drink in this order" : "One per item in this order"}
              </Text>
            </View>
          ) : null}
          {state.error ? <View style={{ marginTop: 12 }}><Banner variant="danger">{state.error}</Banner></View> : null}
          <View style={styles.bottom}>
            <AwardButton label={mainLabel} loading={state.submitting} disabled={programPaused || (perDollar && state.amountCents === 0 && !categoryId) || (vertical === "pharmacy" && !!categoryId)} onPress={() => award(q)} />
            <View style={styles.row}>
              {member ? (
                <CounterSecondary
                  label={canRedeem ? "Redeem" : needs ? `Redeem · needs ${needs}` : "Redeem"}
                  accessibilityLabel={canRedeem ? "Redeem" : `Redeem, needs ${needs ?? ""}`}
                  disabled={!canRedeem}
                  onPress={() => setRedeemOpen(true)}
                />
              ) : (
                <CounterSecondary label="Cancel" onPress={reset} />
              )}
              <CounterSecondary label="Enter code" onPress={() => setCodeOpen(true)} />
            </View>
          </View>
        </View>
      );
    }
    return wide ? <EmptyState icon={Search} title={t("empty.counter")} /> : null;
  })();

  const leftPane = idleStep ? (phoneMode ? entryPane : scanPane) : state.step === "customer" && perDollar ? entryPane : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "bottom"]} onTouchStart={touch}>
      <CounterHeader
        title={config.merchantName ?? config.locationName ?? "Counter"}
        subtitle={(() => {
          // "counter · 412 Roncesvalles" (canvas): the street address without its "Ave", else the location's name.
          const where = config.locationAddress?.replace(/\s+(Ave|Avenue|St|Street|Rd|Road|Blvd)\.?$/i, "") ?? (config.locationName !== config.merchantName ? config.locationName : null);
          return where ? `counter · ${where}` : "counter";
        })()}
        staff={staff}
        canSwitch={config.sharedDevice}
        onStaff={() => router.push("/counter/pin")}
        onMenu={() => setMenuOpen(true)}
      />
      <View style={styles.banners}>
        <OfflineBanner mode="counter" online={online} pending={queuedForCount} sentJustNow={ctx.sentJustNow} stale={queueState.stale} retrying={queueState.flushing} onPress={() => setQueueOpen(true)} />
        {queueState.failedCount > 0 ? (
          <Banner variant="danger" onPress={() => setQueueOpen(true)}>{`${queueState.failedCount} ${queueState.failedCount === 1 ? "award needs" : "awards need"} attention. Tap to see.`}</Banner>
        ) : null}
        {programPaused ? <Banner variant="neutral">{t("err.award.programPaused")}</Banner> : null}
        {lastStamp ? <UndoToast at={lastStamp.at} name={lastStamp.name} time={formatTime(lastStamp.at)} busy={undoBusy} onUndo={() => void undoLast()} /> : null}
      </View>

      {wide ? (
        <View style={[styles.wide]}>
          <View style={{ flex: 4 }}>{leftPane}</View>
          <View style={{ flex: 6, gap: 16 }}>
            <View style={{ flex: 1 }}>{customerPane}</View>
            <RecentStrip recent={recent} onUndo={undoRecent} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: state.step === "customer" ? 20 : layout.gutterMobile, paddingBottom: state.step === "customer" ? 30 : layout.gutterMobile, gap: 16, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {!idleStep || panel ? customerPane : null}
          {!panel ? leftPane : null}
          {state.step === "entry" && !phoneMode ? null : state.step === "entry" ? <RecentStrip recent={recent.slice(0, 1)} onUndo={undoRecent} /> : null}
        </ScrollView>
      )}

      <QueueSheet visible={queueOpen} onClose={() => setQueueOpen(false)} state={queueState} online={online} onRetry={() => void flush(true)} onDismiss={(id) => void queue.remove(id)} />
      <RewardPicker
        visible={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        member={redeemMember}
        rewards={activeRewards}
        onConfirm={redeem}
        busy={redeemBusy}
        error={redeemError}
        online={online}
      />
      <Sheet
        visible={codeOpen}
        onClose={() => {
          setCodeOpen(false);
          setCodeError(null);
        }}
        title="Customer's reward code"
        footer={
          <Button size="counter" loading={codeBusy} disabled={normalizeRedeemInput(code).length < 4 || !online} onPress={() => verifyCode(code)}>
            Confirm
          </Button>
        }
      >
        {!online ? <Banner variant="warning">{t("err.redeem.offline")}</Banner> : null}
        <View style={[styles.codeField, { borderColor: codeError ? c.negative : c.lineStrong, backgroundColor: c.bg }]}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(normalizeRedeemInput(v))}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={8}
            placeholder="K7Q2XM"
            placeholderTextColor={c.fgSubtle}
            accessibilityLabel="Reward code"
            onSubmitEditing={() => verifyCode(code)}
            style={[typo("code"), { color: c.fg, textAlign: "center", flex: 1, minWidth: 0 }]}
          />
        </View>
        {codeError ? <Banner variant="danger">{codeError}</Banner> : null}
        <Button variant="ghost" iconStart={Camera} onPress={() => { setCodeOpen(false); router.push("/counter/scan"); }}>
          Scan the code instead
        </Button>
      </Sheet>
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Counter">
        <ListRow title="Today" subtitle="Visits, points and redemptions" chevron minHeight={64} onPress={() => { setMenuOpen(false); router.push("/counter/today"); }} />
        <ListRow title="Waiting to send" subtitle={queueState.pendingCount === 0 ? "Everything's sent" : `${queueState.pendingCount} ${queueState.pendingCount === 1 ? "award" : "awards"} saved on this phone`} chevron minHeight={64} onPress={() => { setMenuOpen(false); setQueueOpen(true); }} />
        {restaurantTools.kds ? <ListRow title="Kitchen" subtitle="Tickets by station, tap to advance, bump" chevron minHeight={64} onPress={() => { setMenuOpen(false); router.push("/counter/kitchen"); }} /> : null}
        {restaurantTools.order ? <ListRow title="Take payment" subtitle="Ring up an order, cash or card" chevron minHeight={64} onPress={() => { setMenuOpen(false); router.push("/counter/order"); }} /> : null}
        <ListRow title="Counter settings" subtitle="Theme, kiosk, scanner" chevron minHeight={64} onPress={() => { setMenuOpen(false); router.push("/counter/settings"); }} />
        <ListRow title="Switch location" subtitle={config.locationName ?? "Pick the shop and location"} chevron minHeight={64} onPress={() => { setMenuOpen(false); router.push("/counter/select"); }} />
        {config.sharedDevice ? <ListRow title="Lock (switch staff)" chevron minHeight={64} divider={false} onPress={() => { setMenuOpen(false); ctx.lockStaff(); router.replace("/counter/pin"); }} /> : null}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  bottom: { marginTop: "auto", paddingTop: 24, gap: 10 },
  wide: { flex: 1, flexDirection: "row", gap: 24, padding: 24 },
  banners: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  nameField: { minHeight: 64, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, justifyContent: "center", flexDirection: "row", alignItems: "center" },
  codeField: { minHeight: 72, borderRadius: 12, borderWidth: 2, paddingHorizontal: 12, flexDirection: "row", alignItems: "center" },
});
