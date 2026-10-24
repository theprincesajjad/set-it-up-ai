"use client";
import { nowMs } from "@/lib/restaurant/util";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatFestivalDate, type FestivalDef, type FestivalSendDate } from "@ll/shared";
import { Dot, EmptyState, ErrorLine, PageHeader, SkeletonRows } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { RestaurantGate, TierTeaser } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { FestivalsUpcoming } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/errors";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { MSG_LANGS, dateTag, defaultSendTime, festivalDefOf, festivalMessage, kitchenChecklist, stripFestivals, type FestivalItem, type MsgLang } from "@/lib/restaurant/festivals";
import { YearCalendar } from "./YearCalendar";

export default function FestivalsPage() {
  return (
    <RestaurantGate featureKey="restaurant.festival_campaigns" title="Festival campaigns">
      <Festivals />
    </RestaurantGate>
  );
}

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const longDay = (iso: string) => formatFestivalDate(iso);

function Festivals() {
  const { api } = useMerchant();
  const [view, setView] = useState<"plan" | "year">("plan");
  const up = useApi(() => api.festivals.upcoming(400), [api]);
  const [adding, setAdding] = useState(false);
  if (up.status === 402) return <TierTeaser featureKey="restaurant.festival_campaigns" title="Festival campaigns" />;
  const today = up.data?.today ?? new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Festivals"
        description="The next dates that change your kitchen, and the message ready for each, in your guests' languages."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="md" variant="secondary" onClick={() => setAdding(true)}>Add my own date</Button>
            <Button size="md" variant={view === "year" ? "primary" : "secondary"} onClick={() => setView(view === "year" ? "plan" : "year")}>
              {view === "year" ? "Back to the plan" : "Full year"}
            </Button>
          </div>
        }
      />
      <AddDateModal open={adding} today={today} onClose={() => setAdding(false)} onAdded={() => void up.reload()} />
      {view === "year" ? (
        <YearCalendar today={today} />
      ) : up.error && !up.data ? (
        <ErrorLine message={up.error} onRetry={() => void up.reload()} />
      ) : !up.data ? (
        <div aria-busy="true" aria-label="Loading">
          <SkeletonRows rows={6} />
        </div>
      ) : (
        <Planner data={up.data} onReload={() => void up.reload()} onYear={() => setView("year")} />
      )}
    </div>
  );
}

