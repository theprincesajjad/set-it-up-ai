"use client";
/**
 * No-download join from the counter QR (customer-web-pass.md §1, network.md
 * "No-download join"): phone → code → name + CASL consent → joined.
 * Target: under 30 seconds on a 3-year-old phone. One page, state kept in memory.
 */
import { ShopWalletCard } from "./ShopWalletCard";
import { Reveal } from "./Reveal";
import { BrandMark, BrandPassCard, MiniStamps } from "./ShopBrand";
import { BRAND, placeKindLabel, t as translate } from "@ll/shared";
import Link from "next/link";
import { LogoMark } from "@/components/site/Brand";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { alsoEarningT, joinHeadlineT, joinIntroT, stampsToGoT, unitText } from "@/lib/joinCopy";
import { placeKind } from "@/lib/place";
import { saveOfflineCard } from "@/lib/offlineCard";
import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Celebration } from "@/components/ui/Celebrate";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { authApi, customerApi, networkApi, walletApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { otpErrorMessage } from "@/lib/auth/otpErrors";
import { rememberLocale, saveProfileLocale, useLocaleOrEnglish } from "@/lib/i18n/client";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { firstName, formatNumber, formatPoints, unitFor, withArticle } from "@/lib/format";
import { unitCaption } from "@/lib/units";
import { formatE164, normalizeDigits, toE164, validateNanp } from "@/lib/phone";
import { rewardNameIn } from "@/lib/i18n/rewardName";
import { expiryLineL, howYouEarnL } from "@/lib/i18n/formatL";
import { formatCurrency } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConsentCheckbox } from "@/components/ui/Checkbox";
import { MemberQr } from "@/components/ui/MemberQr";
import { OtpField } from "@/components/ui/OtpField";
import { StepProgress } from "@/components/ui/StepProgress";
import { PhoneField } from "@/components/ui/PhoneField";
import { ShopTile } from "@/components/ui/ShopTile";
import { StampCard } from "@/components/ui/StampCard";
import { stampCardNumbers } from "@/lib/stamps";
import { TextField } from "@/components/ui/TextField";

/** Everything the flow needs from the network, injectable for tests. */
export interface JoinDeps {
  /** Shop-page joins (no QR): plain phone OTP. */
  otpStart: (phone: string) => Promise<{ sent: true; expiresInSeconds: number; devCode?: string }>;
  joinStart: (qrCode: string, body: networkApi.PublicJoinBody) => Promise<networkApi.PublicJoinResponse>;
  verifyOtp: (body: { phone: string; code: string; name?: string }) => Promise<{ user: authApi.AuthUserDto; created: boolean }>;
  updateName: (name: string) => Promise<unknown>;
  join: (body: customerApi.JoinBody) => Promise<customerApi.JoinResponse>;
  card: () => Promise<customerApi.CardResponse>;
  wallet: () => Promise<walletApi.WalletStatusResponse>;
  googleWallet: () => Promise<walletApi.GoogleSaveResponse>;
  /** The shop's own card (shop name, colour, stamps): what the join success screen offers. */
  shopWallet: (merchantId: string) => Promise<walletApi.ShopWalletResponse>;
  nearby: (q: Partial<networkApi.ShopsQuery>) => Promise<networkApi.ShopsResponse>;
}

export const defaultJoinDeps: JoinDeps = {
  otpStart: (phone) => browserApi.auth.otpStart(phone),
  joinStart: (qr, body) => browserApi.public.joinStart(qr, body),
  verifyOtp: (body) => sessionApi.verifyOtp(body),
  updateName: (name) => browserApi.me.updateProfile({ name }),
  join: (body) => browserApi.me.join(body),
  card: () => browserApi.me.card(),
  wallet: () => browserApi.me.wallet(),
  googleWallet: () => browserApi.me.googleWallet(),
  shopWallet: (merchantId) => browserApi.me.shopWallet(merchantId),
  nearby: (q) => browserApi.network.shops(q),
};

// Only the join success screen shows it: its own chunk, fetched after the join.
const CardCarousel = dynamic(() => import("@/components/ui/CardCarousel").then((m) => m.CardCarousel), { ssr: false });

export type JoinStep = "phone" | "code" | "details" | "joining" | "joined";

