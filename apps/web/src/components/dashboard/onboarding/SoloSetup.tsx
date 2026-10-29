"use client";
/**
 * Solo-pro setup (docs/design/onboarding-v1.md §3.3, §3.5): six cards to a live booking link in under three minutes, the "Later"
 * group, and the live preview of the real booking page. Built with the onboarding kit (components/onboarding, workstream C) in the
 * Clear content layer: cards, not glass; the preview pill is the only glass. Every save returns the fresh checklist, so the rail,
 * the card and the preview update from one response.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SERVICE_RADII_KM, SOLO_STEP_SECONDS, type appointmentsApi, type merchantApi } from "@ll/shared";
import { AddRow, ChoiceGroup, ChoiceTile, LivePreview, PlanLine, ServiceRow, SetupProgress, ShareRow, StepCard, WeekStrip, type SetupStep } from "@/components/onboarding";
import { BookFlow } from "@/components/pass/BookFlow";
import { Banner } from "@/components/ui/Banner";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { Icon3d } from "@/components/ui/Icon3d";
import { QrCode } from "@/components/ui/QrCode";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { useLocale } from "@/lib/i18n/client";
import { SOLO_STEP_ICON, centsToField, fieldToCents, parsePeople, smsHref, soloApi } from "@/lib/dashboard/onboarding";
import { useMerchant } from "../MerchantContext";

type Checklist = merchantApi.OnboardingChecklist;
type Solo = merchantApi.SoloSetupDto;
type T = ReturnType<typeof useLocale>["t"];

export function SoloSetup({ checklist, onChange, footer }: { checklist: Checklist; onChange: (c: Checklist) => void; footer?: ReactNode }) {
  const { t } = useLocale();
  const { base, detail, merchantId } = useMerchant();
  const params = useSearchParams();
  const router = useRouter();
  const solo = checklist.solo!;
  const steps = [...checklist.steps, ...checklist.later];
  const wanted = params.get("step");
  const first = checklist.steps.find((s) => !s.done)?.key ?? checklist.steps[checklist.steps.length - 1]!.key;
  const [key, setKey] = useState<string>(steps.some((s) => s.key === wanted) ? wanted! : first);
  const coreKeys = checklist.steps.map((s) => s.key as string);
  const go = (k: string) => {
    setKey(k);
    router.replace(`${base}/setup?step=${k}`, { scroll: false });
    requestAnimationFrame(() => document.getElementById("solo-card")?.focus({ preventScroll: true }));
  };
  const next = (c: Checklist) => {
    onChange(c);
    const i = coreKeys.indexOf(key);
    const after = c.steps.slice(i + 1).find((s) => !s.done) ?? c.steps.find((s) => !s.done);
    if (after) go(after.key);
    else if (i >= 0 && i < coreKeys.length - 1) go(coreKeys[i + 1]!);
    else router.push(base);
  };
  const api = useMemo(() => soloApi(merchantId), [merchantId]);
  const trade = detail.merchant.vertical;
  const rail: SetupStep[] = checklist.steps.map((s) => ({ id: s.key, title: s.label, time: SOLO_STEP_SECONDS[s.key] ? t("ob.solo.seconds", { n: SOLO_STEP_SECONDS[s.key]! }) : undefined, state: s.key === key ? "current" : s.done ? "done" : "todo", onSelect: () => go(s.key) }));
  const shared = checklist.steps.find((s) => s.key === "share")?.done;

  return (
    <div className="flex flex-col gap-6">
      {solo.live && shared ? (
        <div data-testid="solo-live">
          <Banner tone="success" title={t("ob.solo.live")}>
            {solo.secondsToLive !== null ? t("ob.solo.liveIn", { time: durationLabel(solo.secondsToLive, t) }) : null}
          </Banner>
        </div>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <SetupProgress title={t("ob.solo.pageTitle")} steps={rail} />
          <LaterList steps={checklist.later} current={key} onPick={go} t={t} className="hidden md:block" />
        </div>
        <div className="flex min-w-0 flex-col gap-4" id="solo-card" tabIndex={-1}>
          <Card key={key} k={key} solo={solo} checklist={checklist} api={api} trade={trade} next={next} onChange={onChange} go={go} base={base} />
          <LaterList steps={checklist.later} current={key} onPick={go} t={t} className="md:hidden" />
          {footer}
        </div>
        <LivePreview version={previewVersion(solo, detail.merchant.name)} pillLabel={t("ob.solo.preview")} frameLabel={t("ob.solo.previewTitle")} closeLabel={t("ob.solo.previewClose")}>
          <Preview solo={solo} step={key} />
        </LivePreview>
      </div>
    </div>
  );
}

function durationLabel(seconds: number, t: T): string {
  if (seconds < 90) return t("ob.solo.seconds", { n: seconds });
  return t("ob.min.min", { n: Math.round(seconds / 60) });
}

function previewVersion(s: Solo, name: string) {
  return [name, s.slug, s.services.map((x) => `${x.name}${x.priceCents}${x.depositCents}`).join(), s.addressVisibility, s.areaLabel, s.hours.length].join("|");
}

function LaterList({ steps, current, onPick, t, className }: { steps: merchantApi.OnboardingStep[]; current: string; onPick: (k: string) => void; t: T; className?: string }) {
  return (
    <section aria-label={t("ob.solo.later")} className={className}>
      <h2 className="text-meta font-[550] text-muted-foreground">{t("ob.solo.later")}</h2>
      <ul className="mt-2 flex flex-col">
        {steps.map((s) => (
          <li key={s.key}>
            <button type="button" aria-current={s.key === current ? "step" : undefined} onClick={() => onPick(s.key)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-r2 text-start text-body font-[550] text-foreground focus-visible:focus-ring md:min-h-9">
              <span className={s.key === current ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              {s.done ? <span className="text-meta text-muted-foreground">{t("ob.solo.done")}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The live preview: the real booking page, read-only, with the shop's saved data
// ---------------------------------------------------------------------------
function Preview({ solo, step }: { solo: Solo; step: string }) {
  const { detail } = useMerchant();
  const { t } = useLocale();
  const m = detail.merchant;
  const data: appointmentsApi.PublicServicesResponse = {
    shop: { name: m.name, slug: solo.slug, timezone: m.timezone, address: solo.addressVisibility === "exact" ? (detail.locations[0]?.address ?? null) : null, phone: m.phone, logoUrl: m.logoUrl, brandColor: m.brandColor, locationId: detail.locations[0]?.id ?? null, vertical: m.vertical, addressVisibility: solo.addressVisibility, placeLine: placeLine(solo, t), areaLabel: solo.addressVisibility === "area" ? solo.areaLabel : null, city: solo.city },
    tax: { applies: false, name: "HST" },
    policy: { cancelWindowHours: 24, noShowFeeCents: 0, takesCards: true },
    services: solo.services.map((s) => ({ id: s.id, name: s.name, description: null, durationMin: s.durationMin, priceCents: s.priceCents, priceFrom: false, depositCents: s.depositCents, categoryName: null, translations: {}, staffIds: [], taxable: false, staffOverrides: [] })),
    staff: [],
  };
  return (
    <div className="h-full overflow-y-auto bg-background px-4 pt-4">
      {step === "privacy" ? (
        <div className="mb-4 flex items-center gap-3 rounded-r4 border border-border bg-card p-3" data-testid="preview-privacy">
          <Icon3d name="pin_area" size={40} trade={m.vertical} />
          <div className="min-w-0">
            <p className="text-body font-[550] text-foreground">{t("shop.byAppt", { place: placeLine(solo, t) })}</p>
            <p className="text-meta text-muted-foreground">{t("ob.solo.privacy.confirmCard")}</p>
          </div>
        </div>
      ) : null}
      <BookFlow shop={{ name: m.name, slug: solo.slug, logoUrl: m.logoUrl, brandColor: m.brandColor, phone: m.phone }} data={data} signedIn={false} />
    </div>
  );
}

function placeLine(s: Pick<Solo, "addressVisibility" | "areaLabel" | "city">, t: T): string {
  if (s.addressVisibility === "area" && s.areaLabel) return t("shop.area", { area: s.areaLabel });
  return s.city;
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------
interface CardProps {
  k: string;
  solo: Solo;
  checklist: Checklist;
  api: ReturnType<typeof soloApi>;
  trade: string;
  next: (c: Checklist) => void;
  onChange: (c: Checklist) => void;
  go: (k: string) => void;
  base: string;
}

function Card(p: CardProps) {
  switch (p.k) {
    case "your_link":
      return <LinkCard {...p} />;
    case "services":
      return <ServicesCard {...p} />;
    case "hours":
      return <HoursCard {...p} />;
    case "privacy":
      return <PrivacyCard {...p} />;
    case "share":
      return <ShareCard {...p} />;
    case "invite":
      return <InviteCard {...p} />;
    case "staff":
      return <StaffCard {...p} />;
    default:
      return <LaterCard {...p} />;
  }
}

/** Run a save; on success hand back the checklist, on failure show the reason on the card. */
function useSave() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async <R,>(which: string, fn: () => Promise<R>): Promise<R | null> => {
    setBusy(which);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run, setError };
}

