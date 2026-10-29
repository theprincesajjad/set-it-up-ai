"use client";
/**
 * Self-serve merchant signup in one screen: account (POST /v1/auth/register) and shop (POST /v1/merchants).
 * Four things about the shop (name, kind, where you work, mobile) plus the email and password for the account. "Where do you work?"
 * (onboarding-v1.md §3.2): a shop or salon gives its street address; "My place" a postal code only (the map shows the area, never
 * the address); "I travel to clients" nothing. Your name,
 * the neighbourhood, postal code, logo and GST/HST are not asked here: the API pins the address on the map and puts the shop
 * on its street, and the rest comes later (docs/audits/main-street-self-serve.md F8).
 * Then to the trade's own first step (lib/signupRoute.ts): a restaurant sees its plans, a salon its services and hours, a studio its classes.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { AID_OFF, AID_PATTERN, LANDING_COOKIES, SOLO_ONLY_VERTICALS, VERTICALS, VERTICAL_TEMPLATES, normalizePostal, parseVariantCookie, type MessageKey, type merchantApi } from "@ll/shared";
import { browserClient, sessionApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { toE164 } from "@/lib/phone";
import { howYouEarn } from "@/lib/program";
import { routes } from "@/lib/routes";
import { afterSignupPath } from "@/lib/signupRoute";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { ChoiceGroup, ChoiceTile } from "@/components/onboarding";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";

/** The shop types most owners pick, in the order they pick them (onboarding-v1.md §3.1). Everything else is under "More types". */
const CHIPS: merchantApi.CreateMerchantBody["vertical"][] = [
  "nails", "brows_lashes", "barber", "salon", "makeup", "cafe", "bakery", "restaurant", "restaurant_south_asian", "tiffin", "caterer", "banquet_hall", "retail", "grocery", "pharmacy", "fitness", "pet", "repair_auto", "repair_electronics",
];

type Work = "home" | "shop" | "mobile";
const WORK_ICON: Record<Work, "pin_area" | "shops" | "domain"> = { home: "pin_area", shop: "shops", mobile: "domain" };

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

export interface SignupWizardProps {
  signedInName?: string | null;
  /** From the sales assistant's link or a landing page (lib/marketing/signupPrefill.ts). Only starting values: every field stays editable. */
  prefill?: { shop?: string; vertical?: string; phone?: string; email?: string; plan?: string; src?: string; interval?: "year"; v?: { experimentId: string | null; variant: string } };
}

