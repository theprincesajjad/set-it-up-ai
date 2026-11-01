"use client";
/**
 * Settings, "Refresh from my website" (wave O, team import). The owner reads their website again (the same server-side import
 * as onboarding step 1) and sees, field by field, what is on the site against what the shop has now. Nothing changes until they
 * tick the fields to take and press Update; then POST /v1/merchants/:id/site-import/apply saves only those.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { MessageKey, merchantApi, siteImportApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ShopLogo } from "@/components/ui/ShopTile";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { BFF_BASE, browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { formatNanp } from "@/lib/phone";
import { shopColorProps } from "@/lib/shopColor";

type Result = siteImportApi.SiteImportResult;
type DiffKey = "name" | "logo" | "brandColor" | "phone" | "website" | "instagram" | "description" | "hours";

interface DiffRow {
  key: DiffKey;
  now: ReactNode;
  found: ReactNode;
  source: siteImportApi.SiteImportSource;
}

const hoursLine = (h: merchantApi.Hours | null | undefined) =>
  h ? (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).filter((d) => h[d]?.length).map((d) => `${d} ${h[d]!.map(([a, b]) => `${a}–${b}`).join(", ")}`).join(" · ") : "";

/** The fields where the website says something different from the shop. Exported for tests. */
export function diffRows(m: Pick<merchantApi.MerchantProfile, "name" | "logoUrl" | "brandColor" | "phone" | "website" | "instagram" | "description" | "vertical" | "hours">, r: Result, logoBase = BFF_BASE): DiffRow[] {
  const f = r.fields;
  const rows: DiffRow[] = [];
  const swatch = (c: string | null) => (c ? <span className="inline-flex items-center gap-2"><span aria-hidden {...shopColorProps({ vertical: m.vertical, brandColor: c })} className="size-5 rounded-full border border-line bg-trade" /><span dir="ltr">{c.toUpperCase()}</span></span> : null);
  if (f.name && f.name.value !== m.name) rows.push({ key: "name", now: <bdi>{m.name}</bdi>, found: <bdi>{f.name.value}</bdi>, source: f.name.source });
  if (f.logo)
    rows.push({
      key: "logo",
      now: <ShopLogo shop={{ name: m.name, vertical: m.vertical, logoUrl: m.logoUrl, brandColor: m.brandColor }} size={40} />,
      // eslint-disable-next-line @next/next/no-img-element
      found: <img src={`${logoBase}${f.logo.value}`} alt="" width={40} height={40} className="size-10 rounded-full border border-line bg-card object-cover" />,
      source: f.logo.source,
    });
  if (f.brandColor && f.brandColor.value.toUpperCase() !== (m.brandColor ?? "").toUpperCase()) rows.push({ key: "brandColor", now: swatch(m.brandColor), found: swatch(f.brandColor.value), source: f.brandColor.source });
  if (f.phone && f.phone.value !== m.phone) rows.push({ key: "phone", now: m.phone ? <span dir="ltr">{formatNanp(m.phone.replace(/^\+1/, ""))}</span> : null, found: <span dir="ltr">{formatNanp(f.phone.value.replace(/^\+1/, ""))}</span>, source: f.phone.source });
  if (f.website && f.website.value.replace(/\/$/, "") !== (m.website ?? "").replace(/\/$/, "")) rows.push({ key: "website", now: m.website ? <span dir="ltr" className="break-all">{m.website}</span> : null, found: <span dir="ltr" className="break-all">{f.website.value}</span>, source: f.website.source });
  if (f.instagram && f.instagram.value !== (m.instagram ?? "").replace(/^@/, "")) rows.push({ key: "instagram", now: m.instagram ? <span dir="ltr">@{m.instagram.replace(/^@/, "")}</span> : null, found: <span dir="ltr">@{f.instagram.value}</span>, source: f.instagram.source });
  if (f.description && f.description.value !== (m.description ?? "")) rows.push({ key: "description", now: m.description ? <span dir="auto" className="line-clamp-3 block">{m.description}</span> : null, found: <span dir="auto" className="line-clamp-3 block">{f.description.value}</span>, source: f.description.source });
  if (f.hours && hoursLine(f.hours.value) !== hoursLine(m.hours)) rows.push({ key: "hours", now: hoursLine(m.hours) || null, found: <span dir="ltr">{hoursLine(f.hours.value)}</span>, source: f.hours.source });
  return rows;
}