function Err({ text }: { text: string | null }) {
  return text ? <Banner tone="danger" className="mb-3">{text}</Banner> : null;
}

function LinkCard({ solo, api, trade, next }: CardProps) {
  const { t } = useLocale();
  const s = useSave();
  const [slug, setSlug] = useState(solo.slug);
  const [handle, setHandle] = useState(solo.instagram ? `@${solo.instagram}` : "");
  // Results are kept with the text they answer, so a stale answer never shows for a newer value.
  const [checkRes, setCheck] = useState<{ slug: string; available: boolean; suggestion: string | null } | null>(null);
  const [handleRes, setHandleRes] = useState<{ handle: string; slug: string | null } | null>(null);
  const host = solo.displayLink.slice(0, solo.displayLink.length - solo.slug.length);
  const typed = slug.trim().toLowerCase();
  useEffect(() => {
    if (!typed || typed === solo.slug) return;
    const id = setTimeout(() => void api.slug(typed).then(setCheck).catch(() => undefined), 300);
    return () => clearTimeout(id);
  }, [typed, solo.slug, api]);
  useEffect(() => {
    const h = handle.trim();
    if (!h) return;
    const id = setTimeout(() => void api.slug(h).then((r) => setHandleRes({ handle: h, slug: r.available ? r.slug : null })).catch(() => undefined), 300);
    return () => clearTimeout(id);
  }, [handle, api]);
  const check = checkRes && checkRes.slug === typed && typed !== solo.slug ? checkRes : null;
  const fromHandle = handleRes && handleRes.handle === handle.trim() && handleRes.slug && handleRes.slug !== typed ? handleRes.slug : null;
  const fmt = !/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/.test(slug.trim().toLowerCase());
  const fieldError = slug && fmt ? t("ob.solo.link.format") : check && !check.available ? (check.suggestion ? t("ob.solo.link.taken", { suggestion: check.suggestion }) : t("ob.solo.link.takenPlain")) : undefined;
  return (
    <StepCard
      headingId="card-title"
      icon={SOLO_STEP_ICON.your_link!}
      trade={trade}
      title={t("ob.solo.link.title")}
      body={t("ob.solo.link.body")}
      onSubmit={async (e) => {
        e.preventDefault();
        if (fieldError) return;
        const r = await s.run("save", () => api.link({ slug: slug.trim().toLowerCase(), instagram: handle.trim() || null }));
        if (r) next(r);
      }}
      primary={{ label: t("ob.solo.saveContinue"), loading: s.busy === "save", type: "submit" }}
      secondary={{ label: t("ob.solo.skip"), onClick: async () => { const r = await s.run("skip", () => api.complete("your_link")); if (r) next(r); } }}
    >
      <Err text={s.error} />
      <div className="flex flex-col gap-4">
        <TextField label={t("ob.solo.link.field")} prefix={host} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} error={fieldError} hint={!fieldError ? t("ob.solo.link.free", { link: `${host}${slug}` }) : undefined} autoComplete="off" spellCheck={false} maxLength={40} dir="ltr" />
        <TextField label={t("ob.solo.link.handle")} hint={t("ob.solo.link.handleHint")} value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="off" spellCheck={false} maxLength={60} dir="ltr" placeholder="@" />
        {fromHandle ? (
          <button type="button" onClick={() => setSlug(fromHandle)} className="relative self-start rounded-r2 text-body font-[550] text-link hover:underline focus-visible:focus-ring after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']">
            {t("ob.solo.link.useHandle", { slug: fromHandle })}
          </button>
        ) : null}
      </div>
    </StepCard>
  );
}