export interface JoinFlowProps {
  info: networkApi.JoinInfoResponse;
  /** ?ref= referral code, passed through to POST /v1/me/memberships. */
  referralCode?: string | null;
  /** Already signed in (cookie session): skip phone + code. */
  signedInName?: string | null;
  signedIn?: boolean;
  /** Fill the OTP with the API's devCode (non-production only). */
  devAutofill?: boolean;
  /** Network shop count for the offer line. */
  networkShops?: number;
  /** Join by merchant id instead of the counter QR (public shop page, join source "web"). */
  merchantId?: string;
  /** Show the shop header (off when the page already shows the shop). */
  showHeader?: boolean;
  autoFocus?: boolean;
  deps?: JoinDeps;
  /** Listing links; a store whose link is not configured shows no button (a store's front page has nothing to install). */
  appStoreUrl?: string | null;
  playStoreUrl?: string | null;
  /** The shop's street and how many shops take the card there ("Your card works at 16 shops on Roncesvalles"). */
  street?: { name: string; shopCount: number } | null;
  /** Nearby shops of other kinds for the "Also earning here…" footer (canvas Join). */
  alsoHere?: { verticals: string[]; total: number } | null;
  /** Rendered under the brand row of the counter-QR page (the language switcher). */
  topSlot?: ReactNode;
  /** A signed-in customer who already has this shop's card: the flow opens on their card ("Welcome back"), never on "Join". */
  member?: customerApi.MembershipDto | null;
}

const RESEND_SECONDS = 30;
/** How long a texted code stays good on our side of the screen (the API's own window is the same order of size). */
const CODE_VALID_SECONDS = 300;
const joinKey = (qr: string) => `ll.join.${qr}`;

/** The clock, read only inside event handlers and effects (never while rendering). */
const nowMs = () => Date.now();

