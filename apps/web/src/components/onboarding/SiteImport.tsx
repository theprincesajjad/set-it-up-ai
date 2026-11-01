"use client";
/**
 * "Have a website or Instagram?" (wave O, team import): onboarding step 1, before the signup form.
 *
 * The owner pastes a link (or an @handle) and we read their public site on the server (apps/api services/site-import). Three
 * states in one StepCard: the link form (with "Skip, I'll type it"), a progress state, then a review card where every value
 * shows where it came from and has a keep tick and an edit control. Nothing is saved here: "Use these details" hands the kept
 * values to the signup form, which saves them with the new shop. The brand colour is previewed on a small card in the shop's own
 * colour (shopColorProps: contrast-checked), the same way the pass wears it.
 */
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { VERTICALS, VERTICAL_TEMPLATES, type MessageKey, type merchantApi, type siteImportApi } from "@ll/shared";
import { browserClient, BFF_BASE } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { formatNanp } from "@/lib/phone";
import { shopColorProps } from "@/lib/shopColor";
import { Banner } from "@/components/ui/Banner";
import { Checkbox } from "@/components/ui/Checkbox";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { StepCard } from "./StepCard";

type Result = siteImportApi.SiteImportResult;
type Hours = merchantApi.Hours;

/** What the owner kept, as they edited it. Only kept fields are present. */
export interface SiteImportAccepted {
  importId: string;
  /** The host or handle the values came from ("priyanails.ca", "@priya.nails"). */
  from: string;
  name?: string;
  vertical?: string;
  /** E.164. */
  phone?: string;
  address?: string;
  website?: string;
  instagram?: string;
  description?: string;
  brandColor?: string;
  /** Keep the logo the import downloaded (the server stores its own copy). */
  logo?: boolean;
  /** Preview of that logo (the import's 24-hour preview URL), for the form above. */
  logoPreview?: string;
  /** Instagram imports: a link to a logo the owner pasted. */
  logoUrl?: string;
  hours?: Hours;
  services?: { name: string; priceCents: number }[];
}

/** The body of POST /v1/merchants/:id/site-import/apply for what the owner kept (the form saves name, type, phone and address itself). */
export function applyBodyFor(a: SiteImportAccepted, opts: { includeProfile?: boolean } = {}): siteImportApi.SiteImportApplyBody | null {
  const body: siteImportApi.SiteImportApplyBody = { importId: a.importId };
  if (opts.includeProfile && a.name) body.name = a.name;
  if (opts.includeProfile && a.phone) body.phone = a.phone;
  if (a.logo) body.logo = true;
  if (a.logoUrl) body.logoUrl = a.logoUrl;
  if (a.website) body.website = a.website;
  if (a.instagram) body.instagram = a.instagram;
  if (a.description) body.description = a.description;
  if (a.brandColor) body.brandColor = a.brandColor;
  if (a.hours) body.hours = a.hours;
  if (a.services?.length) body.services = a.services;
  return Object.keys(body).length > 1 ? body : null;
}

const fromLabel = (r: Result) => (r.kind === "instagram" ? `@${r.fields.instagram?.value ?? ""}` : hostOf(r.url));
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export type SiteImporter = (url: string) => Promise<Result>;
const defaultImporter: SiteImporter = (url) => browserClient.post<Result>("/v1/site-import", { url });

// ---------------------------------------------------------------------------
// Step 1: the link, the progress, then the review
// ---------------------------------------------------------------------------
export interface SiteImportStepProps {
  onDone: (accepted: SiteImportAccepted) => void;
  onSkip: () => void;
  /** Tests inject a fake; the default calls the API through the BFF. */
  importer?: SiteImporter;
  /** Where the logo preview is served from (default: the BFF). */
  logoBase?: string;
  /** The shop type the owner already picked, so the colour preview matches it. */
  vertical?: string | null;
  headingLevel?: 1 | 2 | 3;
  /** Told when the step moves between the link form, the progress state and the review (the signup hides its form meanwhile). */
  onPhase?: (phase: "form" | "loading" | "review") => void;
}