interface Row {
  id: string;
  name: string;
  duration: string;
  price: string;
  depositOn: boolean;
  deposit: string;
  checked: boolean;
  custom: boolean;
}

function initialRows(solo: Solo): Row[] {
  const saved = new Map(solo.services.map((s) => [s.name.toLowerCase(), s]));
  const rows: Row[] = solo.starters.map((st, i) => {
    const s = saved.get(st.name.toLowerCase());
    const dep = s ? s.depositCents : st.depositCents;
    return { id: `st${i}`, name: st.name, duration: String(s?.durationMin ?? st.durationMin), price: centsToField(s?.priceCents ?? st.priceCents), depositOn: dep > 0, deposit: centsToField(dep || Math.min(1500, st.priceCents)), checked: solo.services.length ? !!s : true, custom: false };
  });
  for (const s of solo.services) if (!solo.starters.some((st) => st.name.toLowerCase() === s.name.toLowerCase())) rows.push({ id: s.id, name: s.name, duration: String(s.durationMin), price: centsToField(s.priceCents), depositOn: s.depositCents > 0, deposit: centsToField(s.depositCents || 1500), checked: true, custom: false });
  return rows;
}

function ServicesCard({ solo, api, trade, next }: CardProps) {
  const { t, money } = useLocale();
  const s = useSave();
  const [rows, setRows] = useState<Row[]>(() => initialRows(solo));
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const items = (all: boolean) =>
    rows
      .filter((r) => (all || r.checked) && r.name.trim())
      .map((r) => {
        const price = fieldToCents(r.price) ?? 0;
        return { name: r.name.trim(), durationMin: Math.max(5, Math.min(720, Number(r.duration) || 30)), priceCents: price, depositCents: r.depositOn ? Math.min(price || Infinity, fieldToCents(r.deposit) ?? 0) : 0 };
      });
  const save = async (all: boolean) => {
    const body = items(all);
    if (!body.length) return s.setError(t("ob.solo.services.none"));
    const r = await s.run(all ? "all" : "save", () => api.services({ items: body }));
    if (r) next(r);
  };
  return (
    <StepCard
      headingId="card-title"
      icon={SOLO_STEP_ICON.services!}
      trade={trade}
      title={t("ob.solo.services.title")}
      body={t("ob.solo.services.body")}
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      primary={{ label: t("ob.solo.saveContinue"), loading: s.busy === "save", type: "submit" }}
      secondary={{ label: t("ob.solo.services.addAll"), onClick: () => void save(true), disabled: !!s.busy }}
    >
      <Err text={s.error} />
      <div role="list" aria-label={t("ob.solo.services.title")}>
        {rows.map((r) => (
          <div role="listitem" key={r.id}>
            {r.custom ? <TextField label={t("ob.solo.services.newName")} value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} maxLength={120} className="mt-3" autoFocus /> : null}
            <ServiceRow
              checked={r.checked}
              onCheckedChange={(v) => set(r.id, { checked: v })}
              name={r.name || t("ob.solo.services.newName")}
              duration={r.duration}
              price={r.price}
              onDurationChange={(v) => set(r.id, { duration: v.replace(/\D/g, "").slice(0, 3) })}
              onPriceChange={(v) => set(r.id, { price: v.replace(/[^0-9.]/g, "").slice(0, 7) })}
              labels={{ duration: `${r.name || t("ob.solo.services.newName")}: ${t("ob.solo.services.minutes")}`, price: `${r.name || t("ob.solo.services.newName")}: ${t("ob.solo.services.price")}` }}
              deposit={{ on: r.depositOn, onChange: (v) => set(r.id, { depositOn: v }), label: t("ob.solo.services.deposit"), amount: money(fieldToCents(r.deposit) ?? 0) }}
            />
          </div>
        ))}
      </div>
      <AddRow label={t("ob.solo.services.add")} onClick={() => setRows((rs) => [...rs, { id: `new${rs.length}${Date.now()}`, name: "", duration: "60", price: "", depositOn: false, deposit: "15", checked: true, custom: true }])} />
      <p className="mt-3 text-meta text-muted-foreground">{t("ob.solo.services.depositHint")}</p>
    </StepCard>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 0];

