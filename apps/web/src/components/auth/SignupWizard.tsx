"use client";
/**
 * Self-serve shop signup as a stepped flow (wave P, team onboard; was one long form until Nov 2026).
 *
 *   1 link     "Do you have a website or Instagram?" (paste a link to import, or skip)
 *   2 shop     "Is this you?" (the imported name, logo, colour, and what else we found) or "What's your shop called?"
 *   3 kind     "What kind of shop is it?" (eight tiles and a search; the import's guess is preselected)
 *   4 where    "Where do clients find you?" (a street address only for a storefront, a postal code for a home studio)
 *   5 card     "Your loyalty card" (the trade's stamps and reward, editable, previewed in the shop's colour)
 *   6 account  "Create your account" (mobile, email, password, terms): asked last, once the owner has made something.
 *              Then POST /v1/auth/register, POST /v1/merchants (unchanged body: name, type, where, phone, attribution),
 *              POST .../site-import/apply for what they kept, and PATCH .../program and .../rewards/:id if they changed the card.
 *   live       "You're live": the card, the join QR and link, next steps, then the trade's first dashboard step (lib/signupRoute.ts).
 *
 * Every step is a URL (`?step=`); a step past the first unanswered one falls back to it. Answers live in sessionStorage (never the
 * password), so refresh and Back keep them. Kept from the one-screen form: the `?shop=` sales-assistant prefill (starts at "Is this
 * you?"), landing attribution (src, A/B variant, anonymous id), the signup_start beacon, the trial, and the terms line.
 */