export function JoinFlow({ info, referralCode, signedIn, signedInName, devAutofill, merchantId, showHeader = true, autoFocus = true, deps = defaultJoinDeps, appStoreUrl, playStoreUrl, street, alsoHere, topSlot, member }: JoinFlowProps) {
  const { t, rich, locale } = useLocaleOrEnglish();
  const shop = info.merchant.name;
  const program = info.program;
  // CASL: the sentence the customer reads is the sentence we send. Unisolated (no bidi marks) for the stored record, `t` for display.
  const unit = unitCaption(locale, 2, program?.terminology ?? "points");
  const consentText = translate(locale, "auth.consent.merchant", { shop, unit });

  const [step, setStep] = useState<JoinStep>(member ? "joined" : signedIn ? "details" : "phone");
  const [digits, setDigits] = useState("");
  const [phoneTried, setPhoneTried] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [name, setName] = useState(signedInName ? firstName(signedInName) : "");
  const [needsName, setNeedsName] = useState(!signedInName);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [result, setResult] = useState<customerApi.JoinResponse | null>(member ? { membership: member, created: false, bonusPoints: 0, referral: null } : null);
  const [userName, setUserName] = useState<string | null>(signedInName ?? null);

  // The step's heading is announced (not focused): focusing it closed the phone keyboard and took the caret out of the code and name fields.
  const standalone = !signedIn && !member && showHeader;
  // The last number a code went to and when: "Change" then the same number again does not ask the server for a second text.
  const sentRef = useRef<{ e164: string; at: number } | null>(null);
  const storeKey = joinKey(info.qrCode);
  const [restored, setRestored] = useState(false);

  // A refresh in the middle keeps the number, the consent tick and the code step (never the code itself).
  useEffect(() => {
    try {
      const raw = signedIn || member ? null : window.sessionStorage.getItem(storeKey);
      const saved = raw ? (JSON.parse(raw) as { digits?: string; consent?: boolean; step?: string; sentAt?: number | null }) : null;
      if (saved) {
        const d = typeof saved.digits === "string" ? normalizeDigits(saved.digits) : "";
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (d) setDigits(d);
        if (saved.consent === true) setConsent(true);
        const at = typeof saved.sentAt === "number" ? saved.sentAt : null;
        const phone = toE164(d);
        if (saved.step === "code" && at && phone && nowMs() - at < CODE_VALID_SECONDS * 1000) {
          sentRef.current = { e164: phone, at };
          setResendIn(Math.max(0, RESEND_SECONDS - Math.floor((nowMs() - at) / 1000)));
          setStep("code");
        }
      }
    } catch {
      /* storage blocked: the flow works without it */
    }
    setRestored(true);
  }, [storeKey, signedIn, member]);

  useEffect(() => {
    if (!restored || signedIn || member) return;
    try {
      if (step === "phone" || step === "code") window.sessionStorage.setItem(storeKey, JSON.stringify({ digits, consent, step, sentAt: step === "code" ? (sentRef.current?.at ?? null) : null }));
      else if (step === "joined") window.sessionStorage.removeItem(storeKey);
    } catch {
      /* storage blocked */
    }
  }, [restored, signedIn, member, step, digits, consent, storeKey]);

  // Back and Forward move between the number and the code instead of leaving the page.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const wantCode = (e.state as { llJoin?: string } | null)?.llJoin === "code";
      setStep((s) => (s === "code" && !wantCode ? "phone" : s === "phone" && wantCode && sentRef.current && nowMs() - sentRef.current.at < CODE_VALID_SECONDS * 1000 ? "code" : s));
      if (!wantCode) setCode("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function openCodeStep(at: number) {
    sentRef.current = { e164: e164 ?? sentRef.current?.e164 ?? "", at };
    setResendIn(Math.max(0, RESEND_SECONDS - Math.floor((nowMs() - at) / 1000)));
    setStep("code");
    try {
      if ((window.history.state as { llJoin?: string } | null)?.llJoin !== "code") window.history.pushState({ ...(window.history.state ?? {}), llJoin: "code" }, "");
    } catch {
      /* no history API: Back leaves the page, which is the old behaviour */
    }
  }

  function changeNumber() {
    setCode("");
    setError(null);
    // Pop the code entry we pushed so Forward comes back to it; without one, just show the number step.
    if ((window.history.state as { llJoin?: string } | null)?.llJoin === "code") window.history.back();
    else setStep("phone");
  }

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const e164 = toE164(digits);

  async function sendCode(e?: FormEvent, force = false) {
    e?.preventDefault();
    setPhoneTried(true);
    setError(null);
    setBanner(null);
    if (!e164) {
      setError(t(validateNanp(digits) === "invalid" ? "auth.phone.invalid" : "auth.phone.incomplete"));
      return;
    }
    // Same number, code still good (they tapped "Change" and changed their mind): back to the code step, no second text.
    const prior = sentRef.current;
    if (!force && prior && prior.e164 === e164 && nowMs() - prior.at < CODE_VALID_SECONDS * 1000) {
      setCode("");
      openCodeStep(prior.at);
      return;
    }
    setBusy(true);
    try {
      const r = merchantId ? await deps.otpStart(e164) : await deps.joinStart(info.qrCode, { phone: e164 });
      setDevCode(r.devCode ?? null);
      setCode(devAutofill && r.devCode ? r.devCode : "");
      sentRef.current = { e164, at: nowMs() };
      openCodeStep(sentRef.current.at);
    } catch (err) {
      if (isApiError(err) && err.status === 400) setError(t("auth.phone.invalid"));
      else if (isApiError(err) && err.status === 404) setBanner(t("auth.err.qrInvalid"));
      else setBanner(otpErrorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  async function verify(c = code) {
    if (busy) return;
    setError(null);
    setBanner(null);
    if (!/^\d{6}$/.test(c)) {
      setError(t("auth.otp.enter"));
      return;
    }
    setBusy(true);
    try {
      const r = await deps.verifyOtp({ phone: e164!, code: c });
      rememberLocale(locale);
      void saveProfileLocale(locale);
      setUserName(r.user.name);
      const hasName = !!r.user.name?.trim();
      setNeedsName(!hasName);
      if (hasName) setName(firstName(r.user.name));
      if (!r.created && hasName) {
        // Returning member: straight to joined, with the consent they ticked (or not) on the first step.
        await doJoin(consent, null, true);
        return;
      }
      setStep("details");
    } catch (err) {
      // Only a wrong, used or locked code is cleared; a server fault, a rate limit or no signal keeps the six digits they typed.
      const theirs = isApiError(err) && err.status >= 400 && err.status < 500 && err.status !== 429;
      const closed = isApiError(err) && ((err.status === 429 && /wrong codes|new one/i.test(err.message)) || (err.code === "invalid_code" && /expire|used/i.test(err.message)));
      if (theirs || closed) setCode("");
      // "Tap Resend code for a new one" has to be true: a closed or expired code makes the button live.
      if (closed) setResendIn(0);
      setError(otpErrorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setCode("");
    await sendCode(undefined, true);
  }

  async function doJoin(withConsent: boolean, newName: string | null, fromVerify = false) {
    setBusy(true);
    setError(null);
    setBanner(null);
    if (!fromVerify) setStep("joining");
    try {
      if (newName) {
        await deps.updateName(newName).catch(() => undefined);
        setUserName(newName);
      }
      const body: customerApi.JoinBody = merchantId ? { merchantId } : { locationQrCode: info.qrCode };
      if (withConsent) body.consent = { text: consentText };
      if (referralCode) body.referralCode = referralCode;
      const r = await deps.join(body);
      setResult(r);
      setStep("joined");
    } catch (err) {
      setStep("details");
      setBanner(isApiError(err) && err.status === 404 ? t("auth.err.qrInvalid") : otpErrorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    // The name is optional: "30 seconds, no account" should not stop at a text box. The shop sees "No name" until the member adds one.
    await doJoin(consent, needsName && name.trim() ? name.trim() : null);
  }

  if (step === "joined" && result) {
    return <Joined embedded={!showHeader} info={info} result={result} name={userName} deps={deps} appStoreUrl={appStoreUrl} playStoreUrl={playStoreUrl} />;
  }

  const consentBox = (
    <ConsentCheckbox
      version={locale === "en" ? copy.consent.merchantVersion : `${copy.consent.merchantVersion}.${locale}`}
      text={t("auth.consent.merchant", { shop, unit })}
      checked={consent}
      onChange={setConsent}
      size="sm"
      // CASL: who is asking and how to stop, shown once they opt in (the label already says "Optional. Unsubscribe any time.").
      caption={consent ? t("auth.consent.caption", { sender: [shop, info.location.address, info.location.phone ? formatE164(info.location.phone) : ""].filter(Boolean).join(", "), brand: BRAND.name }) : undefined}
    />
  );

  // The counter-QR join (canvas Join.dc.html): brand row, shop, a lowercase headline, +1 phone, optional consent,
  // black "Text me a code", the privacy line, and "Also earning here…" pinned to the bottom.
  if (showHeader && step === "phone") {
    const also = alsoHere ? alsoEarningT(t, locale, alsoHere.verticals.map((vertical) => ({ vertical })), alsoHere.total) : null;
    return (
      <div className="-mx-4 -mt-4 flex min-h-[calc(100dvh-1px)] flex-col px-6 pt-10 pb-[30px]">
        {/* wave-p: the language switch sits on the brand row (it floated alone between the row and the card before). */}
        <div className="flex min-h-11 items-center gap-2">
          <LogoMark size={22} />
          <span className="display text-[15px] leading-[18px] text-fg">{BRAND.name.toLowerCase()}</span>
          {topSlot ? <div className="ms-auto">{topSlot}</div> : null}
        </div>
        {/* The shop's card, in its colour, before anything is asked: what the customer is about to carry. */}
        <BrandPassCard as="div" shop={info.merchant} className="mt-7" kicker={[locale === "en" ? placeKind(info.merchant.vertical) : placeKindLabel(locale, info.merchant.vertical), street?.name.toLowerCase() ?? info.location.address].filter(Boolean).join(" · ")}>
          {program?.earnType === "stamps" ? <MiniStamps goal={program.stampGoal} /> : null}
        </BrandPassCard>
        <h1 className="display mt-5 text-[32px] leading-[35px] tracking-[-0.01em] text-fg">{joinHeadlineT(t, locale, program, info.merchant.vertical)}</h1>
        <p className="mt-2.5 text-[15px] leading-[21px] text-fg-muted">{joinIntroT(t, locale, program, info.rewards[0] ?? null, street ?? null)}</p>
        {banner ? <Banner tone="warning" className="mt-4">{banner}</Banner> : null}
        <form onSubmit={sendCode} noValidate className="mt-7 flex flex-col">
          <PhoneField size="lg" autoFocus={autoFocus} value={digits} onChangeDigits={(d) => { setDigits(d); if (error) setError(null); }} error={phoneTried ? error : null} forceValidate={false} />
          <div className="mt-[18px]">{consentBox}</div>
          <Button type="submit" variant="shop" size="lg" fullWidth loading={busy} className="mt-6 h-[54px] text-[16px]">
            {t("auth.join.textMe")}
          </Button>
        </form>
        <p className="mt-3.5 text-center text-[12px] leading-[17px] text-fg-muted">{t("auth.join.numberUse")}</p>
        {/* The two links keep their own centred line, so the separator never starts a line of its own. */}
        <p className="mt-1 flex flex-wrap justify-center gap-x-2 text-center text-[12px] leading-[17px] text-fg-muted">
          <Link href="/legal/rewards" className="inline-flex min-h-11 items-center text-fg-muted underline focus-visible:focus-ring press">{t("auth.footer.rewards")}</Link>
          <span aria-hidden className="inline-flex items-center">·</span>
          <Link href="/legal/privacy" className="inline-flex min-h-11 items-center text-fg-muted underline focus-visible:focus-ring press">{t("auth.footer.privacy")}</Link>
        </p>
        {also ? (
          <div className="mt-auto pt-6">
            <div className="flex items-center gap-2.5 border-t border-line pt-4">
              <div className="flex shrink-0 gap-0.5">
                {alsoHere!.verticals.slice(0, 3).map((v, i) => (
                  <CategoryIcon key={i} vertical={v} size={26} />
                ))}
              </div>
              <span className="text-[13px] leading-[17px] text-fg-muted">{also}</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // wave-p: on the counter-QR page the code and name steps keep the first step's frame (brand row, gutter, the shop in its colour)
  // with a step count, so the three screens read as one short flow rather than a different page each time.
  const stepNo = step === "code" ? 2 : 3;
  // One h1 per page: the shop page that embeds this flow already has the shop's name as its h1.
  const Hn = showHeader ? "h1" : "h2";
  return (
    <div className={showHeader ? "-mx-4 -mt-4 flex min-h-[calc(100dvh-1px)] flex-col gap-6 px-6 pt-10 pb-[30px]" : "flex flex-col gap-6"}>
      {showHeader ? (
        <>
          <div className="flex min-h-11 items-center gap-2">
            <LogoMark size={22} />
            <span className="display text-[15px] leading-[18px] text-fg">{BRAND.name.toLowerCase()}</span>
            {topSlot ? <div className="ms-auto">{topSlot}</div> : null}
          </div>
          <header className="flex items-center gap-3.5 rounded-card bg-trade-soft p-3">
            <BrandMark shop={info.merchant} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-strong text-fg"><bdi>{shop}</bdi></p>
              <p className="truncate text-meta text-fg-muted">{[locale === "en" ? placeKind(info.merchant.vertical) : placeKindLabel(locale, info.merchant.vertical), street?.name.toLowerCase() ?? info.location.address].filter(Boolean).join(" · ")}</p>
            </div>
            {signedIn ? null : <p className="shrink-0 text-caption text-fg-muted tabular-nums" data-testid="join-step">{t("cust.join.step", { n: stepNo, total: 3 })}</p>}
          </header>
          {/* wave-q: the kit StepProgress in the shop's colour under the shop row (phone done, this step half way). */}
          {signedIn ? null : <StepProgress step={stepNo} total={3} label={t("cust.join.step", { n: stepNo, total: 3 })} className="-mt-3" />}
        </>
      ) : null}

      {banner ? <Banner tone="warning">{banner}</Banner> : null}
      {/* The new step is announced; focus stays on the field (the phone keyboard stays up, the caret is in the box). */}
      <p role="status" aria-live="polite" className="sr-only">{step === "code" ? t("auth.join.enterCode") : step === "details" && needsName ? t("cust.join.nameTitle") : ""}</p>

      {step === "phone" ? (
        <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="display text-title text-fg">{joinHeadlineT(t, locale, program, info.merchant.vertical)}</h2>
            <p className="text-body text-fg-muted">{joinIntroT(t, locale, program, info.rewards[0] ?? null, street ?? null)}</p>
          </div>
          <PhoneField autoFocus={autoFocus} value={digits} onChangeDigits={(d) => { setDigits(d); if (error) setError(null); }} error={phoneTried ? error : null} forceValidate={false} />
          {consentBox}
          <Button type="submit" variant="shop" size="lg" fullWidth loading={busy}>
            {t("auth.join.textMe")}
          </Button>
          <p className="text-center text-meta text-fg-muted">{t("auth.join.noApp")}</p>
        </form>
      ) : null}

      {step === "code" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          <Hn className="display text-large-title text-fg">{t("auth.join.enterCode")}</Hn>
          <p className="-mt-2 text-body text-fg-muted [&_bdi]:font-semibold [&_bdi]:text-fg [&_bdi]:tabular-nums">
            {rich("auth.otp.sentTo", { phone: formatPhone(digits) })}{" "}
            <button type="button" className="inline-flex min-h-11 items-center font-semibold text-fg underline underline-offset-2 focus-visible:focus-ring press" onClick={changeNumber}>
              {t("auth.otp.change")}
            </button>
          </p>
          <OtpField tone="trade" value={code} onChange={(v) => { setCode(v); if (error) setError(null); }} onComplete={(c) => void verify(c)} error={error} disabled={busy} />
          {/* l10n-ok: development builds only (the API sends a devCode only outside production) */}
          {devCode && devAutofill ? <p dir="ltr" className="text-meta text-fg-muted text-start">Dev mode: code {devCode} filled in for you.</p> : null}
          <Button type="submit" variant="shop" size="lg" fullWidth loading={busy}>
            {t("auth.join.continue")}
          </Button>
          <div className="flex flex-col items-start gap-1">
            <Button variant="ghost" size="sm" disabled={resendIn > 0 || busy} onClick={resend} className="min-h-11">
              {resendIn > 0 ? t("auth.otp.resendIn", { time: `0:${String(resendIn).padStart(2, "0")}` }) : t("auth.otp.resend")}
            </Button>
            {resendIn === 0 ? <p className="text-meta text-fg-muted">{t("auth.join.stillNothing")}</p> : null}
          </div>
        </form>
      ) : null}

      {step === "details" || step === "joining" ? (
        <form onSubmit={submitDetails} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Hn className="display text-large-title text-fg">
              {needsName ? t("cust.join.nameTitle") : signedIn ? t("cust.join.oneTap", { name }) : t("auth.join.welcomeBack", { name })}
            </Hn>
            {needsName ? <p className="text-body text-fg-muted">{t("cust.join.nameSub", { shop })}</p> : null}
          </div>
          {needsName ? (
            <TextField label={t("auth.join.firstNameOptional")} autoComplete="given-name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(null); }} error={error} maxLength={60} autoFocus={!signedIn} />
          ) : null}
          {/* Consent was offered on the first step; visitors who were already signed in skipped it. */}
          {signedIn ? consentBox : null}
          <Button type="submit" variant="shop" size="lg" fullWidth loading={busy || step === "joining"}>
            {t("auth.join.joinShop", { shop })}
          </Button>
          {program ? <p dir="auto" className="text-meta text-fg-muted">{endSentence(locale, howYouEarnL({ locale, t }, program, formatCurrency(locale, 100)))} {expiryLineL({ locale, t }, { expiryDisclosure: program.expiryDisclosure, terminology: program.terminology, program })}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function formatPhone(d: string) {
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

/** The earn line in hi, ur and pa has no closing stop (the shop page shows it alone); add the script\u2019s own before the next sentence. */
function endSentence(locale: string, text: string): string {
  if (/[.\u0964\u06D4!?]$/.test(text)) return text;
  return text + (locale === "ur" ? "\u06D4" : locale === "hi" || locale === "pa" ? "\u0964" : ".");
}

export function platform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Step 4: show the counter. Balance, member QR, wallet pass, the app, nearby network shops. */
function Joined({ info, result, name, deps, appStoreUrl, playStoreUrl, embedded = false }: { embedded?: boolean; info: networkApi.JoinInfoResponse; result: customerApi.JoinResponse; name: string | null; deps: JoinDeps; appStoreUrl?: string | null; playStoreUrl?: string | null }) {
  const { t, locale } = useLocaleOrEnglish();
  const m = result.membership;
  const program = m.program;
  const [card, setCard] = useState<customerApi.CardResponse | null>(null);
  const [cardFailed, setCardFailed] = useState(false);
  const [nearby, setNearby] = useState<networkApi.ShopListItemDto[]>([]);
  // Server-rendered now too (a member who scans again opens straight on their card), so the phone's kind is read after mount.
  const [os, setOs] = useState<"ios" | "android" | "other">("other");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(platform());
  }, []);
  // Only a store with a configured listing gets a button; with none configured the whole "Get the app" label goes too.
  const showApp = (!!appStoreUrl && os !== "android") || (!!playStoreUrl && os !== "ios");
  const headingRef = useRef<HTMLHeadingElement>(null);
  // One h1 per page: the shop page that embeds this card already has the shop's name as its h1.
  const Title = embedded ? "h2" : "h1";

  const loadCard = useCallback(() => {
    setCardFailed(false);
    deps
      .card()
      .then((c) => {
        setCard(c);
        saveOfflineCard({ code: c.memberCode, qrSvg: c.qrSvg });
      })
      .catch(() => setCardFailed(true));
  }, [deps]);

  useEffect(() => {
    // On the shop page the card sits mid-page: announce it without scrolling the page away from the shop.
    headingRef.current?.focus({ preventScroll: embedded });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCard();
    const { lat, lng } = info.location;
    if (lat != null && lng != null)
      deps
        .nearby({ lat, lng, radiusMetres: 2000, limit: 7 })
        .then((r) => setNearby(r.items.filter((s) => s.merchant.id !== info.merchant.id).slice(0, 6)))
        .catch(() => undefined);
  }, [deps, info, loadCard, embedded]);

  const fname = firstName(name);
  const bonus = result.bonusPoints > 0 ? (locale === "en" ? formatPoints(result.bonusPoints, m.terminology, false) : unitText(t, program, result.bonusPoints)) : null;
  const goal = m.nextReward?.pointsCost ?? program?.stampGoal ?? 0;
  // The shop's own card for this phone's wallet (both + a QR on a computer); hidden or "coming soon" without credentials.
  // A soft panel in the shop's colour around it: Apple's and Google's buttons keep their own black artwork.
  const wallet = <ShopWalletCard merchantId={info.merchant.id} shopName={info.merchant.name} slug={info.merchant.slug} terminology={m.terminology} load={deps.shopWallet} os={os} className="rounded-card bg-trade-soft px-4 py-5" />;

  const stamps = program?.earnType === "stamps";
  // The real goal (2 to 50, never clamped); "n more" counts to the next reward, so a tier below the goal comes first.
  const nums = stamps ? stampCardNumbers(m.balance, program!.stampGoal, m.nextReward?.pointsCost) : null;
  const g = nums?.goal ?? 0;
  const onCard = nums?.onCard ?? 0;
  const nextName = m.nextReward ? rewardNameIn(locale, t, m.nextReward.name) : null;
  const rewardLabel = nextName ?? t("ui.reward").toLowerCase();
  const stampLine = nums ? (nums.toGo <= 0 ? t("ui.stampReady", { reward: rewardLabel }) : t("ui.stampMore", { n: nums.toGo, reward: locale === "en" ? withArticle(rewardLabel.charAt(0).toLowerCase() + rewardLabel.slice(1)) : rewardLabel })) : null;
  const pct = goal > 0 ? Math.min(100, Math.round((m.balance / goal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* wave-q: joining is the moment: one burst in the shop's colours from the card (nothing under reduced motion). */}
      {result.created ? <Celebration origin={{ x: 0.5, y: 0.22 }} tokens={["--trade", "--trade-soft", "--points", "--success"]} delay={350} /> : null}
      <div className="flex flex-col gap-3">
        {/* The pass, in the shop's colour (brand colour, else its trade): the moment they join is the card they now carry. */}
        <BrandPassCard
          shop={info.merchant}
          data-testid="joined-pass"
          aria-label={info.merchant.name}
          kicker={placeKindLabel(locale, info.merchant.vertical)}
          aside={
            stamps ? (
              <span dir="ltr" className="text-[17px] font-semibold tabular-nums [unicode-bidi:isolate]">
                <AnimatedNumber value={onCard} suffix={` / ${formatNumber(g)}`} />
              </span>
            ) : null
          }
        >
          <div className="flex flex-col gap-1">
            <Title ref={headingRef} tabIndex={-1} className="text-[30px] font-bold leading-9 tracking-[-0.022em] outline-none" role="status">
              {!result.created
                ? fname
                  ? t("auth.join.welcomeBack", { name: fname })
                  : t("auth.joined.welcomeBackPlain")
                : bonus && !fname
                  ? t(result.bonusPoints === 1 ? "auth.joined.bonusTitleOne" : "auth.joined.bonusTitle", { bonus, shop: info.merchant.name.replace(/\.$/, "") })
                  : fname
                    ? t("auth.joined.title", { name: fname })
                    : t("auth.joined.plain")}
            </Title>
            {result.created && bonus && fname ? <p className="text-body">{t(result.bonusPoints === 1 ? "auth.joined.bonusLineOne" : "auth.joined.bonusLine", { bonus, shop: info.merchant.name.replace(/\.$/, "") })}</p> : null}
          </div>
          {stamps ? (
            <>
              <StampCard bare frame="plain" tone="onTrade" stamps={m.balance} goal={program!.stampGoal} rewardName={rewardLabel} vertical={info.merchant.vertical} newlyEarned={Array.from({ length: result.bonusPoints }, (_, i) => i)} terminology={m.terminology} />
              <p className="text-body-strong">{stampLine}</p>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[24px] font-semibold leading-8 tabular-nums">{locale === "en" ? <><AnimatedNumber value={m.balance} /> {unitFor(m.terminology, m.balance, false)}</> : unitText(t, program, m.balance)}</p>
              {goal > 0 ? (
                <div role="progressbar" aria-label={t("pass.hero.next")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 w-full overflow-hidden rounded-full bg-trade-pass-text/25">
                  <div className="h-full rounded-full bg-trade-pass-text" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
              {m.nextReward && nextName ? <p className="text-body-strong">{stampsToGoT(t, locale, m.nextReward.pointsNeeded, nextName)}</p> : null}
            </div>
          )}
        </BrandPassCard>
        <p dir="auto" className="px-1 text-meta text-fg-muted">{expiryLineL({ locale, t }, { expiryDisclosure: m.expiryDisclosure, terminology: m.terminology, program })}</p>
      </div>

      {/* On a phone the wallet button comes right under the card, above the fold: it is the one thing to do here. A computer keeps it
          under the member QR, since it brings its own "open on your phone" QR. */}
      {/* Above the fold on a phone and the one thing to do here: no entrance motion on it (kit: never animate above the fold). */}
      {os !== "other" ? wallet : null}

      {/* wave-q: the rest rises in under the card, one after the other (kit BlurFade; shown as is under reduced motion). */}
      <Reveal delay={0.25} still={!result.created}>
        <section aria-label={t("auth.joined.cardLabel")} className="flex flex-col items-center gap-3 rounded-card border border-line bg-card px-4 py-6 shadow-card clear:card-clear clear:border-0">
          <p className="text-body-strong text-fg">{t("auth.joined.showStaff")}</p>
          {card ? (
            <MemberQr memberCode={card.memberCode} svg={card.qrSvg} size={220} caption={t("auth.joined.brightness")} />
          ) : cardFailed ? (
            <div role="alert" className="flex min-h-[240px] w-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-body text-fg">{t("auth.joined.cardFail")}</p>
              <Button variant="secondary" size="md" onClick={loadCard}>{t("sh.act.tryAgain")}</Button>
            </div>
          ) : (
            <div className="skeleton aspect-square w-[240px] rounded-card" aria-busy="true" />
          )}
        </section>
      </Reveal>

      <div className="flex flex-col gap-2">
        {os === "other" ? wallet : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-meta">
          {showApp ? <span className="text-fg-muted">{t("auth.joined.getApp")}</span> : null}
          {appStoreUrl && os !== "android" ? (
            <a className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-fg press" href={appStoreUrl} rel="noopener noreferrer">
              App Store <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ) : null}
          {playStoreUrl && os !== "ios" ? (
            <a className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-fg press" href={playStoreUrl} rel="noopener noreferrer">
              Google Play <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ) : null}
          <Link className="inline-flex min-h-11 items-center font-semibold text-fg press" href="/me">
            {t("auth.joined.myCard")}
          </Link>
        </div>
      </div>

      {info.merchant.vertical === "pet" ? (
        <section aria-label={t("pet.add.cta")} data-testid="join-add-dog" className="flex flex-col gap-2 rounded-card border border-line p-4">
          <p className="text-body text-fg">{t("pet.add.body", { shop: info.merchant.name })}</p>
          <Link className="self-start rounded-pill bg-primary px-4 py-2 text-meta-strong text-primary-foreground shadow-glow focus-visible:focus-ring clear:shadow-none press" href="/me/pets">{t("pet.add.cta")}</Link>
        </section>
      ) : null}

      {nearby.length ? (
        <Reveal delay={0.35} still={!result.created}>
        <div className="flex flex-col gap-3">
          <h2 id="also-on" className="text-headline text-fg">
            {t("auth.joined.nearby")}
          </h2>
          {/* wave-q: the kit's CardCarousel (embla, loaded with this screen): swipe on a phone, arrows and dots on a computer. */}
          <CardCarousel
            label={t("auth.joined.nearby")}
            basis="basis-[72%] sm:basis-1/2"
            items={nearby.map((s) => (
              <ShopTile key={s.merchant.id} className="h-full w-full" variant="compact" href={`/shops/${s.merchant.slug}`} shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} />
            ))}
          />
        </div>
        </Reveal>
      ) : null}
    </div>
  );
}
