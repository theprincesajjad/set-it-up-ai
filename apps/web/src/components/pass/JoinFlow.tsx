"use client";
/**
 * No-download join from the counter QR (customer-web-pass.md §1, network.md
 * "No-download join"): phone → code → name + CASL consent → joined.
 * Target: under 30 seconds on a 3-year-old phone. One page, state kept in memory.
 */
import { WalletButtons } from "./WalletButtons";
import { BRAND } from "@ll/shared";
import Link from "next/link";
import { LogoMark } from "@/components/site/Brand";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { alsoEarning, joinHeadline, joinIntro } from "@/lib/joinCopy";
import { placeKind } from "@/lib/place";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { authApi, customerApi, networkApi, walletApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { isApiError, errorMessage } from "@/lib/api/errors";
import { firstName, formatPoints } from "@/lib/format";
import { formatE164, toE164, validateNanp, PHONE_ERRORS } from "@/lib/phone";
import { howYouEarn } from "@/lib/program";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConsentCheckbox } from "@/components/ui/Checkbox";
import { MemberQr } from "@/components/ui/MemberQr";
import { OtpField } from "@/components/ui/OtpField";
import { PhoneField } from "@/components/ui/PhoneField";
import { PointsRing } from "@/components/ui/PointsRing";
import { ShopLogo, ShopTile } from "@/components/ui/ShopTile";
import { StampCard } from "@/components/ui/StampCard";
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
  nearby: (q) => browserApi.network.shops(q),
};

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
}

const RESEND_SECONDS = 30;

