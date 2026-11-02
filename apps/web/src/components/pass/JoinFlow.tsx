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
import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Celebration } from "@/components/ui/Celebrate";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { authApi, customerApi, networkApi, walletApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { otpErrorMessage } from "@/lib/auth/otpErrors";
import { rememberLocale, saveProfileLocale, useLocaleOrEnglish } from "@/lib/i18n/client";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { firstName, formatNumber, formatPoints, unitFor, withArticle } from "@/lib/format";
import { unitCaption } from "@/lib/units";
import { formatE164, toE164, validateNanp } from "@/lib/phone";
import { howYouEarn } from "@/lib/program";
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
  appStoreUrl?: string;
  playStoreUrl?: string;
  /** The shop's street and how many shops take the card there ("Your card works at 16 shops on Roncesvalles"). */
  street?: { name: string; shopCount: number } | null;
  /** Nearby shops of other kinds for the "Also earning here…" footer (canvas Join). */
  alsoHere?: { verticals: string[]; total: number } | null;
  /** Rendered under the brand row of the counter-QR page (the language switcher). */
  topSlot?: ReactNode;
}

const RESEND_SECONDS = 30;

export function JoinFlow({ info, referralCode, signedIn, signedInName, devAutofill, merchantId, showHeader = true, autoFocus = true, deps = defaultJoinDeps, appStoreUrl, playStoreUrl, street, alsoHere, topSlot }: JoinFlowProps) {
  const { t, rich, locale } = useLocaleOrEnglish();
  const shop = info.merchant.name;
  const program = info.program;
  // CASL: the sentence the customer reads is the sentence we send. Unisolated (no bidi marks) for the stored record, `t` for display.
  const unit = unitCaption(locale, 2, program?.terminology ?? "points");
  const consentText = translate(locale, "auth.consent.merchant", { shop, unit });

  const [step, setStep] = useState<JoinStep>(signedIn ? "details" : "phone");
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
  const [result, setResult] = useState<customerApi.JoinResponse | null>(null);
  const [userName, setUserName] = useState<string | null>(signedInName ?? null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to the new step's heading when the step changes, never on the first render: a signed-in visitor opens a shop page
  // on the "details" step, and focusing it then scrolled the page past the shop's own header (wave-p).
  const firstStep = useRef(step);
  useEffect(() => {
    if (step !== "phone" && step !== firstStep.current) headingRef.current?.focus();
    firstStep.current = "phone";
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const e164 = toE164(digits);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setPhoneTried(true);
    setError(null);
    setBanner(null);
    if (!e164) {
      setError(t(validateNanp(digits) === "invalid" ? "auth.phone.invalid" : "auth.phone.incomplete"));
      return;
    }
    setBusy(true);
    try {
      const r = merchantId ? await deps.otpStart(e164) : await deps.joinStart(info.qrCode, { phone: e164 });
      setDevCode(r.devCode ?? null);
      setCode(devAutofill && r.devCode ? r.devCode : "");
      setResendIn(RESEND_SECONDS);
      setStep("code");
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
      setCode("");
      setError(otpErrorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setCode("");
    await sendCode();
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
    return <Joined info={info} result={result} name={userName} deps={deps} appStoreUrl={appStoreUrl} playStoreUrl={playStoreUrl} />;
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
        <p className="mt-3.5 text-center text-[12px] leading-[17px] text-fg-muted">
          {t("auth.join.numberUse")}{" "}
          <Link href="/legal/rewards" className="text-fg-muted underline">{t("auth.footer.rewards")}</Link> · <Link href="/legal/privacy" className="text-fg-muted underline">{t("auth.footer.privacy")}</Link>
        </p>
        {also ? (
          <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-4">
            <div className="flex shrink-0 gap-0.5">
              {alsoHere!.verticals.slice(0, 3).map((v, i) => (
                <CategoryIcon key={i} vertical={v} size={26} />
              ))}
            </div>
            <span className="text-[13px] leading-[17px] text-fg-muted">{also}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // wave-p: on the counter-QR page the code and name steps keep the first step's frame (brand row, gutter, the shop in its colour)
  // with a step count, so the three screens read as one short flow rather than a different page each time.
  const stepNo = step === "code" ? 2 : 3;
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
          <h1 ref={headingRef} tabIndex={-1} className="display text-large-title text-fg outline-none">
            {t("auth.join.enterCode")}
          </h1>
          <p className="-mt-2 text-body text-fg-muted [&_bdi]:font-semibold [&_bdi]:text-fg [&_bdi]:tabular-nums">
            {rich("auth.otp.sentTo", { phone: formatPhone(digits) })}{" "}
            <button type="button" className="font-semibold text-fg underline underline-offset-2" onClick={() => { setStep("phone"); setCode(""); setError(null); }}>
              {t("auth.otp.change")}
            </button>
          </p>
          <OtpField tone="trade" value={code} onChange={(v) => { setCode(v); if (error) setError(null); }} onComplete={(c) => void verify(c)} error={error} disabled={busy} />
          {/* l10n-ok: development builds only (the API sends a devCode only outside production) */}
          {devCode && devAutofill ? <p className="text-meta text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
          <Button type="submit" variant="shop" size="lg" fullWidth loading={busy}>
            {t("auth.join.continue")}
          </Button>
          <div className="flex flex-col items-start gap-1">
            <Button variant="ghost" size="sm" disabled={resendIn > 0 || busy} onClick={resend} className="-ms-3">
              {resendIn > 0 ? t("auth.otp.resendIn", { time: `0:${String(resendIn).padStart(2, "0")}` }) : t("auth.otp.resend")}
            </Button>
            {resendIn === 0 ? <p className="text-meta text-fg-muted">{t("auth.join.stillNothing")}</p> : null}
          </div>
        </form>
      ) : null}

      {step === "details" || step === "joining" ? (
        <form onSubmit={submitDetails} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 ref={headingRef} tabIndex={-1} className="display text-large-title text-fg outline-none">
              {needsName ? t("cust.join.nameTitle") : signedIn ? t("cust.join.oneTap", { name }) : t("auth.join.welcomeBack", { name })}
            </h1>
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
          {program ? <p className="text-meta text-fg-muted" {...(locale === "en" ? {} : { lang: "en", dir: "ltr" as const })}>{howYouEarn(program)} {program.expiryDisclosure}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function formatPhone(d: string) {
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

export function platform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Step 4: show the counter. Balance, member QR, wallet pass, the app, nearby network shops. */
function Joined({ info, result, name, deps, appStoreUrl, playStoreUrl }: { info: networkApi.JoinInfoResponse; result: customerApi.JoinResponse; name: string | null; deps: JoinDeps; appStoreUrl?: string; playStoreUrl?: string }) {
  const { t, locale } = useLocaleOrEnglish();
  const m = result.membership;
  const program = m.program;
  const [card, setCard] = useState<customerApi.CardResponse | null>(null);
  const [nearby, setNearby] = useState<networkApi.ShopListItemDto[]>([]);
  // Only rendered after the join completes (never server-rendered), so reading the UA here is safe.
  const [os] = useState<"ios" | "android" | "other">(platform);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    deps.card().then(setCard).catch(() => undefined);
    const { lat, lng } = info.location;
    if (lat != null && lng != null)
      deps
        .nearby({ lat, lng, radiusMetres: 2000, limit: 7 })
        .then((r) => setNearby(r.items.filter((s) => s.merchant.id !== info.merchant.id).slice(0, 6)))
        .catch(() => undefined);
  }, [deps, info]);

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
  const rewardLabel = m.nextReward?.name ?? t("ui.reward").toLowerCase();
  const stampLine = nums ? (nums.toGo <= 0 ? t("ui.stampReady", { reward: rewardLabel }) : t("ui.stampMore", { n: nums.toGo, reward: locale === "en" ? withArticle(rewardLabel.charAt(0).toLowerCase() + rewardLabel.slice(1)) : rewardLabel })) : null;
  const pct = goal > 0 ? Math.min(100, Math.round((m.balance / goal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* wave-q: joining is the moment: one burst in the shop's colours from the card (nothing under reduced motion). */}
      <Celebration origin={{ x: 0.5, y: 0.22 }} tokens={["--trade", "--trade-soft", "--points", "--success"]} delay={350} />
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
            <h1 ref={headingRef} tabIndex={-1} className="text-[30px] font-bold leading-9 tracking-[-0.022em] outline-none" role="status">
              {bonus && !fname ? t("auth.joined.bonusTitle", { bonus, shop: info.merchant.name.replace(/\.$/, "") }) : fname ? t("auth.joined.title", { name: fname }) : t("auth.joined.plain")}
            </h1>
            {bonus && fname ? <p className="text-body">{t("auth.joined.bonusLine", { bonus, shop: info.merchant.name.replace(/\.$/, "") })}</p> : null}
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
              {m.nextReward ? <p className="text-body-strong">{stampsToGoT(t, locale, m.nextReward.pointsNeeded, m.nextReward.name)}</p> : null}
            </div>
          )}
        </BrandPassCard>
        <p className="px-1 text-meta text-fg-muted" {...(locale === "en" ? {} : { lang: "en", dir: "ltr" as const })}>{m.expiryDisclosure}</p>
      </div>

      {/* On a phone the wallet button comes right under the card, above the fold: it is the one thing to do here. A computer keeps it
          under the member QR, since it brings its own "open on your phone" QR. */}
      {/* Above the fold on a phone and the one thing to do here: no entrance motion on it (kit: never animate above the fold). */}
      {os !== "other" ? wallet : null}

      {/* wave-q: the rest rises in under the card, one after the other (kit BlurFade; shown as is under reduced motion). */}
      <Reveal delay={0.25}>
        <section aria-label={t("auth.joined.cardLabel")} className="flex flex-col items-center gap-3 rounded-card border border-line bg-card px-4 py-6 shadow-card clear:card-clear clear:border-0">
          <p className="text-body-strong text-fg">{t("auth.joined.showStaff")}</p>
          {card ? <MemberQr memberCode={card.memberCode} svg={card.qrSvg} size={220} caption={t("auth.joined.brightness")} /> : <div className="skeleton aspect-square w-[240px] rounded-card" aria-busy="true" />}
        </section>
      </Reveal>

      <div className="flex flex-col gap-2">
        {os === "other" ? wallet : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-meta">
          <span className="text-fg-muted">{t("auth.joined.getApp")}</span>
          {os !== "android" ? (
            <a className="inline-flex items-center gap-0.5 font-semibold text-fg" href={appStoreUrl} rel="noopener noreferrer">
              App Store <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ) : null}
          {os !== "ios" ? (
            <a className="inline-flex items-center gap-0.5 font-semibold text-fg" href={playStoreUrl} rel="noopener noreferrer">
              Google Play <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ) : null}
          <Link className="font-semibold text-fg" href="/me">
            {t("auth.joined.myCard")}
          </Link>
        </div>
      </div>

      {info.merchant.vertical === "pet" ? (
        <section aria-label={t("pet.add.cta")} data-testid="join-add-dog" className="flex flex-col gap-2 rounded-card border border-line p-4">
          <p className="text-body text-fg">{t("pet.add.body", { shop: info.merchant.name })}</p>
          <Link className="self-start rounded-pill bg-primary px-4 py-2 text-meta-strong text-primary-foreground shadow-glow focus-visible:focus-ring clear:shadow-none" href="/me/pets">{t("pet.add.cta")}</Link>
        </section>
      ) : null}

      {nearby.length ? (
        <Reveal delay={0.35}>
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
