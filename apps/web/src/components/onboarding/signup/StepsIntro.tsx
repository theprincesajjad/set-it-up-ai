"use client";
/**
 * Steps 1 and 2: "Do you have a website or Instagram?" (with the animated read), then "Is this you?" (the imported name, logo and
 * colour, editable, with everything else we found as opt-out ticks) or a plain name field when the owner skipped.
 */
import { Check, Info, Palette } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type MessageKey, type merchantApi, type siteImportApi } from "@ll/shared";
import { BFF_BASE, browserClient } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { LanguageSwitcher, useLocaleOrEnglish } from "@/lib/i18n";
import { formatNanp } from "@/lib/phone";
import { shopColorProps } from "@/lib/shopColor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion";
import { Checkbox } from "@/components/ui/Checkbox";
import { ColorField } from "@/components/ui/ColorField";
import { Icon3d } from "@/components/ui/Icon3d";
import { TextField } from "@/components/ui/TextField";
import type { SiteImportAccepted } from "../SiteImport";
import { CardPreview } from "./CardPreview";
import { hostOf, type SignupDraft } from "./draft";
import { StepFrame } from "./Shell";

// The read animation (motion) loads on demand; LinkStep warms it up as soon as the first step is on screen.
const loadReading = () => import("./Reading").then((m) => m.Reading);
const Reading = dynamic(loadReading, { ssr: false, loading: () => <div className="min-h-[70dvh]" aria-busy="true" /> });

type Result = siteImportApi.SiteImportResult;
export type Importer = (url: string) => Promise<Result>;
const defaultImporter: Importer = (url) => browserClient.post<Result>("/v1/site-import", { url });

export interface StepProps {
  draft: SignupDraft;
  update: (patch: Partial<SignupDraft>) => void;
  next: () => void;
}

export { hostOf };
export const fromLabel = (r: Result) => (r.kind === "instagram" ? `@${r.fields.instagram?.value ?? ""}` : hostOf(r.url));

// ---------------------------------------------------------------------------
// 1. Website or Instagram
// ---------------------------------------------------------------------------
export function LinkStep({ draft, update, next, importer = defaultImporter }: StepProps & { importer?: Importer }) {
  const { t } = useLocaleOrEnglish();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    void loadReading();
  }, []);

  async function read() {
    const u = url.trim();
    if (u.length < 3) return setError(t("imp.err.empty"));
    setError(null);
    setDone(false);
    setReading(u);
    const started = Date.now();
    try {
      const r = await importer(u);
      // Let the checklist finish its ticks: a read that answers from the cache in 50 ms should still feel like reading.
      setDone(true);
      await new Promise((ok) => setTimeout(ok, Math.max(0, 1600 - (Date.now() - started)) + 500));
      const f = r.fields;
      const guess = f.vertical?.value && (!draft.vertical || draft.verticalGuess) ? { vertical: f.vertical.value, verticalGuess: true } : {};
      update({ link: "read", imported: r, accepted: null, name: f.name?.value ?? draft.name, ...guess });
      next();
    } catch (err) {
      setError(isApiError(err) && err.message ? err.message : t("imp.err.generic"));
      setReading(null);
    }
  }

  if (reading) return <Reading target={reading} done={done} />;
  return (
    <StepFrame
      id="link"
      eyebrow={<Icon3d name="site" size={64} trade="inherit" surface="canvas" />}
      title={t("sf.link.title")}
      body={t("sf.link.body")}
      onSubmit={read}
      primary={t("imp.go")}
      after={<LanguageSwitcher />}
      secondary={{
        label: t("sf.link.skip"),
        onClick: () => {
          update({ link: "skipped" });
          next();
        },
      }}
    >
      <TextField name="siteImportUrl" label={t("imp.label")} placeholder={t("imp.placeholder")} value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} dir="ltr" maxLength={500} error={error} hint={t("sf.link.hint")} />
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------
// 2. Is this you? / What's your shop called?
// ---------------------------------------------------------------------------
type Extra = "phone" | "website" | "instagram" | "address" | "hours" | "description";
const EXTRAS: Extra[] = ["phone", "website", "instagram", "address", "hours", "description"];