function HoursCard({ solo, api, trade, next }: CardProps) {
  const { t, date } = useLocale();
  const s = useSave();
  const initial = useMemo(() => {
    const base = solo.hours.length ? solo.hours : [2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "10:00", endsLocal: "18:00" }));
    return Object.fromEntries(WEEK.map((d) => {
      const h = base.find((x) => x.weekday === d);
      return [d, { on: !!h, start: h?.startsLocal ?? "10:00", end: h?.endsLocal ?? "18:00" }];
    })) as Record<number, { on: boolean; start: string; end: string }>;
  }, [solo.hours]);
  const [week, setWeek] = useState(initial);
  const [sel, setSel] = useState<number>(WEEK.find((d) => initial[d]!.on) ?? 2);
  // Jan 4 2026 is a Sunday: day names in the reader's language.
  const dayName = (d: number, style: "short" | "long") => date(new Date(Date.UTC(2026, 0, 4 + d, 12)), { weekday: style }, "UTC");
  const cur = week[sel]!;
  const save = async () => {
    const days = WEEK.filter((d) => week[d]!.on).map((d) => ({ weekday: d, startsLocal: week[d]!.start, endsLocal: week[d]!.end }));
    if (!days.length) return s.setError(t("ob.solo.hours.none"));
    if (days.some((d) => d.endsLocal <= d.startsLocal)) return s.setError(t("ob.solo.hours.order"));
    const r = await s.run("save", () => api.hours({ days }));
    if (r) next(r);
  };
  return (
    <StepCard
      headingId="card-title"
      icon={SOLO_STEP_ICON.hours!}
      trade={trade}
      title={t("ob.solo.hours.title")}
      body={t("ob.solo.hours.body")}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      primary={{ label: t("ob.solo.saveContinue"), loading: s.busy === "save", type: "submit" }}
      secondary={{ label: t("ob.solo.hours.defaults"), onClick: async () => { const r = await s.run("defaults", () => api.hours({ days: [] })); if (r) next(r); }, disabled: !!s.busy }}
    >
      <Err text={s.error} />
      <WeekStrip
        days={WEEK.map((d) => ({ id: d, label: dayName(d, "short"), name: dayName(d, "long"), off: !week[d]!.on }))}
        selected={sel}
        onSelect={setSel}
        hours={{ start: cur.start, end: cur.end }}
        onHoursChange={(h) => setWeek((w) => ({ ...w, [sel]: { ...w[sel]!, on: true, start: h.start, end: h.end } }))}
        labels={{ start: t("ob.solo.hours.start"), end: t("ob.solo.hours.end"), sameEveryDay: t("ob.solo.hours.same"), days: t("ob.solo.hours.days") }}
        onSameEveryDay={() => setWeek((w) => Object.fromEntries(WEEK.map((d) => [d, w[d]!.on ? { ...w[d]!, start: cur.start, end: cur.end } : w[d]!])) as typeof w)}
      />
      <label className="mt-3 flex min-h-11 items-center gap-3 text-body text-foreground">
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={cur.on} onChange={(e) => setWeek((w) => ({ ...w, [sel]: { ...w[sel]!, on: e.target.checked } }))} />
        {t("ob.solo.hours.working", { day: dayName(sel, "long") })}
      </label>
    </StepCard>
  );
}