export function SiteImportStep({ onDone, onSkip, importer = defaultImporter, logoBase = BFF_BASE, vertical, headingLevel = 2, onPhase }: SiteImportStepProps) {
  const { t } = useLocaleOrEnglish();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "loading" | "review">("form");
  useEffect(() => {
    onPhase?.(phase);
  }, [phase, onPhase]);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (url.trim().length < 3) return setError(t("imp.err.empty"));
    setError(null);
    setPhase("loading");
    try {
      setResult(await importer(url.trim()));
      setPhase("review");
    } catch (err) {
      // The API's own sentence when it has one (blocked, too big, robots ...), else a plain one.
      setError(isApiError(err) && err.message ? err.message : t("imp.err.generic"));
      setPhase("form");
    }
  }

  if (phase === "loading") return <ImportProgress headingLevel={headingLevel} />;
  if (phase === "review" && result)
    return <SiteImportReview result={result} logoBase={logoBase} vertical={vertical} headingLevel={headingLevel} onConfirm={onDone} onRestart={() => { setPhase("form"); setResult(null); }} />;
  return (
    <StepCard
      icon="site"
      headingId="imp-title"
      headingLevel={headingLevel}
      title={t("imp.title")}
      body={t("imp.body")}
      onSubmit={submit}
      primary={{ label: t("imp.go"), type: "submit" }}
      secondary={{ label: t("imp.skip"), onClick: onSkip }}
      className="clear:shadow-none"
    >
      <div className="flex flex-col gap-3">
        {error ? <Banner tone="warning">{error}</Banner> : null}
        <TextField name="siteImportUrl" label={t("imp.label")} placeholder={t("imp.placeholder")} value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} dir="ltr" maxLength={500} error={null} />
      </div>
    </StepCard>
  );
}

function ImportProgress({ headingLevel }: { headingLevel: 1 | 2 | 3 }) {
  const { t } = useLocaleOrEnglish();
  const steps = [t("imp.loading.step1"), t("imp.loading.step2"), t("imp.loading.step3")];
  const [at, setAt] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAt((n) => Math.min(n + 1, steps.length - 1)), 1600);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <StepCard icon="site" headingId="imp-loading" headingLevel={headingLevel} title={t("imp.loading.title")} body={t("imp.loading.body")} className="clear:shadow-none">
      <ol role="status" aria-live="polite" className="flex flex-col gap-2" data-import-progress>
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-3 text-body", i <= at ? "text-foreground" : "text-muted-foreground")}>
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", i < at ? "bg-foreground" : i === at ? "animate-pulse bg-foreground motion-reduce:animate-none" : "bg-border")} />
            {s}
          </li>
        ))}
      </ol>
    </StepCard>
  );
}

// ---------------------------------------------------------------------------
// The review card
// ---------------------------------------------------------------------------
type Key = "name" | "vertical" | "logo" | "brandColor" | "phone" | "website" | "address" | "hours" | "instagram" | "description" | "services";

export interface SiteImportReviewProps {
  result: Result;
  onConfirm: (accepted: SiteImportAccepted) => void;
  onRestart: () => void;
  logoBase?: string;
  vertical?: string | null;
  headingLevel?: 1 | 2 | 3;
}

/** Trades with a translated chip label (su.chip.*); the rest use the template's English label, as the signup's "More types" does. */
const CHIP_LABELLED = new Set(["nails", "brows_lashes", "barber", "salon", "makeup", "cafe", "bakery", "restaurant", "restaurant_south_asian", "tiffin", "caterer", "banquet_hall", "retail", "grocery", "pharmacy", "fitness", "pet", "repair_auto", "repair_electronics"]);
const e164Digits = (e: string) => e.replace(/^\+1/, "").replace(/\D/g, "").slice(0, 10);