export function SignupWizard({ signedInName, prefill }: SignupWizardProps) {
  const router = useRouter();
  const { t, locale } = useLocaleOrEnglish();
  const [account, setAccount] = useState({ email: prefill?.email ?? "", password: "" });
  const [shop, setShop] = useState({ name: prefill?.shop ?? "", vertical: prefill?.vertical ?? "", address: "", postal: "", sells: "" });
  // "Where do you work?": a nail, brow or makeup pro usually works from home; everyone else starts at "A shop or salon". Once the owner picks, we keep it.
  const [work, setWork] = useState<Work>(prefill?.vertical && SOLO_ONLY_VERTICALS.includes(prefill.vertical) ? "home" : "shop");
  const [workTouched, setWorkTouched] = useState(false);
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  // Once the account exists a retry (after a shop error) must not register again.
  const [registered, setRegistered] = useState(!!signedInName);

  const template = shop.vertical ? VERTICAL_TEMPLATES[shop.vertical as keyof typeof VERTICAL_TEMPLATES] : null;
  const otherOptions = useMemo(() => VERTICALS.filter((v) => !CHIPS.includes(v)).map((v) => ({ value: v, label: VERTICAL_TEMPLATES[v].label })).sort((a, b) => a.label.localeCompare(b.label)), []);
  const pickVertical = (v: string) => {
    setShop((s) => ({ ...s, vertical: v }));
    if (!workTouched) setWork(SOLO_ONLY_VERTICALS.includes(v) ? "home" : "shop");
  };

  function focusFirstError() {
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!registered) {
      if (!/^\S+@\S+\.\S+$/.test(account.email)) errs.email = t("su.err.email");
      if (account.password.length < 8) errs.password = t("su.err.password");
    }
    if (shop.name.trim().length < 2) errs.shopName = t("su.err.name");
    if (!shop.vertical) errs.vertical = t("su.err.kind");
    if (work === "shop" && shop.address.trim().length < 3) errs.address = t("su.err.street");
    if (work === "home" && !normalizePostal(shop.postal)) errs.postal = t("su.err.postal");
    const e164 = toE164(phone);
    if (!e164) errs.phone = t("su.err.phone");
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length) return focusFirstError();
    setBusy(true);
    try {
      if (!registered) {
        try {
          // Your own name comes later (Settings); until then the shop's name, which is what a client sees as the stylist at a solo
          // studio. Never the part of the email before the @: it reached the public booking page and the confirmation (final audit).
          await sessionApi.register({ name: shop.name.trim().slice(0, 120) || "Owner", email: account.email.trim(), password: account.password });
          setRegistered(true);
        } catch (err) {
          if (isApiError(err) && err.status === 409)
            setBanner(
              <>
                {t("su.err.exists")}{" "}
                <Link className="underline" href={`/login?next=${encodeURIComponent("/signup")}`}>
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
        name: shop.name.trim(),
        vertical: shop.vertical as merchantApi.CreateMerchantBody["vertical"],
        workSetting: work,
        ...(work === "shop" ? { address: shop.address.trim() } : {}),
        ...(work === "home" ? { postalCode: normalizePostal(shop.postal)! } : {}),
        phone: e164!,
        city: "Toronto",
        ...(source ? { source } : {}),
        ...landingAb(prefill?.v),
        ...(shop.vertical === "other" && shop.sells.trim() ? { description: shop.sells.trim() } : {}),
      };
      const r = await browserClient.post<merchantApi.MerchantDetail>("/v1/merchants", body);
      router.push(afterSignupPath(routes.dashboard(r.merchant.id), body.vertical, prefill?.plan, work, prefill?.interval));
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setRegistered(false);
        setBanner(t("su.err.session"));
      } else setBanner(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const reward = template?.rewards[0] ? `${template.earnType === "stamps" ? template.stampGoal : template.rewards[0].pointsCost} ${template.terminology} = ${template.rewards[0].name}.` : "";
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {banner ? <Banner tone="warning">{banner}</Banner> : null}
      <TextField name="shopName" label={t("su.shopName")} hint={work !== "shop" ? t("su.privateNote") : t("su.shopNameHint")} value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} error={errors.shopName} maxLength={120} autoComplete="organization" />

      <div role="radiogroup" aria-labelledby="signup-type" aria-invalid={errors.vertical ? true : undefined} className="flex flex-col gap-2">
        <span id="signup-type" className="text-meta-strong text-fg">
          {t("su.kind")}
        </span>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              data-vertical={v}
              aria-checked={shop.vertical === v}
              onClick={() => pickVertical(v)}
              className={cn("h-10 rounded-full border px-4 text-meta font-medium focus-visible:focus-ring max-md:h-11", shop.vertical === v ? "border-fg bg-fg text-bg" : "border-line-strong bg-bg text-fg hover:bg-bg-subtle")}
            >
              {t(`su.chip.${v}` as MessageKey)}
            </button>
          ))}
        </div>
        {errors.vertical ? <p className="text-meta text-negative">{errors.vertical}</p> : null}
      </div>
      <Select label={t("su.moreTypes")} placeholder={t("su.moreTypesPick")} value={CHIPS.includes(shop.vertical as (typeof CHIPS)[number]) ? "" : shop.vertical} onChange={(e) => e.target.value && pickVertical(e.target.value)} options={otherOptions} />
      {template ? (
        <p className="rounded-card bg-bg-subtle px-4 py-3 text-meta text-fg">{locale === "en" ? t("su.template", { how: howYouEarn({ ...template, minSpendCents: 0 }), reward }) : t("su.templateShort")}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <span id="signup-where" className="text-meta-strong text-fg">
          {t("su.where")}
        </span>
        <ChoiceGroup aria-labelledby="signup-where" value={work} onValueChange={(v) => { setWork(v as Work); setWorkTouched(true); }}>
          {(["home", "shop", "mobile"] as const).map((w) => (
            <ChoiceTile key={w} value={w} icon={WORK_ICON[w]} trade={shop.vertical || null} label={t(`su.where.${w}`)} hint={t(`su.where.${w}Hint`)} />
          ))}
        </ChoiceGroup>
      </div>

      <PhoneField label={t("su.phone")} hint={t("su.phoneHint")} value={phone} onChangeDigits={setPhone} error={errors.phone} />
      {work === "shop" ? <TextField name="street" label={t("su.street")} autoComplete="street-address" hint={t("su.streetHint")} value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} error={errors.address} /> : null}
      {work === "home" ? <TextField name="postal" label={t("su.postal")} autoComplete="postal-code" hint={t("su.postalHint")} value={shop.postal} onChange={(e) => setShop({ ...shop, postal: e.target.value.toUpperCase() })} error={errors.postal} maxLength={7} dir="ltr" className="max-w-[220px]" /> : null}
      {shop.vertical === "other" ? <TextField label={t("su.sells")} optionalLabel maxLength={300} value={shop.sells} onChange={(e) => setShop({ ...shop, sells: e.target.value })} /> : null}
      {!registered ? (
        <>
          <TextField name="email" label={t("su.email")} type="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} error={errors.email} dir="ltr" />
          <TextField name="password" label={t("su.password")} type="password" autoComplete="new-password" hint={t("su.passwordHint")} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} error={errors.password} />
        </>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {t("su.create")}
      </Button>
      <p className="text-meta text-fg-muted">
        {t("su.later")}{" "}
        {rich(t("su.agree"), {
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
        })}
      </p>
    </form>
  );
}

/** "{terms} and {privacy}" with links in place of the names. */
function rich(text: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return text.split(/\{(\w+)\}/).map((x, i) => (i % 2 ? (parts[x] ?? x) : x));
}