function PrivacyCard({ solo, api, trade, next }: CardProps) {
  const { t } = useLocale();
  const s = useSave();
  const [vis, setVis] = useState<"area" | "city" | "exact">(solo.addressVisibility);
  const [street, setStreet] = useState("");
  const [postal, setPostal] = useState(solo.postalCode ?? "");
  const [radius, setRadius] = useState<number>(solo.serviceRadiusKm ?? 10);
  const area = solo.areaLabel ?? t("ob.solo.privacy.yourArea");
  const save = async () => {
    const body: merchantApi.SoloPrivacyBody =
      solo.workSetting === "home"
        ? { visibility: vis === "exact" ? "area" : vis, postalCode: postal.trim() || null, ...(street.trim() ? { address: street.trim() } : {}) }
        : solo.workSetting === "mobile"
          ? { visibility: "city", serviceRadiusKm: radius as 5 | 10 | 20 }
          : { visibility: "exact" };
    const r = await s.run("save", () => api.privacy(body));
    if (r) next(r);
  };
  return (
    <StepCard
      headingId="card-title"
      icon={SOLO_STEP_ICON.privacy!}
      trade={trade}
      title={t("ob.solo.privacy.title")}
      body={solo.workSetting === "home" ? (vis === "city" ? t("ob.solo.privacy.city", { city: solo.city }) : t("ob.solo.privacy.area", { area })) : solo.workSetting === "mobile" ? t("ob.solo.privacy.city", { city: solo.city }) : t("ob.solo.privacy.shop")}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      primary={{ label: t("ob.solo.saveContinue"), loading: s.busy === "save", type: "submit" }}
    >
      <Err text={s.error} />
      {solo.workSetting === "home" ? (
        <div className="flex flex-col gap-4">
          <ChoiceGroup value={vis} onValueChange={(v) => setVis(v as "area" | "city")} aria-label={t("ob.solo.privacy.title")} className="sm:grid-cols-2">
            <ChoiceTile value="area" icon="pin_area" trade={trade} label={t("ob.solo.privacy.showArea")} hint={t("ob.solo.privacy.showAreaHint")} />
            <ChoiceTile value="city" icon="domain" trade={trade} label={t("ob.solo.privacy.showCity")} hint={t("ob.solo.privacy.showCityHint")} />
          </ChoiceGroup>
          <TextField label={t("ob.solo.privacy.postal")} value={postal} onChange={(e) => setPostal(e.target.value.toUpperCase())} maxLength={7} autoComplete="postal-code" dir="ltr" className="max-w-[200px]" />
          <TextField label={t("ob.solo.privacy.street")} hint={t("ob.solo.privacy.streetHint")} value={street} onChange={(e) => setStreet(e.target.value)} placeholder={solo.hasStreetAddress ? "••••" : undefined} autoComplete="street-address" maxLength={300} />
        </div>
      ) : solo.workSetting === "mobile" ? (
        <div className="flex flex-col gap-2">
          <p className="text-body font-[550] text-foreground">{t("ob.solo.privacy.radius")}</p>
          <ChipGroup label={t("ob.solo.privacy.radius")}>
            {SERVICE_RADII_KM.map((km) => (
              <Chip key={km} selected={radius === km} onClick={() => setRadius(km)}>
                {t("ob.solo.privacy.radiusKm", { n: km })}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      ) : null}
    </StepCard>
  );
}

function ShareCard({ solo, api, trade, next, onChange }: CardProps) {
  const { t, money } = useLocale();
  const toast = useToast();
  const s = useSave();
  const qrRef = useRef<HTMLDivElement>(null);
  const [paste, setPaste] = useState("");
  const [found, setFound] = useState<merchantApi.ImportLinkResponse | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { me } = useMerchant();
  const link = solo.bookingUrl;
  const copy = async (channel: "copy" | "instagram") => {
    try {
      await navigator.clipboard?.writeText(link);
    } catch {
      /* clipboard blocked: the link is on screen */
    }
    toast({ message: t("ob.solo.share.copied"), tone: "success" });
    const r = await s.run(channel, () => api.share(channel));
    if (r) onChange(r);
    return r;
  };
  const downloadQr = async () => {
    const svg = qrRef.current?.querySelector("svg");
    if (svg) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      a.download = `${solo.slug}-qr.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    const r = await s.run("qr", () => api.share("qr"));
    if (r) onChange(r);
  };
  return (
    <StepCard
      headingId="card-title"
      icon={SOLO_STEP_ICON.share!}
      trade={trade}
      title={t("ob.solo.share.title")}
      body={t("ob.solo.share.body")}
      primary={{ label: t("ob.solo.share.copy"), loading: s.busy === "copy", onClick: async () => { const r = await copy("copy"); if (r) next(r); } }}
      secondary={{ label: t("ob.solo.share.download"), onClick: () => void downloadQr() }}
    >
      <Err text={s.error} />
      <p className="mb-2 rounded-r2 bg-muted px-3 py-2 text-body font-[550] text-foreground" dir="ltr" data-testid="booking-link">
        {solo.displayLink}
      </p>
      <div className="divide-overlay">
        <ShareRow icon="instagram_mark" trade={trade} title={t("ob.solo.share.bio")} hint={t("ob.solo.share.bioHint")} actionLabel={t("ob.solo.share.copy")} onAction={() => void copy("instagram")} />
        <ShareRow icon="phone_message" trade={trade} title={t("ob.solo.share.text")} hint={t("ob.solo.share.textHint")} actionLabel={t("ob.solo.share.textMe")} href={smsHref(t("ob.solo.share.bioMessage", { link }), me.user.phone ?? "")} onAction={() => void api.share("text").then(onChange).catch(() => undefined)} />
        <ShareRow icon="qr_stand" trade={trade} title={t("ob.solo.share.qr")} hint={t("ob.solo.share.qrHint")} actionLabel={t("ob.solo.share.download")} onAction={() => void downloadQr()} />
      </div>
      <div ref={qrRef} className="sr-only" aria-hidden>
        <QrCode value={link} size={512} />
      </div>
      <form
        className="mt-4 flex flex-col gap-3 border-t border-border pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!paste.trim()) return;
          const r = await s.run("import", () => api.importLink(paste.trim()));
          if (r) {
            setFound(r);
            setPicked(new Set(r.services.map((x) => x.name)));
          }
        }}
      >
        <p className="text-body text-muted-foreground">{t("ob.solo.share.paste")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={t("ob.solo.share.pasteField")} hint={t("ob.solo.share.hosts")} value={paste} onChange={(e) => setPaste(e.target.value)} inputMode="url" autoComplete="off" dir="ltr" className="min-w-0 flex-1 basis-60" />
          <button type="submit" disabled={s.busy === "import"} className="h-10 rounded-r4 border border-border-strong px-4 text-body font-[550] text-foreground hover:bg-hover focus-visible:focus-ring disabled:opacity-50 max-md:h-11">
            {t("ob.solo.share.pasteGo")}
          </button>
        </div>
        {found ? (
          found.services.length || found.links.length ? (
            <div className="flex flex-col gap-2" data-testid="import-found">
              <p className="text-body font-[550] text-foreground">{t("ob.solo.share.found")}</p>
              {found.services.map((x) => (
                <label key={x.name} className="flex min-h-11 items-center gap-3 text-body text-foreground">
                  <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={picked.has(x.name)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(x.name); else n.delete(x.name); return n; })} />
                  <span className="min-w-0 flex-1">{x.name}</span>
                  {x.priceCents !== null ? <span className="tabular-nums text-muted-foreground">{money(x.priceCents)}</span> : null}
                </label>
              ))}
              {found.services.length ? (
                <button
                  type="button"
                  className="self-start rounded-r2 text-body font-[550] text-link hover:underline focus-visible:focus-ring min-h-11"
                  onClick={async () => {
                    const items = found.services.filter((x) => picked.has(x.name)).map((x) => ({ name: x.name, durationMin: x.durationMin ?? 60, priceCents: x.priceCents ?? 0, depositCents: 0 }));
                    if (!items.length) return;
                    const r = await s.run("add", () => api.services({ items }));
                    if (r) {
                      onChange(r);
                      toast({ message: t("ob.solo.share.added", { n: items.length }), tone: "success" });
                    }
                  }}
                >
                  {t("ob.solo.share.addPicked")}
                </button>
              ) : null}
              {found.links.length ? (
                <>
                  <p className="mt-2 text-meta font-[550] text-muted-foreground">{t("ob.solo.share.foundLinks")}</p>
                  <ul className="flex flex-col gap-1 text-body">
                    {found.links.slice(0, 10).map((l) => (
                      <li key={l.url} className="truncate">
                        <a href={l.url} rel="noopener noreferrer nofollow" target="_blank" className="text-link hover:underline">
                          {l.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-meta text-muted-foreground">{t("ob.solo.share.foundNone")}</p>
          )
        ) : null}
      </form>
    </StepCard>
  );
}

function InviteCard({ solo, api, trade, next, base }: CardProps) {
  const { t } = useLocale();
  const s = useSave();
  const router = useRouter();
  const [msg, setMsg] = useState(() => t("ob.solo.invite.message", { link: solo.bookingUrl }));
  const [numbers, setNumbers] = useState("");
  const href = smsHref(msg);
  const finish = async () => {
    const r = await s.run("save", () => api.invite({ people: parsePeople(numbers) }));
    if (r) next(r);
  };
  return (
    <StepCard
      headingId="card-title"
      icon={SOLO_STEP_ICON.invite!}
      trade={trade}
      title={t("ob.solo.invite.title")}
      body={t("ob.solo.invite.body")}
      primary={{ label: t("ob.solo.invite.open"), href, onClick: () => void finish(), loading: s.busy === "save" }}
      secondary={{ label: t("ob.solo.invite.later"), onClick: () => router.push(base) }}
    >
      <Err text={s.error} />
      <div className="flex flex-col gap-4">
        <TextField type="textarea" label={t("ob.solo.invite.messageLabel")} value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={320} />
        <div className="hidden items-center gap-4 rounded-r4 border border-border p-3 md:flex">
          <QrCode value={href} size={112} label={t("ob.solo.invite.open")} />
          <p className="text-meta text-muted-foreground">{t("ob.solo.invite.scan")}</p>
        </div>
        <TextField type="textarea" label={t("ob.solo.invite.numbers")} hint={t("ob.solo.invite.numbersHint")} optionalLabel value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={3} maxLength={8000} />
      </div>
    </StepCard>
  );
}

function StaffCard({ api, trade, next, base }: CardProps) {
  const { t } = useLocale();
  const s = useSave();
  const { detail } = useMerchant();
  return (
    <StepCard
      headingId="card-title"
      icon={SOLO_STEP_ICON.staff!}
      trade={trade}
      title={t("ob.solo.staff.title")}
      body={t("ob.solo.staff.body")}
      primary={{ label: t("ob.solo.staff.open"), href: `${base}/staff` }}
      secondary={{ label: t("ob.solo.staff.justMe"), onClick: async () => { const r = await s.run("skip", () => api.complete("staff")); if (r) next(r); } }}
    >
      <Err text={s.error} />
      {detail.merchant.plan === "free" ? (
        <PlanLine linkLabel={t("ob.solo.seePlan")} href={`${base}/billing`}>
          {t("ob.solo.staffCap")}
        </PlanLine>
      ) : null}
    </StepCard>
  );
}

const LATER_COPY: Record<string, { title: string; body: string; cta: string; path: string; icon: "check_done" | "stamp_card" | "instagram_mark" | "site" | "megaphone" | "pos" }> = {
  profile: { title: "ob.solo.profile.title", body: "ob.solo.profile.body", cta: "ob.solo.profile.open", path: "/settings", icon: "check_done" },
  loyalty: { title: "ob.solo.loyalty.title", body: "ob.solo.loyalty.body", cta: "ob.solo.loyalty.open", path: "/program", icon: "stamp_card" },
  instagram_connect: { title: "ob.solo.instagram.title", body: "ob.solo.instagram.body", cta: "ob.solo.instagram.soon", path: "", icon: "instagram_mark" },
  site: { title: "ob.solo.site.title", body: "ob.solo.site.body", cta: "ob.solo.site.open", path: "/site", icon: "site" },
  promos: { title: "ob.solo.promos.title", body: "ob.solo.promos.body", cta: "ob.solo.promos.open", path: "/messages", icon: "megaphone" },
  pos: { title: "ob.solo.pos.title", body: "ob.solo.pos.body", cta: "ob.solo.pos.open", path: "/integrations", icon: "pos" },
};

function LaterCard({ k, api, trade, onChange, base, checklist }: CardProps) {
  const { t } = useLocale();
  const s = useSave();
  const { detail } = useMerchant();
  const c = LATER_COPY[k] ?? LATER_COPY.profile!;
  const done = checklist.later.find((x) => x.key === k)?.done;
  const mark = async () => {
    const r = await s.run("mark", () => api.complete(k as merchantApi.SoloCompleteStep));
    if (r) onChange(r);
  };
  const tk = (key: string) => t(key as Parameters<T>[0]);
  return (
    <StepCard
      headingId="card-title"
      icon={c.icon}
      trade={trade}
      title={tk(c.title)}
      body={tk(c.body)}
      primary={k === "instagram_connect" ? { label: done ? t("ob.solo.instagram.listed") : tk(c.cta), onClick: () => void mark(), disabled: done, loading: s.busy === "mark" } : { label: tk(c.cta), href: `${base}${c.path}` }}
      secondary={k === "instagram_connect" || done || k === "pos" ? undefined : { label: t("ob.solo.later.notNow"), onClick: () => void mark() }}
    >
      <Err text={s.error} />
      {k === "site" && !(detail.merchant as { annualSiteEntitled?: boolean }).annualSiteEntitled ? (
        <PlanLine linkLabel={t("ob.solo.seePlan")} href={`${base}/billing`}>
          {t("ob.solo.site.plan")}
        </PlanLine>
      ) : k === "promos" && detail.merchant.plan === "free" ? (
        <PlanLine linkLabel={t("ob.solo.seePlan")} href={`${base}/billing`}>
          {t("ob.solo.promos.plan")}
        </PlanLine>
      ) : null}
    </StepCard>
  );
}
