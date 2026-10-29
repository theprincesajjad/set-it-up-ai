"use client";
/**
 * The inbox (docs/business/people-side.md gap 2): every conversation with a customer in one list, the thread beside it on desktop
 * (one pane on a phone, ?c=<id>), a reply box that goes to the customer's best channel, and "Create booking" from any message.
 * Instagram threads are read-only: open them on Instagram to reply.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarPlus, ExternalLink, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { inboxApi } from "@ll/shared";
import { NewAppointmentSheet } from "@/components/dashboard/calendar/NewAppointmentSheet";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { CardHead, PageTitle, SurfaceCard } from "@/components/ui/ClearKit";
import { Icon3d } from "@/components/ui/Icon3d";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { todayOf } from "@/lib/dashboard/calendar";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

type Filter = "all" | "unread" | "in_app" | "sms" | "instagram";

export function InboxView() {
  const { api, base, detail } = useMerchant();
  const { t, date, time } = useLocaleOrEnglish();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const open = params.get("c");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const list = useApi(
    () => api.inbox.list({ ...(filter === "unread" ? { unread: "true" as const } : filter !== "all" ? { channel: filter } : {}), ...(debounced ? { q: debounced } : {}) }),
    [api, filter, debounced],
    { pollMs: 20_000 },
  );
  const items = list.data?.items ?? [];
  const ig = list.data?.instagram;

  const select = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("c", id);
    else next.delete("c");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const stamp = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString() ? time(iso) : date(iso, { month: "short", day: "numeric" });
  };

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: t("inbox.filter.all") },
    { value: "unread", label: t("inbox.filter.unread") },
    { value: "in_app", label: t("inbox.filter.app") },
    { value: "sms", label: t("inbox.filter.text") },
    ...(ig && ig.mode !== "off" ? [{ value: "instagram" as const, label: t("inbox.filter.instagram") }] : []),
  ];

  const listPane = (
    <SurfaceCard as="section" aria-label={t("inbox.title")} className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-3 p-4">
        <SegmentedControl size="sm" label={t("inbox.title")} options={filters} value={filter} onChange={setFilter} className="max-w-full overflow-x-auto" />
        <label className="relative block">
          <span className="sr-only">{t("inbox.search")}</span>
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("inbox.search")} className="h-11 w-full rounded-r2 border border-input bg-card ps-9 pe-3 text-body text-fg outline-none focus-visible:focus-ring md:h-8" />
        </label>
      </div>
      {list.error ? <p className="px-4 pb-4 text-meta text-negative">{t("inbox.loadError")}</p> : null}
      {!list.data && !list.error ? <div className="mx-4 mb-4 h-40 animate-pulse rounded-r4 bg-bg-subtle" aria-hidden /> : null}
      {list.data && !items.length ? (
        <div className="flex flex-col items-center gap-2 px-6 pb-8 pt-4 text-center" data-testid="inbox-empty">
          <Icon3d name="inbox_quiet" size={140} trade={detail.merchant.vertical} />
          <p className="text-headline text-fg">{t("inbox.empty.title")}</p>
          <p className="text-meta text-fg-muted">{t("inbox.empty.body")}</p>
        </div>
      ) : null}
      <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="inbox-list">
        {items.map((c) => (
          <li key={c.id} className="relative [&+&]:before:absolute [&+&]:before:inset-x-4 [&+&]:before:top-0 [&+&]:before:h-px [&+&]:before:bg-border">
            <button
              type="button"
              onClick={() => select(c.id)}
              aria-current={open === c.id ? "true" : undefined}
              className={cn("flex min-h-16 w-full items-start gap-3 px-4 py-3 text-start focus-visible:focus-ring", open === c.id ? "bg-row-sel" : "hover:bg-bg-subtle")}
            >
              <span aria-hidden className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-tile text-meta-strong text-fg">
                {(c.displayName.replace(/^@/, "")[0] ?? "?").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-body", c.unread ? "font-semibold text-fg" : "text-fg")}>{c.displayName}</span>
                  <span className="shrink-0 text-caption text-fg-muted tabular">{stamp(c.lastMessageAt)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-meta text-fg-muted">
                    {c.lastMessage?.direction === "out" ? `${t("inbox.you")}: ` : ""}
                    {c.lastMessage?.body}
                  </span>
                  {c.unread ? <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-r2 bg-primary px-1.5 text-caption text-primary-foreground tabular" aria-label={`${c.unread}`}>{c.unread}</span> : null}
                </span>
                <span className="text-caption text-fg-muted">{t(c.channel === "instagram" ? "inbox.from.instagram" : c.channel === "sms" ? "inbox.from.sms" : c.channel === "email" ? "inbox.from.email" : "inbox.from.in_app")}{c.handle ? ` · @${c.handle}` : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </SurfaceCard>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      {ig?.mode === "off" ? null : ig && !ig.connected ? (
        <p className="text-meta text-fg-muted">
          <Link className="inline-flex min-h-11 items-center text-link underline underline-offset-4" href={`${base}/settings?tab=messages`}>{t("ig.card.connect")}</Link>
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-[340px_minmax(0,1fr)] md:items-start">
        <div className={cn(open ? "hidden md:block" : "block")}>{listPane}</div>
        <div className={cn(open ? "block" : "hidden md:block")}>
          {open ? <Thread key={open} id={open} onBack={() => select(null)} onChanged={() => list.reload()} /> : (
            <SurfaceCard padded className="hidden min-h-60 items-center justify-center text-meta text-fg-muted md:flex">{t("inbox.pick")}</SurfaceCard>
          )}
        </div>
      </div>
    </div>
  );
}

function Thread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const { api, base } = useMerchant();
  const { t, date, time } = useLocaleOrEnglish();
  const toast = useToast();
  const state = useApi(() => api.inbox.thread(id), [api, id], { pollMs: 15_000 });
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [booking, setBooking] = useState<inboxApi.BookingPrefill | null>(null);
  const staff = useApi(booking ? () => api.appointments.staff() : null, [api, !!booking]);
  const services = useApi(booking ? () => api.appointments.services() : null, [api, !!booking]);
  const end = useRef<HTMLDivElement>(null);
  const th = state.data;
  const n = th?.messages.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [n]);
  useEffect(() => {
    if (th) onChanged();
    // Opening a thread marks it read: refresh the list's badge once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!th]);

  const groups = useMemo(() => {
    const out: { day: string; items: inboxApi.ThreadMessageDto[] }[] = [];
    for (const m of th?.messages ?? []) {
      const day = m.createdAt.slice(0, 10);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(m);
    }
    return out;
  }, [th]);

  if (state.error) return <SurfaceCard padded><p className="text-meta text-negative">{state.error}</p></SurfaceCard>;
  if (!th) return <SurfaceCard padded><div className="h-60 animate-pulse rounded-r4 bg-bg-subtle" aria-hidden /></SurfaceCard>;
  const c = th.conversation;

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setNotice(null);
    try {
      const r = await api.inbox.send(c.id, text);
      setBody("");
      setNotice(r.textCapReached ? t("inbox.textCap") : t(`inbox.sentBy.${r.deliveredBy[0] ?? "in_app"}` as "inbox.sentBy.push"));
      await state.reload();
      onChanged();
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  async function createBooking() {
    try {
      setBooking(await api.inbox.bookingPrefill(c.id));
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
  }

  return (
    <SurfaceCard as="section" aria-label={c.displayName} className="flex min-h-105 flex-col" data-testid="inbox-thread">
      <CardHead
        title={
          <span className="flex items-center gap-2">
            <button type="button" onClick={onBack} aria-label={t("inbox.back")} className="relative -ms-2 inline-flex size-8 items-center justify-center rounded-full text-fg-muted after:absolute after:-inset-1.5 after:content-[''] hover:bg-bg-subtle md:hidden">
              <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
            </button>
            <span className="truncate">{c.displayName}</span>
            {c.handle ? <span className="truncate text-meta font-normal text-fg-muted">@{c.handle}</span> : null}
          </span>
        }
        action={
          <Button size="sm" variant="secondary" onClick={createBooking} data-testid="create-booking">
            <CalendarPlus aria-hidden className="size-4" />
            {t("inbox.createBooking")}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-meta text-fg-muted">
        {th.nextVisit ? <span>{t("inbox.nextVisit", { when: `${date(th.nextVisit.startsAt, { weekday: "short", month: "short", day: "numeric" })}, ${time(th.nextVisit.startsAt)}` })}</span> : null}
        {c.memberId ? <Link className="inline-flex min-h-11 items-center text-link underline-offset-4 hover:underline" href={`${base}/customers/${c.memberId}`}>{t("inbox.viewProfile")}</Link> : null}
        {c.externalUrl ? (
          <a className="inline-flex min-h-11 items-center gap-1 text-link underline-offset-4 hover:underline" href={c.externalUrl} target="_blank" rel="noreferrer">
            {t("inbox.openInstagram")}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-4" aria-live="polite">
        {groups.map((g) => (
          <div key={g.day} className="flex flex-col gap-2">
            <p className="my-2 text-center text-caption text-fg-muted">{date(`${g.day}T12:00:00Z`, { weekday: "short", month: "short", day: "numeric" })}</p>
            {g.items.map((m) =>
              m.kind === "booking" ? (
                <p key={m.id} className="text-center text-caption text-fg-muted">{m.body}</p>
              ) : (
                <div key={m.id} className={cn("flex max-w-4/5 flex-col", m.direction === "out" ? "ms-auto items-end" : "me-auto items-start")}>
                  <p className={cn("whitespace-pre-wrap rounded-r5 px-3.5 py-2 text-body", m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-bg-subtle text-fg")}>{m.body}</p>
                  <p className="mt-0.5 text-caption text-fg-muted">
                    {time(m.createdAt)}
                    {m.direction === "out" && m.channel ? ` · ${t(`inbox.via.${m.channel === "instagram" ? "in_app" : m.channel}` as "inbox.via.push")}` : ""}
                    {m.sentByName && m.direction === "out" ? ` · ${m.sentByName}` : ""}
                  </p>
                </div>
              ),
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="border-t border-border p-4">
        {c.readOnly ? (
          <Banner tone="info">{t("inbox.readOnly")}</Banner>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor={`reply-${c.id}`} className="sr-only">{t("inbox.compose")}</label>
            <textarea
              id={`reply-${c.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
              rows={2}
              maxLength={1000}
              placeholder={t("inbox.compose")}
              className="min-h-11 w-full resize-y rounded-r2 border border-input bg-card px-3 py-2 text-body text-fg outline-none focus-visible:focus-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-caption text-fg-muted" aria-live="polite">{notice ?? (th.replyChannel ? t("inbox.replyVia", { channel: t(`inbox.via.${th.replyChannel}` as "inbox.via.push") }) : "")}</p>
              <Button type="submit" size="sm" loading={sending} disabled={!body.trim()}>{t("inbox.send")}</Button>
            </div>
          </form>
        )}
      </div>
      <NewAppointmentSheet
        open={!!booking && !!staff.data && !!services.data}
        onClose={() => setBooking(null)}
        staff={staff.data?.items ?? []}
        services={(services.data?.items ?? []).filter((s) => s.active)}
        defaults={{ date: todayOf(), minutes: 10 * 60, staffId: staff.data?.items[0]?.userId ?? null }}
        prefill={booking}
        onCreated={(a) => {
          toast({ message: `${a.customer.name}: ${date(a.startsAt, { weekday: "short", month: "short", day: "numeric" })}, ${time(a.startsAt)}`, tone: "success" });
          setBooking(null);
        }}
      />
    </SurfaceCard>
  );
}