export function SiteImportReview({ result, onConfirm, onRestart, logoBase = BFF_BASE, vertical, headingLevel = 2 }: SiteImportReviewProps) {
  const { t, locale } = useLocaleOrEnglish();
  const f = result.fields;
  const [keep, setKeep] = useState<Record<Key, boolean>>({ name: !!f.name, vertical: !!f.vertical, logo: !!f.logo, brandColor: !!f.brandColor, phone: !!f.phone, website: !!f.website, address: !!f.address, hours: !!f.hours, instagram: !!f.instagram, description: !!f.description, services: !!f.services });
  const [editing, setEditing] = useState<Key | null>(null);
  const [val, setVal] = useState({
    name: f.name?.value ?? "",
    vertical: f.vertical?.value ?? "",
    brandColor: f.brandColor?.value ?? "",
    phone: f.phone ? e164Digits(f.phone.value) : "",
    website: f.website?.value ?? "",
    address: f.address?.value ?? "",
    instagram: f.instagram?.value ?? "",
    description: f.description?.value ?? "",
  });
  const [logoUrl, setLogoUrl] = useState("");
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const set = (k: keyof typeof val, v: string) => setVal((s) => ({ ...s, [k]: v }));
  const toggle = (k: Key) => (on: boolean) => setKeep((s) => ({ ...s, [k]: on }));
  const money = useMemo(() => new Intl.NumberFormat(locale === "en" ? "en-CA" : `${locale}-CA`, { style: "currency", currency: "CAD" }), [locale]);
  const logoSrc = f.logo ? `${logoBase}${f.logo.value}` : null;
  const colorOk = /^#[0-9a-f]{6}$/i.test(val.brandColor);
  const logoUrlOk = !logoUrl || logoUrl.startsWith("https://");
  const tradeFor = (keep.vertical && val.vertical) || vertical || "other";

  function confirm() {
    if (!logoUrlOk) return;
    const a: SiteImportAccepted = { importId: result.id, from: fromLabel(result) };
    if (keep.name && val.name.trim().length >= 2) a.name = val.name.trim();
    if (keep.vertical && val.vertical) a.vertical = val.vertical;
    if (keep.logo && f.logo) {
      a.logo = true;
      a.logoPreview = logoSrc ?? undefined;
    }
    if (logoUrl) a.logoUrl = logoUrl.trim();
    if (keep.brandColor && colorOk) a.brandColor = val.brandColor.toUpperCase();
    if (keep.phone && val.phone.length === 10) a.phone = `+1${val.phone}`;
    if (keep.website && val.website.trim()) a.website = val.website.trim();
    if (keep.address && val.address.trim()) a.address = val.address.trim();
    if (keep.hours && f.hours) a.hours = f.hours.value;
    if (keep.instagram && val.instagram.trim()) a.instagram = val.instagram.trim().replace(/^@/, "");
    if (keep.description && val.description.trim()) a.description = val.description.trim();
    if (f.services && picked.size) a.services = f.services.value.filter((_, i) => picked.has(i)).map((s) => ({ name: s.name, priceCents: s.priceCents ?? 0 }));
    onConfirm(a);
  }

  const src = (field: { source: siteImportApi.SiteImportSource } | null) => (field ? t("imp.review.from", { source: t(`imp.src.${field.source}` as MessageKey) }) : null);
  const tradeLabel = (v: string) => (!v ? "" : CHIP_LABELLED.has(v) ? t(`su.chip.${v}` as MessageKey) : (VERTICAL_TEMPLATES[v as keyof typeof VERTICAL_TEMPLATES]?.label ?? v));
  const verticalOptions = useMemo(() => VERTICALS.map((v) => ({ value: v, label: tradeLabel(v) })), [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StepCard
      icon="check_done"
      headingId="imp-review"
      headingLevel={headingLevel}
      title={t("imp.review.title")}
      body={t("imp.review.body")}
      primary={{ label: t("imp.review.confirm"), onClick: confirm, disabled: !logoUrlOk }}
      secondary={{ label: t("imp.review.restart"), onClick: onRestart }}
      className="clear:shadow-none"
    >
      <div className="flex flex-col gap-3" data-import-review>
        <p className="text-meta text-muted-foreground" dir="ltr">
          <bdi>{fromLabel(result)}</bdi>
        </p>
        {result.notes.map((n) => (
          <Banner key={n} tone="info">
            {t(`imp.note.${n}` as MessageKey)}
          </Banner>
        ))}

        {(f.name || f.brandColor || f.logo) && (keep.name || keep.brandColor || keep.logo) ? (
          <figure className="flex flex-col gap-2">
            <figcaption className="text-meta-strong text-foreground">{t("imp.review.preview")}</figcaption>
            <div {...shopColorProps({ vertical: tradeFor, brandColor: keep.brandColor && colorOk ? val.brandColor : null })} className="flex items-center gap-3 rounded-r3 bg-trade p-4 text-trade-foreground" data-import-preview>
              {keep.logo && logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full bg-card object-cover" />
              ) : null}
              <span className="min-w-0 truncate text-body-strong">
                <bdi>{(keep.name && val.name) || fromLabel(result)}</bdi>
              </span>
            </div>
          </figure>
        ) : null}

        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {f.name ? (
            <Row id="name" label={t("imp.f.name")} source={src(f.name)} keep={keep.name} onKeep={toggle("name")} editing={editing === "name"} onEdit={setEditing} value={<bdi>{val.name}</bdi>}>
              <TextField label={t("imp.f.name")} hideLabel value={val.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
            </Row>
          ) : null}
          {f.vertical ? (
            <Row id="vertical" label={t("imp.f.vertical")} badge={t("imp.review.suggestion")} source={src(f.vertical)} keep={keep.vertical} onKeep={toggle("vertical")} editing={editing === "vertical"} onEdit={setEditing} value={tradeLabel(val.vertical)}>
              <Select label={t("imp.f.vertical")} value={val.vertical} onChange={(e) => set("vertical", e.target.value)} options={verticalOptions} />
            </Row>
          ) : null}
          {f.logo ? (
            <Row id="logo" label={t("imp.f.logo")} source={src(f.logo)} keep={keep.logo} onKeep={toggle("logo")}
              value={
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc!} alt={t("imp.review.logoAlt")} width={56} height={56} className="size-14 rounded-r2 border border-border bg-card object-contain" />
              }
            />
          ) : result.kind === "instagram" ? (
            <li className="py-3">
              <TextField label={t("imp.review.logoLink")} optionalLabel hint={t("imp.review.logoLinkHint")} type="url" dir="ltr" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} error={logoUrlOk ? null : t("imp.review.logoLinkError")} />
            </li>
          ) : null}
          {f.brandColor ? (
            <Row id="brandColor" label={t("imp.f.brandColor")} source={src(f.brandColor)} keep={keep.brandColor} onKeep={toggle("brandColor")} editing={editing === "brandColor"} onEdit={setEditing}
              value={
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span aria-hidden {...shopColorProps({ vertical: tradeFor, brandColor: colorOk ? val.brandColor : null })} className="size-6 rounded-full border border-border bg-trade" />
                    <span dir="ltr" className="tabular-nums">{val.brandColor.toUpperCase()}</span>
                    {f.accentColor ? (
                      <span aria-hidden {...shopColorProps({ vertical: tradeFor, brandColor: f.accentColor.value })} className="size-4 rounded-full border border-border bg-trade" title={t("imp.f.accentColor")} />
                    ) : null}
                  </span>
                  {f.brandColor.adjusted && val.brandColor === f.brandColor.value ? <span className="text-meta text-muted-foreground">{t("imp.review.colorAdjusted")}</span> : null}
                </span>
              }
            >
              <TextField label={t("imp.f.brandColor")} hideLabel value={val.brandColor} dir="ltr" maxLength={7} onChange={(e) => set("brandColor", e.target.value)} error={colorOk ? null : "#RRGGBB"} />
            </Row>
          ) : null}
          {f.phone ? (
            <Row id="phone" label={t("imp.f.phone")} source={src(f.phone)} keep={keep.phone} onKeep={toggle("phone")} editing={editing === "phone"} onEdit={setEditing} value={<span dir="ltr">{formatNanp(val.phone)}</span>}>
              <PhoneField label={t("imp.f.phone")} value={val.phone} onChangeDigits={(d) => set("phone", d)} />
            </Row>
          ) : null}
          {f.website ? (
            <Row id="website" label={t("imp.f.website")} source={src(f.website)} keep={keep.website} onKeep={toggle("website")} editing={editing === "website"} onEdit={setEditing} value={<span dir="ltr" className="break-all">{val.website}</span>}>
              <TextField label={t("imp.f.website")} hideLabel type="url" dir="ltr" value={val.website} onChange={(e) => set("website", e.target.value)} />
            </Row>
          ) : null}
          {f.address ? (
            <Row id="address" label={t("imp.f.address")} source={src(f.address)} keep={keep.address} onKeep={toggle("address")} editing={editing === "address"} onEdit={setEditing} value={<bdi>{val.address}</bdi>}>
              <TextField label={t("imp.f.address")} hideLabel value={val.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />
            </Row>
          ) : null}
          {f.hours ? <Row id="hours" label={t("imp.f.hours")} source={src(f.hours)} keep={keep.hours} onKeep={toggle("hours")} value={<HoursList hours={f.hours.value} locale={locale} />} /> : null}
          {f.instagram ? (
            <Row id="instagram" label={t("imp.f.instagram")} source={src(f.instagram)} keep={keep.instagram} onKeep={toggle("instagram")} editing={editing === "instagram"} onEdit={setEditing} value={<span dir="ltr">@{val.instagram}</span>}>
              <TextField label={t("imp.f.instagram")} hideLabel prefix="@" dir="ltr" value={val.instagram} onChange={(e) => set("instagram", e.target.value.replace(/^@/, ""))} />
            </Row>
          ) : null}
          {f.description ? (
            <Row id="description" label={t("imp.f.description")} source={src(f.description)} keep={keep.description} onKeep={toggle("description")} editing={editing === "description"} onEdit={setEditing} value={<span dir="auto" className="line-clamp-3 block">{val.description}</span>}>
              <TextField label={t("imp.f.description")} hideLabel type="textarea" value={val.description} maxLength={300} onChange={(e) => set("description", e.target.value)} />
            </Row>
          ) : null}
          {f.services ? (
            <li className="flex flex-col gap-2 py-3" data-import-row="services">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-meta-strong text-foreground">{t("imp.f.services")}</span>
                <SuggestionBadge>{t("imp.review.suggestion")}</SuggestionBadge>
              </div>
              <p className="text-meta text-muted-foreground">{t("imp.review.servicesHint")}</p>
              <div className="flex flex-col gap-1">
                {f.services.value.map((s, i) => (
                  <Checkbox
                    key={`${s.name}-${i}`}
                    checked={picked.has(i)}
                    onChange={(on) => setPicked((p) => { const n = new Set(p); if (on) n.add(i); else n.delete(i); return n; })}
                    label={<span><bdi>{s.name}</bdi> · <span className="tabular-nums">{s.priceCents === null ? t("imp.review.noPrice") : money.format(s.priceCents / 100)}</span></span>}
                  />
                ))}
              </div>
              <p className="text-meta text-muted-foreground">{src(f.services)}</p>
            </li>
          ) : null}
        </ul>
      </div>
    </StepCard>
  );
}