import { cityFromAddress } from "@/lib/address";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AID_OFF, AID_PATTERN, LANDING_COOKIES, normalizePostal, onboardingPath, parseVariantCookie, tradeSetupFor, type merchantApi } from "@ll/shared";
import { browserApi, browserClient, sessionApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { toE164 } from "@/lib/phone";
import { routes } from "@/lib/routes";
import { RESTAURANT_VERTICALS, afterSignupPath } from "@/lib/signupRoute";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { shopColorProps } from "@/lib/shopColor";
import { applyBodyFor } from "@/components/onboarding/SiteImport";
import { CardPreview } from "@/components/onboarding/signup/CardPreview";
import { STEPS, cardFor, clearDraft, emptyDraft, loadDraft, resolveStep, saveDraft, withPrefill, type FlowStep, type SignupDraft, type StepErrors } from "@/components/onboarding/signup/draft";
import { FlowShell } from "@/components/onboarding/signup/Shell";
import { LinkStep, ShopStep, type Importer } from "@/components/onboarding/signup/StepsIntro";
import { KindStep, LoyaltyStep, WhereStep } from "@/components/onboarding/signup/StepsShop";
import { AccountStep, type NextStep } from "@/components/onboarding/signup/StepsFinish";

// "You're live" (confetti, the carousel, motion) loads only once the shop exists.
const LiveStep = dynamic(() => import("@/components/onboarding/signup/LiveStep").then((m) => m.LiveStep), { ssr: false, loading: () => <div className="min-h-[70dvh]" data-step="live" aria-busy="true" /> });

/** The landing page's `src` (ll_src cookie, 30 days), when the link itself did not carry one. */
function cookieSrc(): string | undefined {
  try {
    const m = /(?:^|;\s*)ll_src=([^;]+)/.exec(document.cookie);
    const v = m ? decodeURIComponent(m[1]!) : "";
    return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The landing-page A/B fields (packages/shared/src/experiments.ts): the variant from ?v= or the `ll_v` cookie, and the anonymous id
 * from `ll_aid`, which is the only link between a landing visit and the new shop. Nothing is read when counting is off or the
 * browser sends Global Privacy Control.
 */
function landingAb(fromLink: { experimentId: string | null; variant: string } | undefined): Pick<merchantApi.CreateMerchantBody, "variant" | "experimentId" | "anonId"> {
  try {
    const cookie = (k: string) => new RegExp(`(?:^|;\\s*)${k}=([^;]+)`).exec(document.cookie)?.[1];
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    const aid = cookie(LANDING_COOKIES.aid);
    if (gpc || aid === AID_OFF) return {};
    const v = fromLink ?? parseVariantCookie(cookie(LANDING_COOKIES.variant)) ?? undefined;
    return {
      ...(v ? { variant: v.variant, ...(v.experimentId ? { experimentId: v.experimentId } : {}) } : {}),
      ...(aid && AID_PATTERN.test(aid) ? { anonId: aid } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Wave N (admin funnel): tell our own API, once per visit, that a counted landing visitor opened signup ("signup started"). Same
 * rules as the landing beacon: only with an `ll_aid` that is not `off` and no Global Privacy Control; first-party, no other data.
 */
function beaconSignupStart(): void {
  try {
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    const aid = new RegExp(`(?:^|;\\s*)${LANDING_COOKIES.aid}=([^;]+)`).exec(document.cookie)?.[1];
    if (gpc || !aid || aid === AID_OFF || !AID_PATTERN.test(aid) || sessionStorage.getItem("ll_ss")) return;
    sessionStorage.setItem("ll_ss", "1");
    navigator.sendBeacon?.("/api/public/landing-events", JSON.stringify({ aid, p: "/signup", ev: [{ k: "signup_start" }] }));
  } catch {
    // Counting is best effort; signup never depends on it.
  }
}

export interface SignupWizardProps {
  signedInName?: string | null;
  /** From the sales assistant's link or a landing page (lib/marketing/signupPrefill.ts). Only starting values: every field stays editable. */
  prefill?: { shop?: string; vertical?: string; phone?: string; email?: string; color?: string; plan?: string; src?: string; interval?: "year"; v?: { experimentId: string | null; variant: string } };
  /** Tests inject a fake website reader. */
  importer?: Importer;
}

export function SignupWizard({ signedInName, prefill, importer }: SignupWizardProps) {
  useEffect(beaconSignupStart, []);
  const { t } = useLocaleOrEnglish();
  // The step in the address bar. Read from window.location (not useSearchParams) so a pushState and the render that follows agree.
  const [requested, setRequested] = useState<string | null>(null);
  const [draft, setDraft] = useState<SignupDraft | null>(null);
  const [registered, setRegistered] = useState(!!signedInName);
  const [errors, setErrors] = useState<StepErrors>({});
  const [banner, setBanner] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  // Restore the draft (sessionStorage) and lay the link's values over it (once per link: draft.prefillKey).
  useEffect(() => {
    const d = withPrefill(loadDraft() ?? emptyDraft(), prefill);
    // sessionStorage is only readable after hydration (the server renders an empty shell), so the draft arrives in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(d);
    try {
      const u = new URL(window.location.href);
      // A sales-assistant link starts at "Is this you?" so the owner confirms the name it carries.
      const s = resolveStep(u.searchParams.get("step") ?? (prefill?.shop ? "shop" : null), d);
      u.searchParams.set("step", s);
      window.history.replaceState(window.history.state, "", u);
      setRequested(s);
    } catch {
      // An odd URL: the flow still works from state.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival
  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);
  // Browser Back and Forward move between steps.
  useEffect(() => {
    const onPop = () => setRequested(new URL(window.location.href).searchParams.get("step"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<SignupDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);
  const step: FlowStep | null = draft ? resolveStep(requested, draft) : null;

  // Keep the URL on the step actually shown (a deep link past an unanswered step lands on that step).
  useEffect(() => {
    if (!step) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("step") === step) return;
    u.searchParams.set("step", step);
    window.history.replaceState(window.history.state, "", u);
  }, [step]);

  const go = useCallback((s: FlowStep) => {
    setErrors({});
    setBanner(null);
    const u = new URL(window.location.href);
    u.searchParams.set("step", s);
    window.history.pushState(window.history.state, "", u);
    setRequested(s);
  }, []);
  const idx = step && step !== "live" ? STEPS.indexOf(step) : -1;
  const next = useCallback(() => {
    const i = idx;
    if (i >= 0 && i < STEPS.length - 1) go(STEPS[i + 1]!);
  }, [idx, go]);
  const back = idx > 0 ? () => go(STEPS[idx - 1]!) : null;

  async function create(password: string) {
    if (!draft) return;
    const errs: StepErrors = {};
    if (!registered) {
      if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) errs.email = t("su.err.email");
      if (password.length < 8) errs.password = t("su.err.password");
    }
    const e164 = toE164(draft.phone);
    if (!e164) errs.phone = t("su.err.phone");
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length) return requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
    setBusy(true);
    try {
      if (!registered) {
        try {
          // Your own name comes later (Settings); until then the shop's name, which is what a client sees as the stylist at a solo
          // studio. Never the part of the email before the @: it reached the public booking page and the confirmation (final audit).
          await sessionApi.register({ name: draft.name.trim().slice(0, 120) || "Owner", email: draft.email.trim(), password });
          setRegistered(true);
        } catch (err) {
          if (isApiError(err) && err.status === 409)
            setBanner(
              <>
                {t("su.err.exists")}{" "}
                <Link className="underline" href={`/login?next=${encodeURIComponent("/signup?step=account")}`}>
                  {t("su.err.signIn")}
                </Link>{" "}
                {t("su.err.toAdd")}
              </>,
            );
          else setBanner(errorMessage(err));
          return;
        }
      }
      const source = prefill?.src ?? cookieSrc();
      const body: merchantApi.CreateMerchantBody = {
        name: draft.name.trim(),
        vertical: draft.vertical as merchantApi.CreateMerchantBody["vertical"],
        workSetting: draft.work,
        ...(draft.work === "shop" ? { address: draft.address.trim() } : {}),
        ...(draft.work === "home" ? { postalCode: normalizePostal(draft.postal)! } : {}),
        phone: e164!,
        ...(draft.work === "shop" && cityFromAddress(draft.address) ? { city: cityFromAddress(draft.address)! } : {}),
        ...(source ? { source } : {}),
        ...landingAb(prefill?.v),
        ...(draft.vertical === "other" && draft.sells.trim() ? { description: draft.sells.trim() } : {}),
      };
      const r = await browserClient.post<merchantApi.MerchantDetail>("/v1/merchants", body);
      const id = r.merchant.id;
      // The rest of what the owner kept from their website (logo, colour, links, hours, services), now that the shop exists.
      const kept = draft.link === "read" && draft.accepted ? applyBodyFor(draft.accepted) : null;
      if (kept) await browserClient.post(`/v1/merchants/${id}/site-import/apply`, kept).catch(() => undefined);
      // The colour picked on "Your loyalty card" when nothing was imported (wave Q). Best effort, like the card: Settings can change it.
      const pickedColor = draft.link !== "read" || !draft.accepted ? draft.color : null;
      if (pickedColor) await browserClient.patch(`/v1/merchants/${id}`, { brandColor: pickedColor }).catch(() => undefined);
      // Their card, if they changed the trade's defaults. Best effort: the shop exists either way and Rewards can fix it.
      await applyCard(id, draft).catch(() => undefined);
      setDraft({
        ...draft,
        created: {
          id,
          name: r.merchant.name,
          vertical: draft.vertical,
          workSetting: draft.work,
          joinUrl: r.locations[0]?.joinUrl ?? null,
          brandColor: draft.accepted?.brandColor ?? pickedColor ?? r.merchant.brandColor ?? null,
          logo: draft.accepted?.logoPreview ?? draft.accepted?.logoUrl ?? r.merchant.logoUrl ?? null,
        },
      });
      go("live");
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setRegistered(false);
        setBanner(t("su.err.session"));
      } else setBanner(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const nextSteps = draft?.created ? nextStepsFor(draft.created, t) : [];
  if (!draft || !step) return <div className="min-h-dvh bg-bg" aria-busy="true" />;

  // The colour flows through as soon as it is known: the site's colour right after the read, then the owner's pick.
  const brandColor = draft.accepted ? (draft.accepted.brandColor ?? null) : draft.link === "read" ? (draft.imported?.fields.brandColor?.value ?? null) : draft.color;
  const colors = shopColorProps(draft.vertical || brandColor ? { vertical: draft.vertical || null, brandColor } : null);
  const card = step === "card" || step === "account" ? cardFor(draft.vertical, draft.card) : null;
  const aside =
    step === "live" ? null : (
      <div className="flex w-full max-w-[380px] flex-col gap-4">
        <p className="text-meta font-[550] text-fg">{t("sf.preview.label")}</p>
        <CardPreview name={draft.name} vertical={draft.vertical} brandColor={brandColor} logo={draft.accepted?.logoPreview ?? null} card={card} tilt stack />
        <p className="text-meta text-fg-muted">{t("sf.preview.caption")}</p>
      </div>
    );
  const terms = rich(t("su.agree"), {
    terms: (
      <Link key="t" className="underline" href="/legal/terms">
        {t("su.terms")}
      </Link>
    ),
    privacy: (
      <Link key="p" className="underline" href="/legal/privacy">
        {t("su.privacyPolicy")}
      </Link>
    ),
  });
  const props = { draft, update, next };
  const created = draft.created;
  return (
    <FlowShell step={step === "live" ? null : idx + 1} total={STEPS.length} onBack={step === "live" ? null : back} exitHref={step === "live" ? null : "/"} colors={colors} aside={aside}>
      {step === "link" ? <LinkStep {...props} importer={importer} /> : null}
      {step === "shop" ? <ShopStep {...props} onRelink={() => { update({ link: "ask" }); go("link"); }} /> : null}
      {step === "kind" ? <KindStep {...props} /> : null}
      {step === "where" ? <WhereStep {...props} /> : null}
      {step === "card" ? <LoyaltyStep {...props} /> : null}
      {step === "account" ? <AccountStep draft={draft} update={update} registered={registered} busy={busy} banner={banner} errors={errors} onCreate={create} terms={terms} brandColor={brandColor} /> : null}
      {step === "live" && created ? (
        <LiveStep
          draft={draft}
          nextSteps={nextSteps}
          primaryHref={afterSignupPath(routes.dashboard(created.id), created.vertical, prefill?.plan, created.workSetting, prefill?.interval)}
          primaryLabel={prefill?.plan ? t("sf.live.checkout") : t("sf.live.go")}
          onLeave={clearDraft}
        />
      ) : null}
    </FlowShell>
  );
}

/** PATCH the program and the first reward when the owner changed the trade's defaults on "Your loyalty card". */
async function applyCard(merchantId: string, d: SignupDraft): Promise<void> {
  if (!d.card) return;
  const c = cardFor(d.vertical, d.card);
  const goalChanged = c.goal !== c.defaults.goal;
  const rewardChanged = c.reward.trim() !== c.defaults.reward;
  if (!goalChanged && !rewardChanged) return;
  const api = browserApi.merchant(merchantId);
  // A stamp card's goal lives on the program; changing it moves the reward that sat at the old goal (program-rules.ts).
  if (c.earnType === "stamps" && goalChanged) await api.updateProgram({ stampGoal: c.goal });
  const items = (await api.rewards()).items;
  const first = items.find((r) => r.active) ?? items[0];
  if (!first) return;
  const patch: Record<string, unknown> = {};
  if (rewardChanged) patch.name = c.reward.trim();
  if (c.earnType !== "stamps" && goalChanged) patch.pointsCost = c.goal;
  if (Object.keys(patch).length) await api.updateReward(first.id, patch);
}

/** Two or three things to do next, by kind of shop (the same first step lib/signupRoute.ts lands on, then the next ones). */
function nextStepsFor(shop: NonNullable<SignupDraft["created"]>, t: ReturnType<typeof useLocaleOrEnglish>["t"]): NextStep[] {
  const base = routes.dashboard(shop.id);
  const s = (key: string) => `${base}/setup?step=${key}`;
  const qr: NextStep = { icon: "qr_stand", title: t("sf.live.n.qr"), body: t("sf.live.n.qrBody"), href: s("qr_kit") };
  if (onboardingPath(shop.vertical, shop.workSetting) !== "storefront")
    return [
      { icon: "price_tag", title: t("sf.live.n.services"), body: t("sf.live.n.servicesBody"), href: s("services") },
      { icon: "calendar_week", title: t("sf.live.n.hours"), body: t("sf.live.n.hoursBody"), href: s("hours") },
      { icon: "link", title: t("sf.live.n.share"), body: t("sf.live.n.shareBody"), href: s("share") },
    ];
  if (RESTAURANT_VERTICALS.includes(shop.vertical))
    return [{ icon: "eat", title: t("sf.live.n.restaurant"), body: t("sf.live.n.restaurantBody"), href: afterSignupPath(base, shop.vertical, null, shop.workSetting) }, qr];
  const first: NextStep =
    shop.vertical === "pharmacy"
      ? { icon: "check_done", title: t("sf.live.n.pharmacy"), body: t("sf.live.n.pharmacyBody"), href: s("pharmacy_rules") }
      : tradeSetupFor(shop.vertical)
        ? { icon: "services", title: t("sf.live.n.trade"), body: t("sf.live.n.tradeBody"), href: s("trade_setup") }
        : { icon: "stamp_card", title: t("sf.live.n.stamp"), body: t("sf.live.n.stampBody"), href: s("first_stamp") };
  return [first, qr, { icon: "team", title: t("sf.live.n.team"), body: t("sf.live.n.teamBody"), href: s("staff") }];
}

/** "{terms} and {privacy}" with links in place of the names. */
function rich(text: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return text.split(/\{(\w+)\}/).map((x, i) => (i % 2 ? (parts[x] ?? x) : x));
}