function Planner({ data, onReload, onYear }: { data: FestivalsUpcoming; onReload: () => void; onYear: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [showAll, setShowAll] = useState(false);
  const strip = useMemo(() => stripFestivals(data.items, { showAll }), [data.items, showAll]);
  const [pick, setPick] = useState<string | null>(null);
  const selected = strip.find((o) => `${o.festivalId}-${o.year}` === pick) ?? strip[0] ?? null;
  const hidden = useMemo(() => stripFestivals(data.items, { showAll: true, n: 400 }).length - stripFestivals(data.items, { n: 400 }).length, [data.items]);

  const toggleCuisine = async (id: string) => {
    const next = data.cuisines.includes(id) ? data.cuisines.filter((c) => c !== id) : [...data.cuisines, id];
    const r = await act.run(() => api.festivals.setCuisines(next));
    if (r) onReload();
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Your kitchen" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="me-1 text-meta text-fg-muted">Your kitchen</p>
          {data.cuisineOptions.map((c) => {
            const on = data.cuisines.includes(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={on} disabled={act.busy} onClick={() => void toggleCuisine(c.id)} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-meta font-medium focus-visible:focus-ring", on ? "border-fg bg-fg text-bg" : "border-line text-fg-muted hover:bg-bg-subtle")}>
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="text-caption text-fg-muted">
          {data.cuisines.length ? (
            <>
              Dates for your community lead the list.{" "}
              {hidden > 0 ? (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="font-medium text-fg underline decoration-line underline-offset-4">
                  {showAll ? "Hide the others" : `Show ${hidden} more festivals`}
                </button>
              ) : null}
            </>
          ) : (
            "Pick your cuisine and the festivals your guests celebrate lead the list. Until then every festival shows."
          )}
        </p>
        {act.error ? <p role="alert" className="text-meta text-negative">{act.error}</p> : null}
      </section>

      {!strip.length ? (
        <EmptyState title="Nothing on the calendar for your kitchen" description="Check the full year to plan ahead." action={<Button size="sm" variant="secondary" onClick={onYear}>See the full year</Button>} />
      ) : (
        <>
          <ol aria-label="Next dates" className="grid grid-cols-2 overflow-hidden rounded-card border border-line sm:grid-cols-4 lg:grid-cols-7">
            {strip.map((o) => {
              const on = selected && `${o.festivalId}-${o.year}` === `${selected.festivalId}-${selected.year}`;
              const tag = dateTag(o);
              return (
                <li key={`${o.festivalId}-${o.year}`} className="min-w-0 border-b border-s border-line first:border-s-0 [&:nth-child(2n+1)]:border-s-0 sm:[&:nth-child(2n+1)]:border-s sm:[&:nth-child(4n+1)]:border-s-0 lg:[&:nth-child(n)]:border-s lg:first:border-s-0 lg:border-b-0">
                  <button type="button" aria-pressed={!!on} onClick={() => setPick(`${o.festivalId}-${o.year}`)} className={cn("flex h-full w-full flex-col items-start gap-0.5 px-4 py-3 text-start focus-visible:focus-ring", on ? "bg-bg-muted" : "bg-bg hover:bg-bg-subtle")}>
                    <span className="text-caption text-fg-muted">{o.daysUntil <= 0 ? "under way" : o.daysUntil === 1 ? "tomorrow" : `in ${o.daysUntil} days`}</span>
                    <span className="text-[17px] font-semibold leading-6 text-fg tabular">{o.approximate ? "about " : ""}{short(o.startDate)}</span>
                    <span className="text-meta text-fg">{o.name}</span>
                    <span className={cn("mt-1 inline-flex h-5 items-center rounded-full px-2 text-caption", tag === "Fixed" ? "bg-bg-muted text-fg-muted" : "bg-accent-soft text-accent-text")}>{tag}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {selected ? <Plan key={`${selected.festivalId}-${selected.year}`} o={selected} onChanged={onReload} toast={(m) => toast({ message: m, tone: "success" })} /> : null}
        </>
      )}
      <p className="text-meta text-fg-muted">We never send between 9 pm and 8 am. Guests who replied STOP are skipped. Dates for lunar festivals are approximate: confirm with your community before sending.</p>
    </div>
  );
}

function Plan({ o, onChanged, toast }: { o: FestivalItem; onChanged: () => void; toast: (m: string) => void }) {
  const { api, base, enabled } = useMerchant();
  const def = festivalDefOf(o)!;
  const rules = useApi(enabled("restaurant.degh_preorders") ? () => api.preorders.rules() : null, [api]);
  const act = useAction();
  const [templateId, setTemplateId] = useState(def.templates[0]!.id);
  const template = def.templates.find((t) => t.id === templateId) ?? def.templates[0]!;
  const tasks = kitchenChecklist(o, { base, dailyCap: rules.data?.preorderDailyCap ?? null, deghOn: enabled("restaurant.degh_preorders") });

  const move = async (days: number | null) => {
    const start = days === null ? null : new Date(Date.parse(`${o.startDate}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    const r = await act.run(() => api.festivals.setDateOverride(o.festivalId, { year: o.year, start }));
    if (r) {
      toast(r.shiftedMessages ? `Date moved. ${r.shiftedMessages} scheduled ${r.shiftedMessages === 1 ? "message" : "messages"} moved with it.` : r.moved ? "Date moved. The plan follows it." : "Back to the calendar date.");
      onChanged();
    }
  };

  const removeOwn = async () => {
    if (!o.custom) return;
    const id = o.custom.id;
    const r = await act.run(() => api.festivals.removeOccasion(id));
    if (r) {
      toast("Date removed.");
      onChanged();
    }
  };

  const statusFor = (s: FestivalSendDate) => o.sendStatus.find((x) => x.templateId === s.templateId);
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex min-w-0 flex-col gap-8">
        <section aria-labelledby="plan-h">
          <h2 id="plan-h" className="text-[17px] font-semibold text-fg">
            {o.name}, {o.approximate ? "about " : ""}
            {longDay(o.startDate)}
          </h2>
          <p className="mt-1 text-meta text-fg-muted">Send plan counted back from the date. If the date moves a day, the plan moves with it.</p>
          {o.moved ? <p className="mt-1 text-meta text-fg">You moved this from {longDay(o.calendarStartDate ?? o.startDate)}.</p> : null}
          {o.custom ? (
            <div className="mt-2">
              <Button size="sm" variant="ghost" loading={act.busy} onClick={() => void removeOwn()}>Remove this date</Button>
            </div>
          ) : null}
          {o.approximate ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void move(-1)}>Move a day earlier</Button>
              <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void move(1)}>Move a day later</Button>
              {o.moved ? <Button size="sm" variant="ghost" loading={act.busy} onClick={() => void move(null)}>Back to the calendar date</Button> : null}
            </div>
          ) : null}
          {act.error ? <Banner tone="danger" className="mt-3">{act.error}</Banner> : null}
          <ul className="mt-4 overflow-hidden rounded-card border border-line">
            {o.sends.map((s, i) => {
              const st = statusFor(s);
              const active = s.templateId === templateId;
              return (
                <li key={`${s.templateId}-${s.offsetDays}`} className={cn(i > 0 && "border-t border-line")}>
                  <button type="button" aria-pressed={active} onClick={() => setTemplateId(s.templateId)} className={cn("flex w-full items-center gap-4 px-5 py-3 text-start focus-visible:focus-ring", active ? "bg-bg-subtle" : "hover:bg-bg-subtle")}>
                    <span className="w-[72px] shrink-0 text-[15px] font-semibold text-fg tabular">{short(s.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium text-fg">{s.label}</span>
                      <span className="mt-0.5 block text-meta text-fg-muted">
                        {s.repeatUntil ? `Every day to ${short(s.repeatUntil)} · ` : ""}
                        {st ? <Dot tone={st.status === "scheduled" ? "positive" : "neutral"}>{channelName(st.channel)} · {st.status === "scheduled" ? "Scheduled" : "Draft"}</Dot> : <span>Not set up yet</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="ready-h">
          <h2 id="ready-h" className="text-[15px] font-semibold text-fg">Get the kitchen ready</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">Three things owners forget</p>
          <ul className="mt-3 overflow-hidden rounded-card border border-line">
            {tasks.map((t, i) => (
              <KitchenTask key={t.key} task={t} festival={`${o.festivalId}-${o.year}`} first={i === 0} />
            ))}
          </ul>
        </section>
      </div>

      <Composer o={o} template={template} templates={def.templates} onTemplate={setTemplateId} onChanged={onChanged} toast={toast} />
    </div>
  );
}

const channelName = (c: string) => (c === "sms" ? "SMS" : c === "whatsapp" ? "WhatsApp" : c === "email" ? "Email" : "App push");

function KitchenTask({ task, festival, first }: { task: ReturnType<typeof kitchenChecklist>[number]; festival: string; first: boolean }) {
  const key = `desi2.festival.${festival}.${task.key}`;
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(localStorage.getItem(key) === "1");
    } catch {
      /* storage blocked: the box just starts unchecked */
    }
  }, [key]);
  const toggle = () => {
    setDone((d) => {
      try {
        localStorage.setItem(key, d ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !d;
    });
  };
  return (
    <li className={cn("flex items-center gap-4 px-5 py-3.5", !first && "border-t border-line")}>
      <input type="checkbox" checked={done} onChange={toggle} aria-label={`Done: ${task.title}`} className="size-5 shrink-0 rounded-[6px] border-line-strong" />
      <div className="min-w-0 flex-1">
        <p className={cn("text-body font-medium text-fg", done && "text-fg-muted line-through")}>{task.title}</p>
        <p className="text-meta text-fg-muted">{task.sub}</p>
      </div>
      <Link href={task.action.href} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-4 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring">
        {task.action.label}
      </Link>
    </li>
  );
}

/** The message in each language, who gets it, what it costs, and Schedule (a draft with a send time, never an instant send). */
function Composer({ o, template, templates, onTemplate, onChanged, toast }: { o: FestivalItem; template: FestivalDef["templates"][number]; templates: { id: string; label: string }[]; onTemplate: (id: string) => void; onChanged: () => void; toast: (m: string) => void }) {
  const { api, base, enabled, detail } = useMerchant();
  const def = festivalDefOf(o)!;
  const act = useAction();
  const router = useRouter();
  const [lang, setLang] = useState<MsgLang>("en");
  const available = { whatsapp: enabled("restaurant.whatsapp_marketing"), sms: enabled("marketing.sms"), email: enabled("marketing.email") };
  const first = (["whatsapp", "sms", "email"] as const).find((c) => available[c]) ?? "whatsapp";
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">(first);
  const send = o.sends.find((s) => s.templateId === template.id) ?? o.sends[0]!;
  const [when, setWhen] = useState(defaultSendTime(send.date));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhen(defaultSendTime(send.date));
  }, [send.date]);
  const text = festivalMessage(def, template, lang, detail.merchant.name, o.startDate, channel);
  const sms = useApi(available.sms ? () => api.messages.audience({ channel: "sms", segment: { kind: "all" } }) : null, [api, available.sms]);
  const email = useApi(available.email ? () => api.messages.audience({ channel: "email", segment: { kind: "all" } }) : null, [api, available.email]);
  const wa = useApi(available.whatsapp ? () => api.whatsapp.broadcast({ templateName: template.whatsappTemplateName, language: lang, segment: { kind: "all" }, dryRun: true }).catch(() => null) : null, [api, available.whatsapp, template.whatsappTemplateName, lang]);
  const reach = [wa.data ? `${formatNumber(wa.data.recipients)} on WhatsApp` : null, sms.data ? `${formatNumber(sms.data.recipients)} SMS` : null, email.data ? `${formatNumber(email.data.recipients)} email` : null].filter(Boolean).join(" · ");
  const past = new Date(`${when}:00`).getTime() <= nowMs();
  const quiet = (() => {
    const h = Number(when.slice(11, 13));
    return h >= 21 || h < 8;
  })();

  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  async function sendTest() {
    setTesting(true);
    setTestNote(null);
    setTestError(null);
    try {
      const r = await api.festivals.testSend(o.festivalId, { templateId: template.id, year: o.year, channel: channel === "email" ? "email" : channel, ...(lang === "en" ? {} : { body: text }) });
      setTestNote(`Test sent to ${r.to.join(", ")}${r.smsCreditsUsed ? " (used 1 text)" : ""}. Nothing went to your guests. ${r.testsRemainingToday} tests left today.`);
    } catch (e) {
      setTestError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  async function schedule() {
    if (channel === "whatsapp") {
      const params = new URLSearchParams({ tab: "broadcast", template: template.whatsappTemplateName, festival: o.festivalId, tpl: template.id, year: String(o.year) });
      router.push(`${base}/restaurant/whatsapp?${params.toString()}`);
      return;
    }
    const iso = new Date(`${when}:00`).toISOString();
    const r = await act.run(() => api.festivals.createDraft(o.festivalId, { templateId: template.id, channel, year: o.year, scheduledAt: iso, ...(lang === "en" ? {} : { body: text }) }));
    if (r) {
      toast(`Scheduled for ${short(when.slice(0, 10))}. Review it any time under Messages.`);
      onChanged();
    }
  }
  const saveDraft = async () => {
    const r = await act.run(() => api.festivals.createDraft(o.festivalId, { templateId: template.id, channel: channel === "whatsapp" ? "sms" : channel, year: o.year, ...(lang === "en" ? {} : { body: text }) }));
    if (r) {
      toast("Saved as a draft under Messages.");
      onChanged();
    }
  };

  return (
    <section aria-labelledby="msg-h" className="min-w-0">
      <h2 id="msg-h" className="text-[17px] font-semibold text-fg">Message: {template.label}</h2>
      <p className="mt-1 text-meta text-fg-muted">Written for you in each language. Edit anything before it goes out.</p>
      <div className="mt-4 overflow-hidden rounded-card border border-line">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <div role="group" aria-label="Message language" className="flex flex-wrap gap-2">
            {MSG_LANGS.map((l) => (
              <button key={l.code} type="button" aria-pressed={lang === l.code} lang={l.code} onClick={() => setLang(l.code)} className={cn("inline-flex h-9 items-center rounded-full border px-4 text-meta-strong focus-visible:focus-ring", lang === l.code ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-bg-subtle")}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="ms-auto text-caption text-fg-muted">Sent in each guest&apos;s own language</p>
        </div>
        {templates.length > 1 ? (
          <div className="flex gap-2 border-b border-line px-5 py-2">
            {templates.map((t) => (
              <button key={t.id} type="button" aria-pressed={t.id === template.id} onClick={() => onTemplate(t.id)} className={cn("rounded-full px-3 py-1 text-meta", t.id === template.id ? "bg-bg-muted font-medium text-fg" : "text-fg-muted hover:text-fg")}>
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="bg-bg-subtle px-5 py-5">
          <p lang={lang} dir={lang === "ur" ? "rtl" : "ltr"} className={cn("max-w-[460px] whitespace-pre-line rounded-[18px] bg-fg px-5 py-4 text-body text-bg", lang === "ur" ? "ms-auto leading-[1.9]" : "ms-auto")}>
            {text}
          </p>
          {lang !== "en" ? <p className="mt-2 text-caption text-fg-muted">This {MSG_LANGS.find((l) => l.code === lang)?.label} draft is a short greeting. Have someone who reads it check the wording before you send.</p> : null}
        </div>
        <dl className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-3">
          <div>
            <dt className="text-caption text-fg-muted">Who</dt>
            <dd className="mt-0.5 text-meta font-medium text-fg">Opted-in guests who ordered here. We skip anyone who said STOP.</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-muted">Reach</dt>
            <dd className="mt-0.5 text-meta font-medium text-fg">{reach || "Counted when you pick a channel"}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-muted">Cost</dt>
            <dd className="mt-0.5 text-meta font-medium text-fg">{channel === "whatsapp" && wa.data ? `${formatNumber(wa.data.creditsNeeded)} of your ${formatNumber(wa.data.creditsRemaining)} WhatsApp messages left` : channel === "sms" && sms.data ? `${formatNumber(sms.data.smsCreditsNeeded)} text credits` : "No charge for email"}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 border-t border-line bg-bg-subtle px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <label className="inline-flex items-center gap-2 text-meta text-fg-muted">
            Send as
            <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="h-9 rounded-input border border-line bg-bg px-2 text-meta text-fg focus-visible:focus-ring">
              <option value="whatsapp">{available.whatsapp ? "WhatsApp" : "WhatsApp (needs Growth)"}</option>
              <option value="sms">{available.sms ? "Text message" : "Text message (needs Plus)"}</option>
              <option value="email">{available.email ? "Email" : "Email (needs Plus)"}</option>
            </select>
          </label>
          {channel !== "whatsapp" ? (
            <label className="inline-flex items-center gap-2 text-meta text-fg-muted">
              When
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-9 rounded-input border border-line bg-bg px-2 text-meta text-fg focus-visible:focus-ring" />
            </label>
          ) : null}
          <Button variant="secondary" size="md" disabled={!available[channel]} loading={testing} onClick={() => void sendTest()}>Send me a test</Button>
          {channel !== "whatsapp" ? (
            <Button variant="secondary" size="md" disabled={!available[channel]} loading={act.busy} onClick={() => void saveDraft()}>Save as draft</Button>
          ) : null}
          <Button size="md" disabled={!available[channel] || (channel !== "whatsapp" && (past || quiet))} loading={act.busy} onClick={() => void schedule()}>
            {channel === "whatsapp" ? "Open in broadcast" : `Schedule for ${short(when.slice(0, 10))}, ${new Date(`${when}:00`).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }).replace(/\./g, "").toLowerCase()}`}
          </Button>
        </div>
        {channel !== "whatsapp" && (past || quiet) ? <p role="alert" className="border-t border-line px-5 py-2 text-meta text-negative">{quiet ? "We never send between 9 pm and 8 am. Pick a time between 8 am and 9 pm." : "Pick a time in the future."}</p> : null}
        {act.error ? <p role="alert" className="border-t border-line px-5 py-2 text-meta text-negative">{act.error}</p> : null}
        {testError ? <p role="alert" className="border-t border-line px-5 py-2 text-meta text-negative">{testError}</p> : null}
        {testNote ? <p role="status" className="border-t border-line px-5 py-2 text-meta text-fg">{testNote}</p> : null}
      </div>
      <p className="mt-2 text-caption text-fg-muted">Schedule makes a draft with a send time. It never sends at once, and you can change it under Messages.</p>
    </section>
  );
}

/** "Add my own date": a named occasion (grand opening, family night) with its message, planned like a festival. */
function AddDateModal({ open, today, onClose, onAdded }: { open: boolean; today: string; onClose: () => void; onAdded: () => void }) {
  const { api } = useMerchant();
  const act = useAction();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sms, setSms] = useState("");
  const problem = !name.trim() ? "Give the date a name." : !date ? "Pick the date." : date < today ? "Pick a date that has not passed." : !subject.trim() ? "Add a subject line for the email." : !message.trim() ? "Write the message." : null;
  const [shown, setShown] = useState(false);
  const save = async () => {
    setShown(true);
    if (problem) return;
    const r = await act.run(() => api.festivals.addOccasion({ name: name.trim(), date, subject: subject.trim(), body: message.trim(), ...(sms.trim() ? { sms: sms.trim() } : {}) }));
    if (r) {
      setName("");
      setDate("");
      setSubject("");
      setMessage("");
      setSms("");
      setShown(false);
      onAdded();
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add my own date"
      description="A grand opening, a family night, a local fair. We plan a message three days before and a reminder the day before."
      size="md"
      actions={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button size="md" loading={act.busy} onClick={() => void save()}>Add date</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField id="occ-name" label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <TextField id="occ-date" label="Date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField id="occ-subject" label="Email subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
        <TextField id="occ-body" label="Message" type="textarea" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} hint="Use {{first_name}} and {{merchant}} to fill in names." />
        <TextField id="occ-sms" label="Shorter text message" optionalLabel type="textarea" rows={2} maxLength={480} value={sms} onChange={(e) => setSms(e.target.value)} hint="If you leave this empty, texts use the message above." />
        {shown && problem ? <p role="alert" className="text-meta text-negative">{problem}</p> : null}
        {act.error ? <p role="alert" className="text-meta text-negative">{act.error}</p> : null}
      </div>
    </Modal>
  );
}