export function ShopStep({ draft, update, next, onRelink, logoBase = BFF_BASE }: StepProps & { onRelink: () => void; logoBase?: string }) {
  const { t } = useLocaleOrEnglish();
  const r = draft.link === "read" ? draft.imported : null;
  const [name, setName] = useState(draft.name);
  const [error, setError] = useState<string | null>(null);
  const prev = draft.accepted;
  const f = r?.fields;
  const logoSrc = f?.logo ? `${logoBase}${f.logo.value}` : null;
  const [useLogo, setUseLogo] = useState(prev ? !!prev.logo : !!f?.logo);
  const [logoUrl, setLogoUrl] = useState(prev?.logoUrl ?? "");
  // Colour choices: the site's colour, its second colour, or the trade's own (no brand colour).
  const found = f?.brandColor?.value ?? null;
  const accent = f?.accentColor?.value ?? null;
  const [colour, setColour] = useState<string | null>(prev ? (prev.brandColor ?? null) : found);
  const [otherColour, setOtherColour] = useState(() => !!prev?.brandColor && prev.brandColor !== found && prev.brandColor !== accent);
  const [keep, setKeep] = useState<Record<Extra, boolean>>(() => Object.fromEntries(EXTRAS.map((k) => [k, prev ? prevHas(prev, k) : !!f?.[k]])) as Record<Extra, boolean>);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(f?.services && prev?.services ? f.services.value.flatMap((s, i) => (prev.services!.some((p) => p.name === s.name) ? [i] : [])) : []));
  const extrasFound = f ? EXTRAS.filter((k) => !!f[k]) : [];
  const logoUrlOk = !logoUrl || logoUrl.startsWith("https://");

  function go() {
    if (name.trim().length < 2) return setError(t("su.err.name"));
    if (!logoUrlOk) return;
    if (!r || !f) {
      update({ name: name.trim() });
      return next();
    }
    const a: SiteImportAccepted = { importId: r.id, from: fromLabel(r), name: name.trim() };
    if (useLogo && f.logo) Object.assign(a, { logo: true, logoPreview: logoSrc ?? undefined });
    if (logoUrl) a.logoUrl = logoUrl.trim();
    if (colour) a.brandColor = colour.toUpperCase();
    if (keep.phone && f.phone) a.phone = f.phone.value;
    if (keep.website && f.website) a.website = f.website.value;
    if (keep.instagram && f.instagram) a.instagram = f.instagram.value.replace(/^@/, "");
    if (keep.address && f.address) a.address = f.address.value;
    if (keep.hours && f.hours) a.hours = f.hours.value;
    if (keep.description && f.description) a.description = f.description.value;
    if (f.services && picked.size) a.services = f.services.value.filter((_, i) => picked.has(i)).map((s) => ({ name: s.name, priceCents: s.priceCents ?? 0 }));
    const patch: Partial<SignupDraft> = { name: name.trim(), accepted: a };
    if (a.phone && !draft.phone) patch.phone = a.phone.replace(/^\+1/, "").replace(/\D/g, "").slice(0, 10);
    if (a.address && !draft.address) patch.address = a.address;
    update(patch);
    next();
  }

  if (!r || !f)
    return (
      <StepFrame id="shop" title={t("sf.shop.title")} body={t("sf.shop.body")} onSubmit={go} primary={t("sf.continue")} secondary={{ label: t("sf.shop.haveSite"), onClick: onRelink }}>
        <TextField name="shopName" label={t("su.shopName")} hint={t("su.shopNameHint")} value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={120} autoComplete="organization" />
        <div className="lg:hidden">
          <CardPreview name={name} vertical={draft.vertical} card={null} compact />
        </div>
      </StepFrame>
    );

  const colourOptions = [found, accent].filter((c, i, a): c is string => !!c && a.indexOf(c) === i);
  return (
    <StepFrame id="shop" title={t("sf.shop.titleFound")} body={t("sf.shop.bodyFound", { site: fromLabel(r) })} onSubmit={go} primary={t("sf.shop.yes")} secondary={{ label: t("imp.review.restart"), onClick: onRelink }}>
      <div className="lg:hidden" data-import-preview>
        <CardPreview name={name} vertical={draft.vertical} brandColor={colour} logo={useLogo ? logoSrc : null} card={null} compact />
      </div>
      <div data-import-review className="flex flex-col gap-5">
        {r.notes.length ? (
          <ul className="flex flex-col gap-1 text-meta text-fg-muted" data-import-notes>
            {r.notes.map((n) => (
              <li key={n} className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                {t(`imp.note.${n}` as MessageKey)}
              </li>
            ))}
          </ul>
        ) : null}
        <div data-import-row="name">
          <TextField name="shopName" label={t("su.shopName")} hint={f.name ? t("imp.review.from", { source: t(`imp.src.${f.name.source}` as MessageKey) }) : t("su.shopNameHint")} value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={120} autoComplete="organization" />
        </div>
        {f.logo ? (
          <div className="flex items-center gap-4 rounded-r4 border border-border bg-card p-3 shadow-sm" data-import-row="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc!} alt={t("imp.review.logoAlt")} width={56} height={56} className="size-14 shrink-0 rounded-r2 border border-border bg-card object-contain" />
            <div className="min-w-0 flex-1">
              <Checkbox checked={useLogo} onChange={setUseLogo} label={t("sf.shop.useLogo")} />
            </div>
          </div>
        ) : r.kind === "instagram" ? (
          <TextField label={t("imp.review.logoLink")} optionalLabel hint={t("imp.review.logoLinkHint")} type="url" dir="ltr" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} error={logoUrlOk ? null : t("imp.review.logoLinkError")} />
        ) : (
          <p className="flex items-start gap-2 rounded-r4 bg-bg-subtle px-4 py-3 text-meta text-fg" data-import-row="logo-none">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
            {t("sf.shop.logoNone")}
          </p>
        )}
        <fieldset className="flex flex-col gap-2" data-import-row="brandColor">
          <legend className="mb-2 text-body font-[550] text-fg">{t("sf.shop.colour")}</legend>
          <div role="radiogroup" aria-label={t("sf.shop.colour")} className="flex flex-wrap gap-3">
            {colourOptions.map((c, i) => (
              <Swatch key={c} checked={colour === c} onPick={() => setColour(c)} label={i === 0 && c === found ? t("sf.shop.colourFound") : t("sf.shop.colourAccent")} colors={shopColorProps({ vertical: draft.vertical || null, brandColor: c })} value={c} />
            ))}
            <Swatch checked={colour === null} onPick={() => setColour(null)} label={t("sf.shop.colourTrade")} colors={shopColorProps({ vertical: draft.vertical || "other" })} />
          </div>
          {f.brandColor?.adjusted && colour === found ? <p className="text-meta text-fg-muted">{t("imp.review.colorAdjusted")}</p> : null}
          {/* Wave Q: none of these? The kit's ColorField (the trade palette, the system picker and a hex box, contrast-checked). */}
          {otherColour ? (
            <div className="mt-2 rounded-r4 border border-border bg-card p-4 animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none" data-import-other-colour>
              <ColorField label={t("sf.shop.otherColour")} value={colour && !colourOptions.includes(colour) ? colour : null} onChange={(c) => setColour(c)} vertical={draft.vertical || null} />
            </div>
          ) : (
            <button type="button" onClick={() => setOtherColour(true)} className="inline-flex h-11 items-center gap-2 self-start rounded-full px-1 text-body font-[550] text-link hover:underline focus-visible:focus-ring" data-import-other-colour-open>
              <Palette aria-hidden className="size-4.5" strokeWidth={1.8} />
              {t("sf.shop.otherColour")}
            </button>
          )}
        </fieldset>
        {extrasFound.length || f.services ? (
          <Accordion defaultValue={["more"]} className="rounded-r4 border border-border bg-card px-4 shadow-sm">
            <AccordionItem value="more">
              <AccordionTrigger className="min-h-12 items-center text-body font-[550] text-fg hover:no-underline">
                <span className="flex items-center gap-2">
                  {t("sf.shop.more")}
                  <span className="rounded-full bg-trade-soft px-2 py-0.5 text-caption font-[600] tabular-nums text-trade-deep">{extrasFound.length + (f.services ? 1 : 0)}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent keepMounted className="pb-0">
                <div className="border-t border-border pb-1">
                <p className="pt-3 text-meta text-fg-muted">{t("sf.shop.moreHint")}</p>
                <ul className="flex flex-col divide-y divide-border">
                  {extrasFound.map((k) => (
                    <li key={k} className="py-3" data-import-row={k}>
                      <Checkbox
                        checked={keep[k]}
                        onChange={(on) => setKeep((s) => ({ ...s, [k]: on }))}
                        label={
                          <span className="flex flex-col">
                            <span className="text-meta-strong text-fg">{t(`imp.f.${k}` as MessageKey)}</span>
                            <span className={cn("text-body text-fg", !keep[k] && "text-fg-muted line-through")}>{extraValue(k, f, t)}</span>
                          </span>
                        }
                      />
                    </li>
                  ))}
                  {f.services ? (
                    <li className="flex flex-col gap-1 py-3" data-import-row="services">
                      <span className="text-meta-strong text-fg">{t("imp.f.services")}</span>
                      <span className="text-meta text-fg-muted">{t("imp.review.servicesHint")}</span>
                      {f.services.value.map((s, i) => (
                        <Checkbox
                          key={`${s.name}-${i}`}
                          checked={picked.has(i)}
                          onChange={(on) => setPicked((p) => { const n = new Set(p); if (on) n.add(i); else n.delete(i); return n; })}
                          label={<ServiceLabel name={s.name} cents={s.priceCents} />}
                        />
                      ))}
                    </li>
                  ) : null}
                </ul>
              </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </div>
    </StepFrame>
  );
}

