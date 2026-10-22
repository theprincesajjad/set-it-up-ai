"use client";
import { useState, type FormEvent } from "react";
import { BRAND, type repApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { toE164 } from "@/lib/phone";

type Kind = "visit" | "bia";

const FIELDS: Record<Kind, { key: string; label: string; type?: "email" | "textarea"; optional?: boolean }[]> = {
  visit: [
    { key: "shop", label: "Shop name" },
    { key: "address", label: "Shop address" },
    { key: "owner", label: "Your name" },
    { key: "bestTime", label: "Best time to visit", optional: true },
  ],
  bia: [
    { key: "name", label: "Your name" },
    { key: "bia", label: "BIA" },
    { key: "email", label: "Email", type: "email" },
    { key: "message", label: "Message", type: "textarea", optional: true },
  ],
};

/**
 * "Book a 20-minute visit" (merchants) and "Talk to us" (BIAs): POST /v1/public/leads (no auth,
 * rate limited per IP). The lead lands in the rep pipeline.
 */
export function ContactForm({ kind }: { kind: Kind }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of FIELDS[kind]) if (!f.optional && !values[f.key]?.trim()) errs[f.key] = `${f.label} is required.`;
    const e164 = toE164(phone);
    if (kind === "visit" && !e164) errs.phone = "Enter a 10-digit mobile number.";
    if (phone && !e164) errs.phone = "Enter a 10-digit mobile number.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = document.querySelector<HTMLElement>("[aria-invalid=true]");
      first?.focus();
      return;
    }
    const body: repApi.PublicLeadBody =
      kind === "visit"
        ? { kind: "book_visit", businessName: values.shop!.trim(), contactName: values.owner?.trim(), phone: e164 ?? undefined, message: [`Address: ${values.address ?? ""}`, values.bestTime ? `Best time: ${values.bestTime}` : ""].filter(Boolean).join("\n") }
        : { kind: "bia", businessName: values.bia!.trim(), contactName: values.name?.trim(), email: values.email?.trim(), phone: e164 ?? undefined, message: values.message?.trim() || undefined };
    setBusy(true);
    setFailed(null);
    try {
      await browserApi.public.lead(body);
      setSent(true);
    } catch (err) {
      setFailed(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <Banner tone="success" title={kind === "visit" ? "Thanks. A rep will call you within 1 business day." : "Thanks. We'll get back to you within 1 business day."}>
        Questions in the meantime? Write to {BRAND.supportEmail}.
      </Banner>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {FIELDS[kind].map((f) => (
        <TextField
          key={f.key}
          label={f.label}
          type={f.type ?? "text"}
          optionalLabel={f.optional}
          value={values[f.key] ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          error={errors[f.key]}
        />
      ))}
      <PhoneField label="Phone" value={phone} onChangeDigits={setPhone} error={errors.phone} />
      {failed ? <Banner tone="danger">{failed} You can also write to {BRAND.supportEmail}.</Banner> : null}
      <Button type="submit" size="lg" loading={busy}>
        {kind === "visit" ? "Book a visit" : "Talk to us"}
      </Button>
    </form>
  );
}
