"use client";
import { useState, type FormEvent } from "react";
import { BRAND, LOCALE_LIST, type Locale, type repApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { toE164 } from "@/lib/phone";
import { copy } from "@/copy/en-CA";

type Kind = "visit" | "bia" | "restaurant";
type Field = { key: string; label: string; type?: "email" | "textarea" | "date" | "number"; optional?: boolean; placeholder?: string };

const FIELDS = copy.forms as unknown as Record<"visit" | "bia", Field[]>;

const WRITE_TO = `You can also write to ${BRAND.supportEmail}.`;

/**
 * Marketing-site lead forms, all POST /v1/public/leads (no auth, rate limited per IP; the lead lands in the rep
 * pipeline): "visit" (shop owners), "restaurant" (phone required, preferred language, in the page's language) and
 * "bia" (role, event date, next board meeting, member count).
 */
export function ContactForm({ kind }: { kind: Kind }) {
  if (kind === "restaurant") return <RestaurantForm />;
  return <StandardForm kind={kind} />;
}

function StandardForm({ kind }: { kind: Exclude<Kind, "restaurant"> }) {
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
    const members = values.memberCount?.trim() ? Number(values.memberCount) : undefined;
    if (members !== undefined && (!Number.isInteger(members) || members < 1)) errs.memberCount = "Enter a whole number.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    const body: repApi.PublicLeadBody =
      kind === "visit"
        ? { kind: "book_visit", businessName: values.shop!.trim(), contactName: values.owner?.trim(), phone: e164 ?? undefined, message: values.bestTime ? `Best time: ${values.bestTime.trim()}` : undefined }
        : {
            kind: "bia",
            businessName: values.bia!.trim(),
            contactName: values.name?.trim(),
            role: values.role?.trim(),
            email: values.email?.trim(),
            phone: e164 ?? undefined,
            eventDate: values.eventDate || undefined,
            boardMeetingAt: values.boardMeetingAt || undefined,
            memberCount: members,
            message: values.message?.trim() || undefined,
          };
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
      <Banner tone="success" title={kind === "visit" ? copy.forms.visitSent : copy.forms.biaSent}>
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
          inputMode={f.type === "number" ? "numeric" : undefined}
          placeholder={f.placeholder}
          optionalLabel={f.optional}
          value={values[f.key] ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          error={errors[f.key]}
        />
      ))}
      <PhoneField label="Phone" value={phone} onChangeDigits={setPhone} error={errors.phone} />
      {failed ? (
        <Banner tone="danger">
          {failed} {WRITE_TO}
        </Banner>
      ) : null}
      <Button type="submit" size="lg" loading={busy}>
        {kind === "visit" ? copy.forms.visitSubmit : copy.forms.biaSubmit}
      </Button>
    </form>
  );
}

/** The restaurant visit form: name, restaurant, phone (required) and the language we should call or message in. */
function RestaurantForm() {
  const { t, locale } = useLocaleOrEnglish();
  const [values, setValues] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState<Locale>(locale);
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const labels = { owner: t("mkt.rest.form.name"), restaurant: t("mkt.rest.form.restaurant") };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const k of ["owner", "restaurant"] as const) if (!values[k]?.trim()) errs[k] = t("mkt.rest.form.required", { field: labels[k] });
    const e164 = toE164(phone);
    if (!e164) errs.phone = t("mkt.rest.form.phoneError");
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await browserApi.public.lead({ kind: "restaurant", businessName: values.restaurant!.trim(), contactName: values.owner!.trim(), phone: e164!, language, vertical: "restaurant" });
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <Banner tone="success">{t("mkt.rest.form.thanks")}</Banner>;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField label={labels.owner} placeholder="Imran" value={values.owner ?? ""} onChange={(e) => setValues((v) => ({ ...v, owner: e.target.value }))} error={errors.owner} />
      <TextField label={labels.restaurant} placeholder="Karahi House" value={values.restaurant ?? ""} onChange={(e) => setValues((v) => ({ ...v, restaurant: e.target.value }))} error={errors.restaurant} />
      <PhoneField label={t("mkt.rest.form.phone")} value={phone} onChangeDigits={setPhone} error={errors.phone} />
      <Select label={t("mkt.rest.form.language")} value={language} onChange={(e) => setLanguage(e.target.value as Locale)} options={LOCALE_LIST.map((l) => ({ value: l.code, label: l.name }))} />
      {failed ? <Banner tone="danger">{t("mkt.rest.form.failed")}</Banner> : null}
      <Button type="submit" size="lg" loading={busy}>
        {t("mkt.rest.form.submit")}
      </Button>
    </form>
  );
}