export function JoinFlow({ info, referralCode, signedIn, signedInName, devAutofill, merchantId, showHeader = true, autoFocus = true, deps = defaultJoinDeps, appStoreUrl, playStoreUrl, street, alsoHere }: JoinFlowProps) {
  const shop = info.merchant.name;
  const program = info.program;
  const consentText = copy.consent.merchant(shop);

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
  useEffect(() => {
    if (step !== "phone") headingRef.current?.focus();
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
      setError(PHONE_ERRORS[validateNanp(digits) === "invalid" ? "invalid" : "incomplete"]);
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
      if (isApiError(err) && err.status === 429) setBanner(copy.err.otpTooMany);
      else if (isApiError(err) && err.status === 400) setError(PHONE_ERRORS.invalid);
      else if (isApiError(err) && err.status === 404) setBanner(copy.err.qrInvalid);
      else setBanner(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(c = code) {
    if (busy) return;
    setError(null);
    setBanner(null);
    if (!/^\d{6}$/.test(c)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const r = await deps.verifyOtp({ phone: e164!, code: c });
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
      if (isApiError(err) && err.status === 429) setError(copy.err.otpTooMany);
      else if (isApiError(err) && err.code === "invalid_code") {
        const left = (err.details as { attemptsLeft?: number } | undefined)?.attemptsLeft;
        setError(/expire|used/i.test(err.message) ? "That code expired. Tap Resend code for a new one." : left !== undefined ? `${copy.err.otpWrong} ${left} ${left === 1 ? "try" : "tries"} left.` : copy.err.otpWrong);
      } else setError(errorMessage(err));
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
      setBanner(isApiError(err) && err.status === 404 ? copy.err.qrInvalid : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    if (needsName && !name.trim()) {
      setError(copy.err.required("First name"));
      return;
    }
    await doJoin(consent, needsName ? name.trim() : null);
  }

  if (step === "joined" && result) {
    return <Joined info={info} result={result} name={userName} deps={deps} appStoreUrl={appStoreUrl} playStoreUrl={playStoreUrl} />;
  }

  const consentBox = (
    <ConsentCheckbox
      version={copy.consent.merchantVersion}
      text={consentText}
      checked={consent}
      onChange={setConsent}
      size="sm"
      // CASL: who is asking and how to stop, shown once they opt in (the label already says "Optional. Unsubscribe any time.").
      caption={consent ? copy.consent.merchantCaption(shop, info.location.address, info.location.phone ? formatE164(info.location.phone) : "") : undefined}
    />
  );

  // The counter-QR join (canvas Join.dc.html): brand row, shop, a lowercase headline, +1 phone, optional consent,
  // black "Text me a code", the privacy line, and "Also earning here…" pinned to the bottom.
  if (showHeader && step === "phone") {
    const also = alsoHere ? alsoEarning(alsoHere.verticals.map((vertical) => ({ vertical })), alsoHere.total) : null;
    return (
      <div className="-mx-4 -mt-4 flex min-h-[calc(100dvh-1px)] flex-col px-6 pt-[52px] pb-[30px]">
        <div className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="display text-[15px] leading-[18px] text-fg">{BRAND.name.toLowerCase()}</span>
        </div>
        <div className="mt-11 flex items-center gap-3">
          <ShopLogo shop={info.merchant} size={52} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-5 text-fg">{shop}</p>
            <p className="truncate text-[13px] italic leading-[17px] text-fg-muted">{[placeKind(info.merchant.vertical), street?.name.toLowerCase() ?? info.location.address].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <h1 className="display mt-5 text-[32px] leading-[35px] tracking-[-0.01em] text-fg">{joinHeadline(program, info.merchant.vertical)}</h1>
        <p className="mt-2.5 text-[15px] leading-[21px] text-fg-muted">{joinIntro(program, info.rewards[0] ?? null, street ?? null)}</p>
        {banner ? <Banner tone="warning" className="mt-4">{banner}</Banner> : null}
        <form onSubmit={sendCode} noValidate className="mt-7 flex flex-col">
          <PhoneField size="lg" autoFocus={autoFocus} value={digits} onChangeDigits={(d) => { setDigits(d); if (error) setError(null); }} error={phoneTried ? error : null} forceValidate={false} />
          <div className="mt-[18px]">{consentBox}</div>
          <Button type="submit" size="lg" fullWidth loading={busy} className="mt-6 h-[54px] text-[16px]">
            {copy.action.textMeCode}
          </Button>
        </form>
        <p className="mt-3.5 text-center text-[12px] leading-[17px] text-fg-subtle">
          We only use your number for your card.{" "}
          <Link href="/legal/rewards" className="text-fg-muted underline">Rewards terms</Link> · <Link href="/legal/privacy" className="text-fg-muted underline">Privacy</Link>
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

  return (
    <div className="flex flex-col gap-6">
      {showHeader ? (
        <header className="flex items-center gap-3.5 pt-2">
          <ShopLogo shop={info.merchant} size={56} />
          <div className="min-w-0">
            <p className="truncate text-headline text-fg">{shop}</p>
            <p className="truncate text-meta italic text-fg-muted">{[placeKind(info.merchant.vertical), info.location.name !== shop ? info.location.name : info.location.address].filter(Boolean).join(" · ")}</p>
          </div>
        </header>
      ) : null}

      {banner ? <Banner tone="warning">{banner}</Banner> : null}

      {step === "phone" ? (
        <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="display text-title text-fg">{joinHeadline(program, info.merchant.vertical)}</h2>
            <p className="text-body text-fg-muted">{joinIntro(program, info.rewards[0] ?? null, street ?? null)}</p>
          </div>
          <PhoneField autoFocus={autoFocus} value={digits} onChangeDigits={(d) => { setDigits(d); if (error) setError(null); }} error={phoneTried ? error : null} forceValidate={false} />
          {consentBox}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            {copy.action.textMeCode}
          </Button>
          <p className="text-center text-meta text-fg-muted">No app needed. Free. We&apos;ll text you a 6-digit code.</p>
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
            Enter your code
          </h1>
          <p className="-mt-2 text-body text-fg-muted">
            We texted a code to <span className="font-semibold text-fg tabular-nums">{formatPhone(digits)}</span>.{" "}
            <button type="button" className="font-semibold text-fg underline underline-offset-2" onClick={() => { setStep("phone"); setCode(""); setError(null); }}>
              Change
            </button>
          </p>
          <OtpField value={code} onChange={(v) => { setCode(v); if (error) setError(null); }} onComplete={(c) => void verify(c)} error={error} disabled={busy} />
          {devCode && devAutofill ? <p className="text-meta text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Continue
          </Button>
          <div className="flex flex-col items-start gap-1">
            <Button variant="ghost" size="sm" disabled={resendIn > 0 || busy} onClick={resend} className="-ms-3">
              {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, "0")}` : copy.action.resend}
            </Button>
            {resendIn === 0 ? <p className="text-meta text-fg-muted">Still nothing? Ask staff to add your number at the counter.</p> : null}
          </div>
        </form>
      ) : null}

      {step === "details" || step === "joining" ? (
        <form onSubmit={submitDetails} noValidate className="flex flex-col gap-5">
          <h1 ref={headingRef} tabIndex={-1} className="display text-large-title text-fg outline-none">
            {needsName ? "Almost done" : copy.ok.welcomeBack(name)}
          </h1>
          {needsName ? (
            <TextField label="First name" autoComplete="given-name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(null); }} error={error} maxLength={60} autoFocus />
          ) : null}
          {/* Consent was offered on the first step; visitors who were already signed in skipped it. */}
          {signedIn ? consentBox : null}
          <Button type="submit" size="lg" fullWidth loading={busy || step === "joining"}>
            {copy.action.join(shop)}
          </Button>
          {program ? <p className="text-meta text-fg-muted">{howYouEarn(program)} {program.expiryDisclosure}</p> : null}
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
  const m = result.membership;
  const program = m.program;
  const [card, setCard] = useState<customerApi.CardResponse | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState<"apple" | "google" | null>(null);
  const [nearby, setNearby] = useState<networkApi.ShopListItemDto[]>([]);
  // Only rendered after the join completes (never server-rendered), so reading the UA here is safe.
  const [os] = useState<"ios" | "android" | "other">(platform);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [available, setAvailable] = useState<{ apple?: boolean; google?: boolean }>({});

  useEffect(() => {
    headingRef.current?.focus();
    // Hide a wallet the server can't issue yet (GET /v1/me/wallet → apple/google.available).
    deps
      .wallet()
      .then((s) => setAvailable({ apple: s.apple.available, google: s.google.available }))
      .catch(() => undefined);
    deps.card().then(setCard).catch(() => undefined);
    const { lat, lng } = info.location;
    if (lat != null && lng != null)
      deps
        .nearby({ lat, lng, radiusMetres: 2000, limit: 7 })
        .then((r) => setNearby(r.items.filter((s) => s.merchant.id !== info.merchant.id).slice(0, 6)))
        .catch(() => undefined);
  }, [deps, info]);

  async function google() {
    setWalletError(null);
    setWalletBusy("google");
    try {
      const r = await deps.googleWallet();
      window.location.href = r.saveUrl;
    } catch {
      setWalletError("Wallet passes aren't available right now. Your card below works at the counter.");
    } finally {
      setWalletBusy(null);
    }
  }

  async function apple() {
    setWalletError(null);
    setWalletBusy("apple");
    try {
      const s = await deps.wallet();
      if (s.apple.available && s.apple.downloadUrl) window.location.href = s.apple.downloadUrl;
      else setWalletError("Wallet passes aren't available right now. Your card below works at the counter.");
    } catch {
      setWalletError("Wallet passes aren't available right now. Your card below works at the counter.");
    } finally {
      setWalletBusy(null);
    }
  }

  const fname = firstName(name);
  const bonus = result.bonusPoints > 0 ? formatPoints(result.bonusPoints, m.terminology, false) : null;
  const goal = m.nextReward?.pointsCost ?? program?.stampGoal ?? 0;

  return (
    <div className="flex flex-col gap-7 pt-2">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <ShopLogo shop={info.merchant} size={40} />
          <p className="min-w-0 truncate text-meta text-fg-muted">{info.merchant.name}</p>
        </div>
        <div className="flex flex-col gap-1">
          <h1 ref={headingRef} tabIndex={-1} className="display text-large-title text-fg outline-none" role="status">
            {bonus && !fname ? copy.ok.joinedBonus(bonus, info.merchant.name) : fname ? copy.ok.joined(fname) : "You're in."}
          </h1>
          {bonus && fname ? (
            <p className="text-body text-fg-muted">
              {bonus} added at {info.merchant.name.replace(/\.$/, "")}.
            </p>
          ) : null}
        </div>
        {program?.earnType === "stamps" ? (
          <StampCard stamps={m.balance} goal={program.stampGoal} rewardName={m.nextReward?.name ?? "reward"} vertical={info.merchant.vertical} newlyEarned={Array.from({ length: result.bonusPoints }, (_, i) => i)} className="w-full" terminology={m.terminology} />
        ) : (
          <div className="flex items-center gap-4 rounded-card border border-line p-4">
            <PointsRing balance={m.balance} goal={goal} terminology={m.terminology} size={64} showCaption={false} />
            <div className="min-w-0">
              <p className="display text-title tabular-nums text-accent-text">{formatPoints(m.balance, m.terminology, false)}</p>
              {m.nextReward ? <p className="text-meta text-fg-muted">{copy.misc.stampsToGo(m.nextReward.pointsNeeded, m.nextReward.name)}</p> : null}
            </div>
          </div>
        )}
        <p className="text-meta text-fg-muted">{m.expiryDisclosure}</p>
      </div>

      <section aria-label="Your card" className="flex flex-col items-center gap-3 rounded-card border border-line px-4 py-6">
        <p className="text-body-strong text-fg">Show this to staff</p>
        {card ? <MemberQr memberCode={card.memberCode} svg={card.qrSvg} size={220} caption="Turn your brightness up so it scans first time." /> : <div className="skeleton aspect-square w-[240px] rounded-card" aria-busy="true" />}
      </section>

      <div className="flex flex-col gap-2">
        {walletError ? <Banner tone="neutral">{walletError}</Banner> : null}
        <WalletButtons os={os} onApple={apple} onGoogle={google} busy={walletBusy} available={available} />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-meta">
          <span className="text-fg-muted">{copy.action.getTheApp}</span>
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
          <a className="font-semibold text-fg" href="/me">
            My card on the web
          </a>
        </div>
      </div>

      {nearby.length ? (
        <section aria-labelledby="also-on" className="flex flex-col gap-3">
          <h2 id="also-on" className="text-headline text-fg">
            Also on your card nearby
          </h2>
          <ul className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1">
            {nearby.map((s) => (
              <li key={s.merchant.id} className="flex w-60 shrink-0 snap-start">
                <ShopTile className="h-full w-full" variant="compact" href={`/shops/${s.merchant.slug}`} shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
