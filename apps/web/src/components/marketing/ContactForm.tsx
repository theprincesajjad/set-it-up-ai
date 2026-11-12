"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { BRAND, LOCALE_LIST, type Locale, type repApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
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

type Translate = ReturnType<typeof useLocaleOrEnglish>["t"];

/**
 * After a failed check has marked its fields (`aria-invalid="true"`), move focus to the first bad one, so a keyboard or screen-reader
 * user lands on it. Waits one frame: on a first submit nothing is marked until React has painted. (The same behaviour as
 * lib/api/useErrorText's helper, kept here so this form does not pull that module's error wording into the home page.)
 */
function focusFirstInvalid(root: ParentNode | null): void {
  if (!root) return;
  window.requestAnimationFrame(() => {
    const el = root.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}

/**
 * What to say when a submit fails, by kind and in the page's language: offline, unreachable, our side, or "too many, try again in N
 * minutes" (lib/api/userError). Those words are fetched only when a submit has failed, so the home page does not carry them for every
 * visitor. If even that cannot load, the connection is the problem and the plain line says so.
 */
async function failureText(err: unknown, t: Translate, locale: Locale): Promise<string> {
  try {
    const { userMessage } = await import("@/lib/api/userError");
    return userMessage(err, t, locale);
  } catch {
    return t("err.network.line");
  }
}

/** The support address as a link people can tap. Left to right inside Urdu text. */
function SupportEmail() {
  return (
    <a href={`mailto:${BRAND.supportEmail}`} dir="ltr" className="font-medium underline underline-offset-2">
      {BRAND.supportEmail}
    </a>
  );
}

/** "If it keeps happening, email {address}." in the page's language, the address as a mailto link. */
function HelpLine({ t }: { t: Translate }) {
  const [before, after] = t("err.help.email", { address: "\u0000" }).split("\u0000");
  return (
    <>
      {before}
      <SupportEmail />
      {after ?? ""}
    </>
  );
}

/**
 * Under the submit button of every lead form: what the details are for, said where they are collected, and the privacy policy
 * (the forms take a name and a phone number, and the BIA one an email).
 */
function Purpose({ children, link }: { children: ReactNode; link: string }) {
  return (
    <p className="text-meta text-muted-foreground" data-testid="lead-purpose">
      {children}{" "}
      <Link href="/legal/privacy" className="font-medium text-foreground underline decoration-input/60 underline-offset-2 hover:decoration-foreground">
        {link}
      </Link>
    </p>
  );
}

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
  const form = useRef<HTMLFormElement>(null);
  const { t, locale } = useLocaleOrEnglish();

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
      // An earlier send failure no longer describes this attempt: only the field messages show.
      setFailed(null);
      // After the fields have been marked invalid (the next frame), not before: on a first submit nothing is marked yet.
      focusFirstInvalid(form.current);
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
      // By kind, in plain words: offline, unreachable, our side, or "too many, try again in N minutes".
      setFailed(await failureText(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <Banner tone="success" title={kind === "visit" ? copy.forms.visitSent : copy.forms.biaSent}>
        {copy.forms.sentQuestions} <SupportEmail />.
      </Banner>
    );

  return (
    <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-4">
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
          {failed} <HelpLine t={t} />
        </Banner>
      ) : null}
      <Button type="submit" size="lg" loading={busy}>
        {kind === "visit" ? copy.forms.visitSubmit : copy.forms.biaSubmit}
      </Button>
      <Purpose link={copy.forms.privacyLink}>{kind === "visit" ? copy.forms.visitPurpose : copy.forms.biaPurpose}</Purpose>
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
  const [failed, setFailed] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const labels = { owner: t("mkt.rest.form.name"), restaurant: t("mkt.rest.form.restaurant") };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const k of ["owner", "restaurant"] as const) if (!values[k]?.trim()) errs[k] = t("mkt.rest.form.required", { field: labels[k] });
    const e164 = toE164(phone);
    if (!e164) errs.phone = t("mkt.rest.form.phoneError");
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFailed(null);
      focusFirstInvalid(form.current);
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await browserApi.public.lead({ kind: "restaurant", businessName: values.restaurant!.trim(), contactName: values.owner!.trim(), phone: e164!, language, vertical: "restaurant" });
      setSent(true);
    } catch (err) {
      setFailed(await failureText(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <Banner tone="success">{t("mkt.rest.form.thanks")}</Banner>;

  return (
    <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField label={labels.owner} placeholder="Imran" value={values.owner ?? ""} onChange={(e) => setValues((v) => ({ ...v, owner: e.target.value }))} error={errors.owner} />
      <TextField label={labels.restaurant} placeholder="Karahi House" value={values.restaurant ?? ""} onChange={(e) => setValues((v) => ({ ...v, restaurant: e.target.value }))} error={errors.restaurant} />
      <PhoneField label={t("mkt.rest.form.phone")} value={phone} onChangeDigits={setPhone} error={errors.phone} />
      <Select label={t("mkt.rest.form.language")} value={language} onChange={(e) => setLanguage(e.target.value as Locale)} options={LOCALE_LIST.map((l) => ({ value: l.code, label: l.name }))} />
      {failed ? (
        <Banner tone="danger">
          {failed} <HelpLine t={t} />
        </Banner>
      ) : null}
      <Button type="submit" size="lg" loading={busy}>
        {t("mkt.rest.form.submit")}
      </Button>
      <Purpose link={t("su.privacyPolicy")}>{t("mkt.rest.form.purpose")}</Purpose>
    </form>
  );
}
