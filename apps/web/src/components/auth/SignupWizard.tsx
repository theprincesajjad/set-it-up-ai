"use client";
/**
 * Self-serve merchant signup in one screen: account (POST /v1/auth/register) and shop (POST /v1/merchants).
 * Four things about the shop (name, kind, mobile, street address) plus the email and password for the account. Your name,
 * the neighbourhood, postal code, logo and GST/HST are not asked here: the API pins the address on the map and puts the shop
 * on its street, and the rest comes later (docs/audits/main-street-self-serve.md F8).
 * Then to the trade's own first step (lib/signupRoute.ts): a restaurant sees its plans, a salon its services and hours, a studio its classes.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { VERTICALS, VERTICAL_TEMPLATES, type merchantApi } from "@ll/shared";
import { browserClient, sessionApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { toE164 } from "@/lib/phone";
import { howYouEarn } from "@/lib/program";
import { routes } from "@/lib/routes";
import { afterSignupPath } from "@/lib/signupRoute";
import { cn } from "@/lib/cn";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";

/** The shop types most owners pick, in the words they use. Everything else is under "More types". */
const CHIPS: { value: merchantApi.CreateMerchantBody["vertical"]; label: string }[] = [
  { value: "cafe", label: "Café" },
  { value: "bakery", label: "Bakery" },
  { value: "restaurant", label: "Restaurant" },
  { value: "restaurant_south_asian", label: "South Asian restaurant" },
  { value: "tiffin", label: "Tiffin kitchen" },
  { value: "caterer", label: "Caterer" },
  { value: "banquet_hall", label: "Banquet hall" },
  { value: "retail", label: "Retail" },
  { value: "grocery", label: "Grocer or butcher" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "salon", label: "Salon" },
  { value: "barber", label: "Barber" },
  { value: "fitness", label: "Gym or studio" },
  { value: "pet", label: "Pet shop or groomer" },
  { value: "repair_auto", label: "Auto care" },
  { value: "repair_electronics", label: "Repair" },
];

export interface SignupWizardProps {
  signedInName?: string | null;
  /** From the sales assistant's link (lib/marketing/signupPrefill.ts). Only starting values: every field stays editable. */
  prefill?: { shop?: string; vertical?: string; phone?: string; plan?: string };
}

export function SignupWizard({ signedInName, prefill }: SignupWizardProps) {
  const router = useRouter();
  const [account, setAccount] = useState({ email: "", password: "" });
  const [shop, setShop] = useState({ name: prefill?.shop ?? "", vertical: prefill?.vertical ?? "", address: "", sells: "" });
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
          // Your name comes later (Settings); until then the part of the email before the @.
          await sessionApi.register({ name: account.email.trim().split("@")[0]!.slice(0, 60) || "Owner", email: account.email.trim(), password: account.password });
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
        ...(shop.vertical === "other" && shop.sells.trim() ? { description: shop.sells.trim() } : {}),
      };
      const r = await browserClient.post<merchantApi.MerchantDetail>("/v1/merchants", body);
      router.push(afterSignupPath(routes.dashboard(r.merchant.id), body.vertical, prefill?.plan));
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
      <Select label="More types" placeholder="Pick another type" value={CHIPS.some((c) => c.value === shop.vertical) ? "" : shop.vertical} onChange={(e) => e.target.value && setShop({ ...shop, vertical: e.target.value })} options={otherOptions} />
      {template ? (
        <p className="rounded-card bg-bg-subtle px-4 py-3 text-meta text-fg">
          We start you on: {howYouEarn({ ...template, minSpendCents: 0 })} {template.rewards[0] ? `${template.earnType === "stamps" ? template.stampGoal : template.rewards[0].pointsCost} ${template.terminology} = ${template.rewards[0].name}.` : ""} Change it any time. Nothing to print or install yet.
        </p>
      ) : null}

      <PhoneField label="Your mobile number" hint="We text you the counter link and setup reminders." value={phone} onChangeDigits={setPhone} error={errors.phone} />
      <TextField label="Street address" autoComplete="street-address" hint="We put your shop on the map and on its street from this." value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} error={errors.address} />
      {shop.vertical === "other" ? <TextField label="What do you sell?" optionalLabel maxLength={300} value={shop.sells} onChange={(e) => setShop({ ...shop, sells: e.target.value })} /> : null}
      {!registered ? (
        <>
          <TextField label="Email" type="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} error={errors.email} />
          <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} error={errors.password} />
        </>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Create my shop
      </Button>
      <p className="text-meta text-fg-muted">
        Your name, postal code, logo, GST/HST and staff come later. By continuing you agree to the{" "}
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
