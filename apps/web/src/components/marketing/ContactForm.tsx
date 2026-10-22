"use client";
import { useState, type FormEvent } from "react";
import { BRAND } from "@ll/shared";
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
 * "Book a 20-minute visit" (merchants) and "Talk to us" (BIAs).
 * There is no public lead-capture endpoint yet (leads are rep-only: POST /v1/rep/leads),
 * so this opens a pre-filled email to BRAND.supportEmail and confirms.
 */
export function ContactForm({ kind }: { kind: Kind }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of FIELDS[kind]) if (!f.optional && !values[f.key]?.trim()) errs[f.key] = `${f.label} is required.`;
    if (!toE164(phone)) errs.phone = "Enter a 10-digit mobile number.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = document.querySelector<HTMLElement>("[aria-invalid=true]");
      first?.focus();
      return;
    }
    const lines = FIELDS[kind].map((f) => `${f.label}: ${values[f.key] ?? ""}`).concat(`Phone: ${phone}`);
    const subject = kind === "visit" ? `Book a visit: ${values.shop}` : `BIA campaign: ${values.bia}`;
    window.location.href = `mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    setSent(true);
  }

  if (sent)
    return (
      <Banner tone="success" title={kind === "visit" ? "Thanks. A rep will call you within 1 business day." : "Thanks. We'll get back to you within 1 business day."}>
        If your email app didn&apos;t open, write to {BRAND.supportEmail}.
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
      <Button type="submit" size="lg">
        {kind === "visit" ? "Book a visit" : "Talk to us"}
      </Button>
    </form>
  );
}
