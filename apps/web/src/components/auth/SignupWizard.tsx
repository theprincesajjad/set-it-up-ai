"use client";
/**
 * Self-serve merchant signup in one screen: account (POST /v1/auth/register) and shop (POST /v1/merchants),
 * then straight to "give your first stamp" in the setup guide. Postal code, shop email and logo are not asked
 * here: none of them is needed to give the first stamp (docs/research/merchant-onboarding.md).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { VERTICALS, VERTICAL_TEMPLATES, type merchantApi, type networkApi } from "@ll/shared";
import { browserClient, sessionApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { toE164 } from "@/lib/phone";
import { howYouEarn } from "@/lib/program";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/cn";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";

/** The ten shop types most owners pick, in the words they use. Everything else is under "Something else". */
const CHIPS: { value: merchantApi.CreateMerchantBody["vertical"]; label: string }[] = [
  { value: "cafe", label: "Café" },
  { value: "bakery", label: "Bakery" },
  { value: "restaurant", label: "Restaurant" },
  { value: "restaurant_south_asian", label: "South Asian restaurant" },
  { value: "tiffin", label: "Tiffin kitchen" },
  { value: "retail", label: "Retail" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "salon", label: "Salon" },
  { value: "barber", label: "Barber" },
  { value: "repair_electronics", label: "Repair" },
];

export interface SignupWizardProps {
  signedInName?: string | null;
  /** From the sales assistant's link (lib/marketing/signupPrefill.ts). Only starting values: every field stays editable. */
  prefill?: { shop?: string; vertical?: string; phone?: string };
  neighbourhoods: networkApi.NeighbourhoodDto[];
}

export function SignupWizard({ signedInName, neighbourhoods, prefill }: SignupWizardProps) {
  const router = useRouter();
  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [shop, setShop] = useState({ name: prefill?.shop ?? "", vertical: prefill?.vertical ?? "", address: "", neighbourhoodSlug: "" });
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  // Once the account exists a retry (after a shop error) must not register again.
  const [registered, setRegistered] = useState(!!signedInName);

  const template = shop.vertical ? VERTICAL_TEMPLATES[shop.vertical as keyof typeof VERTICAL_TEMPLATES] : null;
  const otherOptions = useMemo(() => VERTICALS.filter((v) => !CHIPS.some((c) => c.value === v)).map((v) => ({ value: v, label: VERTICAL_TEMPLATES[v].label })).sort((a, b) => a.label.localeCompare(b.label)), []);

  function focusFirstError() {
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!registered) {
      if (!account.name.trim()) errs.name = "Your name is required.";
      if (!/^\S+@\S+\.\S+$/.test(account.email)) errs.email = "Enter a valid email address.";
      if (account.password.length < 8) errs.password = "Use at least 8 characters.";
    }
    if (shop.name.trim().length < 2) errs.shopName = "Shop name is required.";
    if (!shop.vertical) errs.vertical = "Pick your type of shop.";
    if (shop.address.trim().length < 3) errs.address = "Street address is required.";
    const e164 = toE164(phone);
    if (!e164) errs.phone = "Enter a 10-digit mobile number.";
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length) return focusFirstError();
    setBusy(true);
    try {
      if (!registered) {
        try {
          await sessionApi.register({ name: account.name.trim(), email: account.email.trim(), password: account.password });
          setRegistered(true);
        } catch (err) {
          if (isApiError(err) && err.status === 409)
            setBanner(
              <>
                That email already has an account.{" "}
                <Link className="underline" href={`/login?next=${encodeURIComponent("/signup")}`}>
                  Sign in
                </Link>{" "}
                to add your shop.
              </>,
            );
          else setBanner(errorMessage(err));
          return;
        }
      }
      const body: merchantApi.CreateMerchantBody = {
        name: shop.name.trim(),
        vertical: shop.vertical as merchantApi.CreateMerchantBody["vertical"],
        address: shop.address.trim(),
        phone: e164!,
        city: "Toronto",
        ...(shop.neighbourhoodSlug ? { neighbourhoodSlug: shop.neighbourhoodSlug } : {}),
      };
      const r = await browserClient.post<merchantApi.MerchantDetail>("/v1/merchants", body);
      router.push(`${routes.dashboard(r.merchant.id)}/setup?step=first_stamp`);
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setRegistered(false);
        setBanner("For your security, please sign in again.");
      } else setBanner(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {banner ? <Banner tone="warning">{banner}</Banner> : null}
      <TextField label="Shop name" value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} error={errors.shopName} maxLength={120} autoComplete="organization" />
      {!registered ? <TextField label="Your name" autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} error={errors.name} /> : null}

      <div role="radiogroup" aria-labelledby="signup-type" aria-invalid={errors.vertical ? true : undefined} className="flex flex-col gap-2">
        <span id="signup-type" className="text-meta-strong text-fg">
          What kind of shop?
        </span>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={shop.vertical === c.value}
              onClick={() => setShop({ ...shop, vertical: c.value })}
              className={cn("h-10 rounded-full border px-4 text-meta font-medium focus-visible:focus-ring", shop.vertical === c.value ? "border-fg bg-fg text-bg" : "border-line-strong bg-bg text-fg hover:bg-bg-subtle")}
            >
              {c.label}
            </button>
          ))}
        </div>
        {errors.vertical ? <p className="text-meta text-negative">{errors.vertical}</p> : null}
      </div>
      <Select label="Something else?" placeholder="Pick another type" value={CHIPS.some((c) => c.value === shop.vertical) ? "" : shop.vertical} onChange={(e) => e.target.value && setShop({ ...shop, vertical: e.target.value })} options={otherOptions} />
      {template ? (
        <p className="rounded-card bg-bg-subtle px-4 py-3 text-meta text-fg">
          We start you on: {howYouEarn({ ...template, minSpendCents: 0 })} {template.rewards[0] ? `${template.earnType === "stamps" ? template.stampGoal : template.rewards[0].pointsCost} ${template.terminology} = ${template.rewards[0].name}.` : ""} Change it any time. Nothing to print or install yet.
        </p>
      ) : null}

      <PhoneField label="Your mobile number" hint="We text you the counter link and setup reminders." value={phone} onChangeDigits={setPhone} error={errors.phone} />
      <TextField label="Street address" autoComplete="street-address" value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} error={errors.address} />
      {neighbourhoods.length ? (
        <Select label="Neighbourhood" placeholder="Not sure / not listed" value={shop.neighbourhoodSlug} onChange={(e) => setShop({ ...shop, neighbourhoodSlug: e.target.value })} options={neighbourhoods.map((n) => ({ value: n.slug, label: n.name }))} />
      ) : null}
      {!registered ? (
        <>
          <TextField label="Email" type="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} error={errors.email} />
          <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} error={errors.password} />
        </>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Create my shop and give my first stamp
      </Button>
      <p className="text-meta text-fg-muted">
        Postal code, logo, GST/HST and staff come later. They never block your first stamp. By continuing you agree to the{" "}
        <Link className="underline" href="/legal/terms">
          Terms
        </Link>{" "}
        and{" "}
        <Link className="underline" href="/legal/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