function prevHas(a: SiteImportAccepted, k: Extra): boolean {
  return !!a[k];
}

function extraValue(k: Extra, f: Result["fields"], t: ReturnType<typeof useLocaleOrEnglish>["t"]): ReactNode {
  if (k === "phone") return <span dir="ltr">{formatNanp(f.phone!.value.replace(/^\+1/, ""))}</span>;
  if (k === "website") return <span dir="ltr" className="break-all">{f.website!.value}</span>;
  if (k === "instagram") return <span dir="ltr">@{f.instagram!.value.replace(/^@/, "")}</span>;
  if (k === "address") return <bdi>{f.address!.value}</bdi>;
  if (k === "description") return <span dir="auto" className="line-clamp-2">{f.description!.value}</span>;
  const days = Object.values(f.hours!.value as merchantApi.Hours).filter((d) => d?.length).length;
  return t("sf.shop.hoursDays", { n: days });
}

function ServiceLabel({ name, cents }: { name: string; cents: number | null }) {
  const { t, locale } = useLocaleOrEnglish();
  const money = useMemo(() => new Intl.NumberFormat(locale === "en" ? "en-CA" : `${locale}-CA`, { style: "currency", currency: "CAD" }), [locale]);
  return (
    <span>
      <bdi>{name}</bdi> · <span className="tabular-nums">{cents === null ? t("imp.review.noPrice") : money.format(cents / 100)}</span>
    </span>
  );
}

function Swatch({ checked, onPick, label, colors, value }: { checked: boolean; onPick: () => void; label: string; colors: ReturnType<typeof shopColorProps>; value?: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onPick} className={cn("flex min-h-11 items-center gap-2.5 rounded-full border bg-card py-1.5 pe-4 ps-1.5 text-meta font-[550] text-fg focus-visible:focus-ring", checked ? "border-fg shadow-[0_0_0_1px_var(--foreground)]" : "border-border hover:bg-bg-subtle")}>
      <span {...colors} aria-hidden className="grid size-8 place-items-center rounded-full bg-trade text-trade-foreground">
        {checked ? <Check className="size-4" strokeWidth={3} /> : null}
      </span>
      <span className="flex flex-col items-start leading-4">
        {label}
        {value ? (
          <span dir="ltr" className="text-caption font-normal tabular-nums text-fg-muted">
            {value.toUpperCase()}
          </span>
        ) : null}
      </span>
    </button>
  );
}
