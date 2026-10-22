"use client";
/**
 * No-download join from the counter QR (customer-web-pass.md §1, network.md
 * "No-download join"): phone → code → name + CASL consent → joined.
 * Target: under 30 seconds on a 3-year-old phone. One page, state kept in memory.
 */
import { Gift, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { authApi, customerApi, networkApi, walletApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { isApiError, errorMessage } from "@/lib/api/errors";
import { firstName, formatPoints } from "@/lib/format";
import { toE164, validateNanp, PHONE_ERRORS } from "@/lib/phone";
import { howYouEarn, welcomeOffer } from "@/lib/program";
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
}

const RESEND_SECONDS = 30;

export function JoinFlow({ info, referralCode, signedIn, signedInName, devAutofill, networkShops, merchantId, showHeader = true, autoFocus = true, deps = defaultJoinDeps, appStoreUrl, playStoreUrl }: JoinFlowProps) {
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
        // Returning member: straight to joined (consent can be given later in Settings).
        await doJoin(false, null, true);
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

  return (
    <div className="flex flex-col gap-5">
      {showHeader ? (
        <header className="flex items-center gap-3">
          <ShopLogo shop={info.merchant} size={56} />
          <div className="min-w-0">
            <p className="truncate text-h2 text-fg">{shop}</p>
            <p className="truncate text-body-sm text-fg-muted">{info.location.name !== shop ? info.location.name : info.location.address}</p>
          </div>
        </header>
      ) : null}
      {program ? (
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-accent-subtle px-3 py-1.5 text-label text-on-accent-subtle">
          <Gift aria-hidden className="size-4" />
          {welcomeOffer(program, networkShops)}
        </p>
      ) : null}

      {banner ? <Banner tone="warning">{banner}</Banner> : null}

      {step === "phone" ? (
        <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
          {showHeader ? <h1 className="text-h1 text-fg">Join in 30 seconds</h1> : <h2 className="text-h2 text-fg">Join in 30 seconds</h2>}
          <PhoneField autoFocus={autoFocus} value={digits} onChangeDigits={(d) => { setDigits(d); if (error) setError(null); }} error={phoneTried ? error : null} forceValidate={false} />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            {copy.action.textMeCode}
          </Button>
          <p className="text-caption text-fg-muted">No app needed. Free. We&apos;ll text you a 6-digit code.</p>
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
          <h1 ref={headingRef} tabIndex={-1} className="text-h1 text-fg outline-none">
            Enter your code
          </h1>
          <p className="text-body text-fg-muted">
            We texted a code to <span className="font-semibold text-fg tabular-nums">{formatPhone(digits)}</span>.{" "}
            <button type="button" className="text-fg-link underline" onClick={() => { setStep("phone"); setCode(""); setError(null); }}>
              Change
            </button>
          </p>
          <OtpField value={code} onChange={(v) => { setCode(v); if (error) setError(null); }} onComplete={(c) => void verify(c)} error={error} disabled={busy} />
          {devCode && devAutofill ? <p className="text-caption text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Continue
          </Button>
          <div className="flex flex-col items-start gap-1">
            <Button variant="ghost" size="sm" disabled={resendIn > 0 || busy} onClick={resend} className="-ms-3">
              {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, "0")}` : copy.action.resend}
            </Button>
            {resendIn === 0 ? <p className="text-caption text-fg-muted">Still nothing? Ask staff to add your number at the counter.</p> : null}
          </div>
        </form>
      ) : null}

      {step === "details" || step === "joining" ? (
        <form onSubmit={submitDetails} noValidate className="flex flex-col gap-5">
          <h1 ref={headingRef} tabIndex={-1} className="text-h1 text-fg outline-none">
            {needsName ? "Almost done" : copy.ok.welcomeBack(name)}
          </h1>
          {needsName ? (
            <TextField label="First name" autoComplete="given-name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(null); }} error={error} maxLength={60} autoFocus />
          ) : null}
          <ConsentCheckbox
            version={copy.consent.merchantVersion}
            text={consentText}
            checked={consent}
            onChange={setConsent}
            caption={copy.consent.merchantCaption(shop, info.location.address, info.location.phone ?? "")}
          />
          <Button type="submit" size="lg" fullWidth loading={busy || step === "joining"}>
            {copy.action.join(shop)}
          </Button>
          {program ? <p className="text-caption text-fg-muted">{howYouEarn(program)} {program.expiryDisclosure}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function formatPhone(d: string) {
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

function platform(): "ios" | "android" | "other" {
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
  const showApple = os !== "android";
  const showGoogle = os !== "ios";
  const goal = m.nextReward?.pointsCost ?? program?.stampGoal ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 ref={headingRef} tabIndex={-1} className="text-h2 text-fg outline-none" role="status">
          {bonus && !fname ? copy.ok.joinedBonus(bonus, info.merchant.name) : fname ? copy.ok.joined(fname) : "You're in."}
        </h1>
        {bonus && fname ? (
          <p className="text-body text-fg-muted">
            {bonus} added at {info.merchant.name.replace(/\.$/, "")}.
          </p>
        ) : null}
        {program?.earnType === "stamps" ? (
          <StampCard stamps={m.balance} goal={program.stampGoal} rewardName={m.nextReward?.name ?? "reward"} vertical={info.merchant.vertical} newlyEarned={Array.from({ length: result.bonusPoints }, (_, i) => i)} className="w-full" terminology={m.terminology} />
        ) : (
          <PointsRing balance={m.balance} goal={goal} terminology={m.terminology} rewardName={m.nextReward?.name} size={120} />
        )}
        <p className="text-caption text-fg-muted">{m.expiryDisclosure}</p>
      </div>

      <section aria-label="Your card" className="flex flex-col items-center gap-2">
        <p className="text-label text-fg">Show this to staff</p>
        {card ? <MemberQr memberCode={card.memberCode} svg={card.qrSvg} size={240} /> : <div className="skeleton aspect-square w-[240px] rounded-xl" aria-busy="true" />}
        <p className="text-caption text-fg-muted">Turn your brightness up so it scans first time.</p>
      </section>

      <div className="flex flex-col gap-3">
        {walletError ? <Banner tone="neutral">{walletError}</Banner> : null}
        {showApple ? (
          <Button size="lg" fullWidth variant={os === "ios" ? "primary" : "secondary"} loading={walletBusy === "apple"} onClick={apple}>
            {copy.action.addToAppleWallet}
          </Button>
        ) : null}
        {showGoogle ? (
          <Button size="lg" fullWidth variant={os === "android" ? "primary" : "secondary"} loading={walletBusy === "google"} onClick={google}>
            {copy.action.addToGoogleWallet}
          </Button>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-body-sm">
          <span className="inline-flex items-center gap-1 text-fg-muted">
            <Smartphone aria-hidden className="size-4" />
            {copy.action.getTheApp}:
          </span>
          {os !== "android" ? (
            <a className="text-fg-link underline" href={appStoreUrl} rel="noopener noreferrer">
              App Store
            </a>
          ) : null}
          {os !== "ios" ? (
            <a className="text-fg-link underline" href={playStoreUrl} rel="noopener noreferrer">
              Google Play
            </a>
          ) : null}
          <a className="text-fg-link underline" href="/me">
            My card on the web
          </a>
        </div>
      </div>

      {nearby.length ? (
        <section aria-labelledby="also-on" className="flex flex-col gap-3">
          <h2 id="also-on" className="text-title text-fg">
            Also on your card nearby
          </h2>
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            {nearby.map((s) => (
              <li key={s.merchant.id} className="w-60 shrink-0 snap-start">
                <ShopTile variant="compact" href={`/shops/${s.merchant.slug}`} shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, distanceM: s.distanceMetres }} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