export function SiteRefresh({ onApplied }: { onApplied?: () => void }) {
  const { detail, setDetail } = useMerchant();
  const m = detail.merchant;
  const { t } = useLocaleOrEnglish();
  const toast = useToast();
  const [url, setUrl] = useState(m.website ?? (m.instagram ? `@${m.instagram.replace(/^@/, "")}` : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [picked, setPicked] = useState<Set<DiffKey>>(() => new Set());
  const rows = useMemo(() => (result ? diffRows(m, result) : []), [m, result]);

  async function check(e: FormEvent) {
    e.preventDefault();
    if (url.trim().length < 3) return setError(t("imp.err.empty"));
    setBusy(true);
    setError(null);
    try {
      setResult(await browserClient.post<Result>(`/v1/merchants/${m.id}/site-import`, { url: url.trim() }));
      setPicked(new Set());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result || !picked.size) return;
    const f = result.fields;
    const body: siteImportApi.SiteImportApplyBody = { importId: result.id };
    if (picked.has("name") && f.name) body.name = f.name.value;
    if (picked.has("logo") && f.logo) body.logo = true;
    if (picked.has("brandColor") && f.brandColor) body.brandColor = f.brandColor.value;
    if (picked.has("phone") && f.phone) body.phone = f.phone.value;
    if (picked.has("website") && f.website) body.website = f.website.value;
    if (picked.has("instagram") && f.instagram) body.instagram = f.instagram.value;
    if (picked.has("description") && f.description) body.description = f.description.value;
    if (picked.has("hours") && f.hours) body.hours = f.hours.value;
    setBusy(true);
    setError(null);
    try {
      await browserClient.post(`/v1/merchants/${m.id}/site-import/apply`, body);
      setDetail(await browserClient.get<merchantApi.MerchantDetail>(`/v1/merchants/${m.id}`));
      setResult(null);
      toast({ message: t("imp.settings.saved"), tone: "success" });
      onApplied?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={t("imp.settings.title")} description={t("imp.settings.body")}>
      <div className="flex flex-col gap-4" data-site-refresh>
        {error ? <Banner tone="warning">{error}</Banner> : null}
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate onSubmit={check}>
          <div className="min-w-0 flex-1">
            <TextField label={t("imp.settings.label")} placeholder={t("imp.placeholder")} type="text" inputMode="url" autoCapitalize="none" spellCheck={false} dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} />
          </div>
          <Button type="submit" variant="secondary" size="sm" loading={busy && !result}>
            {t("imp.settings.go")}
          </Button>
        </form>
        {result ? (
          <>
            {result.notes.filter((n) => n !== "ai_tidied").map((n) => <Banner key={n} tone="info">{t(`imp.note.${n}` as MessageKey)}</Banner>)}
            {rows.length ? (
              <section aria-labelledby="site-refresh-diff" className="flex flex-col gap-2">
                <h3 id="site-refresh-diff" className="text-body-strong text-fg">{t("imp.settings.diffTitle")}</h3>
                <ul className="flex flex-col divide-y divide-line border-y border-line">
                  {rows.map((r) => (
                    <li key={r.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4" data-diff-row={r.key}>
                      <div className="sm:w-40 sm:shrink-0">
                        <Checkbox
                          checked={picked.has(r.key)}
                          onChange={(on) => setPicked((p) => { const n = new Set(p); if (on) n.add(r.key); else n.delete(r.key); return n; })}
                          label={t(`imp.f.${r.key}` as MessageKey)}
                        />
                      </div>
                      <dl className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-meta text-fg-muted">{t("imp.settings.now")}</dt>
                          <dd className="text-body text-fg">{r.now ?? <span className="text-fg-muted">{t("imp.settings.empty")}</span>}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-meta text-fg-muted">{t("imp.settings.found")}</dt>
                          <dd className="text-body text-fg">{r.found}</dd>
                          <dd className="mt-1 text-meta text-fg-muted">{t("imp.review.from", { source: t(`imp.src.${r.source}` as MessageKey) })}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
                    {t("imp.settings.cancel")}
                  </Button>
                  <Button size="sm" onClick={() => void apply()} disabled={!picked.size} loading={busy}>
                    {t("imp.settings.apply", { n: picked.size })}
                  </Button>
                </div>
              </section>
            ) : (
              <p className="text-body text-fg-muted">{t("imp.settings.none")}</p>
            )}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