function SuggestionBadge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium leading-4 text-muted-foreground">{children}</span>;
}

function Row({ id, label, source, value, keep, onKeep, editing, onEdit, badge, children }: { id: Key; label: string; source: string | null; value: ReactNode; keep: boolean; onKeep: (on: boolean) => void; editing?: boolean; onEdit?: (k: Key | null) => void; badge?: string; children?: ReactNode }) {
  const { t } = useLocaleOrEnglish();
  return (
    <li className={cn("flex flex-col gap-2 py-3", !keep && "opacity-70")} data-import-row={id}>
      {/* Phones: the value gets the full width and the controls sit under it; wider screens put them on the end edge. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta-strong text-foreground">{label}</span>
            {badge ? <SuggestionBadge>{badge}</SuggestionBadge> : null}
          </div>
          <div className={cn("mt-1 text-body text-foreground", !keep && "line-through decoration-muted-foreground")}>{value}</div>
          {source ? <p className="mt-1 text-meta text-muted-foreground">{source}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-5 ps-3 sm:gap-1 sm:ps-0">
          {children && onEdit ? (
            <button type="button" onClick={() => onEdit(editing ? null : id)} aria-expanded={!!editing} aria-label={`${editing ? t("imp.review.editDone") : t("imp.review.edit")}: ${label}`} className="inline-flex h-11 min-w-11 items-center justify-center rounded-r2 px-2 text-body-strong text-link hover:underline focus-visible:focus-ring">
              {editing ? t("imp.review.editDone") : t("imp.review.edit")}
            </button>
          ) : null}
          <Checkbox checked={keep} onChange={onKeep} label={<span>{t("imp.review.keep")}<span className="sr-only">: {label}</span></span>} />
        </div>
      </div>
      {editing && children ? <div>{children}</div> : null}
    </li>
  );
}

const DAY_ORDER: merchantApi.DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
function HoursList({ hours, locale }: { hours: Hours; locale: string }) {
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-CA" : `${locale}-CA`, { weekday: "short", timeZone: "UTC" });
  // 2024-01-01 was a Monday.
  const name = (d: merchantApi.DayKey) => fmt.format(new Date(Date.UTC(2024, 0, 1 + DAY_ORDER.indexOf(d))));
  return (
    <ul className="flex flex-col gap-0.5 text-meta">
      {DAY_ORDER.filter((d) => hours[d]?.length).map((d) => (
        <li key={d} className="flex gap-3">
          <span className="w-12 shrink-0 text-muted-foreground">{name(d)}</span>
          <span dir="ltr" className="tabular-nums">{hours[d]!.map(([a, b]) => `${a}–${b}`).join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}
