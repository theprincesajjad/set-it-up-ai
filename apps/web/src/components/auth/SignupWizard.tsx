"use client";
/**
 * Self-serve merchant signup: account (POST /v1/auth/register via /api/auth/register)
 * → shop (POST /v1/merchants, merchant.md) → live (QR + join link).
 */
import { CircleCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { VERTICALS, VERTICAL_TEMPLATES, type merchantApi, type networkApi } from "@ll/shared";
import { browserClient, sessionApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { toE164 } from "@/lib/phone";
import { howYouEarn } from "@/lib/program";
import { routes } from "@/lib/routes";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { QrCode } from "@/components/ui/QrCode";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";

type Step = "account" | "shop" | "done";

export interface SignupWizardProps {
  signedInName?: string | null;
  neighbourhoods: networkApi.NeighbourhoodDto[];
}

export function SignupWizard({ signedInName, neighbourhoods }: SignupWizardProps) {
  const [step, setStep] = useState<Step>(signedInName ? "shop" : "account");
  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [shop, setShop] = useState({ name: "", vertical: "", address: "", postalCode: "", email: "", neighbourhoodSlug: "" });
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<merchantApi.MerchantDetail | null>(null);

  const template = shop.vertical ? VERTICAL_TEMPLATES[shop.vertical as keyof typeof VERTICAL_TEMPLATES] : null;
  const verticalOptions = useMemo(() => VERTICALS.map((v) => ({ value: v, label: VERTICAL_TEMPLATES[v].label })).sort((a, b) => a.label.localeCompare(b.label)), []);

  function focusFirstError() {
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
  }

  async function submitAccount(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!account.name.trim()) errs.name = "Your name is required.";
    if (!/^\S+@\S+\.\S+$/.test(account.email)) errs.email = "Enter a valid email address.";
    if (account.password.length < 8) errs.password = "Use at least 8 characters.";
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length) return focusFirstError();
    setBusy(true);
    try {
      await sessionApi.register({ name: account.name.trim(), email: account.email.trim(), password: account.password });
      setStep("shop");
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
    } finally {
      setBusy(false);
    }
  }

  async function submitShop(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (shop.name.trim().length < 2) errs.shopName = "Shop name is required.";
    if (!shop.vertical) errs.vertical = "Pick your type of shop.";
    if (shop.address.trim().length < 3) errs.address = "Street address is required.";
    const e164 = toE164(phone);
    if (!e164) errs.phone = "Enter a 10-digit phone number.";
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length) return focusFirstError();
    setBusy(true);
    try {
      const body: merchantApi.CreateMerchantBody = {
        name: shop.name.trim(),
        vertical: shop.vertical as merchantApi.CreateMerchantBody["vertical"],
        address: shop.address.trim(),
        phone: e164!,
        city: "Toronto",
        ...(shop.postalCode.trim() ? { postalCode: shop.postalCode.trim().toUpperCase() } : {}),
        ...(shop.email.trim() ? { email: shop.email.trim() } : {}),
        ...(shop.neighbourhoodSlug ? { neighbourhoodSlug: shop.neighbourhoodSlug } : {}),
      };
      const r = await browserClient.post<merchantApi.MerchantDetail>("/v1/merchants", body);
      setCreated(r);
      setStep("done");
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setStep("account");
        setBanner("For your security, please sign in again.");
      } else setBanner(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = step === "account" ? 1 : step === "shop" ? 2 : 3;
  return (
    <div className="flex flex-col gap-6">
      <ProgressBar value={stepIndex} max={3} label={`Step ${stepIndex} of 3`} valueText={`Step ${stepIndex} of 3`} showValue={false} />
      {banner ? <Banner tone="warning">{banner}</Banner> : null}

      {step === "account" ? (
        <form onSubmit={submitAccount} noValidate className="flex flex-col gap-4">
          <h2 className="text-h2 text-fg">Create your account</h2>
          <TextField label="Your name" autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} error={errors.name} />
          <TextField label="Email" type="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} error={errors.email} />
          <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} error={errors.password} />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Continue
          </Button>
          <p className="text-caption text-fg-muted">
            By continuing you agree to the{" "}
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
      ) : null}

      {step === "shop" ? (
        <form onSubmit={submitShop} noValidate className="flex flex-col gap-4">
          <h2 className="text-h2 text-fg">{signedInName ? `Add your shop, ${signedInName.split(" ")[0]}` : "Your shop"}</h2>
          <TextField label="Shop name" value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} error={errors.shopName} maxLength={120} />
          <Select label="Type of shop" placeholder="Choose one" value={shop.vertical} onChange={(e) => setShop({ ...shop, vertical: e.target.value })} options={verticalOptions} error={errors.vertical} />
          {template ? (
            <p className="rounded-md bg-brand-subtle px-3 py-2 text-body-sm text-on-brand-subtle">
              We&apos;ll start you on: {howYouEarn({ ...template, minSpendCents: 0 })} {template.rewards[0] ? `${template.earnType === "stamps" ? template.stampGoal : template.rewards[0].pointsCost} ${template.terminology} = ${template.rewards[0].name}.` : ""} Change it anytime.
            </p>
          ) : null}
          <TextField label="Street address" autoComplete="street-address" value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} error={errors.address} />
          <TextField label="Postal code" optionalLabel autoComplete="postal-code" value={shop.postalCode} onChange={(e) => setShop({ ...shop, postalCode: e.target.value })} maxLength={7} />
          {neighbourhoods.length ? (
            <Select
              label="Neighbourhood"
              placeholder="Not sure / not listed"
              value={shop.neighbourhoodSlug}
              onChange={(e) => setShop({ ...shop, neighbourhoodSlug: e.target.value })}
              options={neighbourhoods.map((n) => ({ value: n.slug, label: n.name }))}
            />
          ) : null}
          <PhoneField label="Shop phone" value={phone} onChangeDigits={setPhone} error={errors.phone} />
          <TextField label="Shop email" optionalLabel type="email" value={shop.email} onChange={(e) => setShop({ ...shop, email: e.target.value })} />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Create my shop
          </Button>
        </form>
      ) : null}

      {step === "done" && created ? (
        <div className="flex flex-col gap-5">
          <Banner tone="success" icon={CircleCheck} title="You're live.">
            Your first customer can join right now.
          </Banner>
          <h2 className="text-h2 text-fg">{created.merchant.name}</h2>
          {created.program ? <p className="text-body text-fg-muted">{howYouEarn(created.program)}</p> : null}
          {created.locations[0] ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-surface p-6 shadow-sm">
              <p className="text-title">Scan to join</p>
              <div className="w-56 rounded-lg bg-qr-bg p-3">
                <QrCode value={created.locations[0].joinUrl} size={200} label={`QR code for ${created.locations[0].joinUrl}`} />
              </div>
              <a className="inline-flex items-center gap-1 text-body-sm text-fg-link underline" href={routes.join(created.locations[0].qrCode)} target="_blank" rel="noopener noreferrer">
                Try your join page <ExternalLink aria-hidden className="size-3.5" />
              </a>
              <p className="text-center text-caption text-fg-muted">Print your QR stand from the dashboard (Locations & QR kit). A rep can also bring one.</p>
            </div>
          ) : null}
          <Button size="lg" fullWidth href={routes.dashboard(created.merchant.id)}>
            Open my dashboard
          </Button>
        </div>
      ) : null}
    </div>
  );
}
