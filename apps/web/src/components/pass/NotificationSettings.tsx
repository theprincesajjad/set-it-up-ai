"use client";
/**
 * The shopper's notifications on /me, two pieces with two jobs:
 *  - <InboxList/>  (Activity tab): everything we held back from a push, newest first, with the day's budget said out loud.
 *  - <NotificationSettings/>  (Settings tab): the language messages come in, and per-type switches grouped like the app
 *    (points and rewards · orders and repairs · offers), each stating its own limit.
 * On the customer notifications API (docs/engineering/api/notifications.md). An older API (404) hides the section.
 */
import { customerApi, LOCALE_LIST, t as translate, type MessageKey } from "@ll/shared";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/Card";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish, saveProfileLocale } from "@/lib/i18n/client";

const GROUPS: { titleKey: MessageKey; channel: customerApi.AndroidChannelId; noteKey?: MessageKey }[] = [
  { titleKey: "sh.set.groupPoints", channel: "points" },
  { titleKey: "sh.set.groupOrders", channel: "orders" },
  { titleKey: "sh.set.groupOffers", channel: "offers", noteKey: "sh.set.offersNote" },
];
const CHANNEL_KEY: Record<customerApi.NotificationChannel, MessageKey> = { push: "sh.ch.push", sms: "sh.ch.sms", email: "sh.ch.email" };

/** Inbox links: ll://shop/<slug> → /shops/<slug>; web links as they are. */
function hrefFor(n: customerApi.NotificationDto): string | null {
  const url = typeof n.data?.url === "string" ? n.data.url : null;
  if (url?.startsWith("http") || url?.startsWith("/")) return url;
  const slug = (typeof n.data?.slug === "string" && n.data.slug) || n.merchant?.slug || (url?.match(/^ll:\/\/shop\/([^/?#]+)/)?.[1] ?? null);
  return slug ? `/shops/${slug}` : null;
}

/** The latest inbox items (mark read, open). Hides itself on an older API (404). */
export function InboxList({ limit = 20 }: { limit?: number }) {
  const { t, time, date } = useLocaleOrEnglish();
  const [inbox, setInbox] = useState<customerApi.NotificationsResponse | null>(null);
  const [limits, setLimits] = useState<number>(customerApi.ROUTINE_PUSHES_PER_DAY);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [n, p] = await Promise.all([browserApi.me.notifications({ limit }), browserApi.me.notificationPrefs().catch(() => null)]);
      setInbox(n);
      if (p?.limits) setLimits(p.limits.routinePushesPerDay);
      setState("ready");
    } catch (e) {
      setState(isApiError(e) && e.status === 404 ? "missing" : "error");
    }
  }, [limit]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function markAll() {
    if (!inbox) return;
    setInbox({ ...inbox, unreadCount: 0, items: inbox.items.map((n) => ({ ...n, read: true })) });
    await browserApi.me.readAllNotifications().catch(() => undefined);
  }

  if (state === "missing") return null;
  if (state === "loading")
    return (
      <SkeletonGroup className="flex flex-col gap-3" label={t("sh.activity.title")}>
        <Skeleton className="h-3.5 w-28" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </SkeletonGroup>
    );
  if (state === "error")
    return (
      <div className="flex items-center justify-between gap-4 rounded-card border border-line p-4">
        <p className="text-body text-fg">{t("sh.set.loadFail")}</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          {t("sh.act.tryAgain")}
        </Button>
      </div>
    );

  const when = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? time(iso) : date(iso, { month: "short", day: "numeric" }));
  return (
    <div id="notifications" className="flex flex-col gap-3">
      <ListGroup
        title={t("sh.activity.title")}
        action={
          inbox && inbox.unreadCount > 0 ? (
            <button type="button" onClick={() => void markAll()} className="text-meta-strong text-fg hover:underline focus-visible:focus-ring">
              {t("sh.set.markAllRead")}
            </button>
          ) : null
        }
      >
        {inbox && inbox.items.length ? (
          inbox.items.map((n) => {
            const href = hrefFor(n);
            const body = (
              <>
                <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-points")} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline gap-2">
                    <span className={cn("flex-1 text-body", n.read ? "text-fg" : "font-semibold text-fg")}>{n.title}</span>
                    <span className="shrink-0 text-meta tabular-nums text-fg-muted">{when(n.createdAt)}</span>
                  </span>
                  <span className="text-meta text-fg-muted">{n.body}</span>
                </span>
              </>
            );
            const onOpen = () => {
              if (!n.read) void browserApi.me.readNotification(n.id).catch(() => undefined);
            };
            return (
              <li key={n.id}>
                {href ? (
                  <a href={href} onClick={onOpen} className="-mx-4 flex gap-3 px-4 py-3 hover:bg-bg-subtle focus-visible:focus-ring">
                    {body}
                  </a>
                ) : (
                  <div className="flex gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })
        ) : (
          <li className="py-3.5 text-body text-fg-muted">{t("sh.set.inboxEmpty")}</li>
        )}
      </ListGroup>
      {/* The budget, said out loud, so a quiet phone never feels broken. */}
      <p className="text-meta text-fg-muted">{t("sh.activity.budget", { n: limits })}</p>
    </div>
  );
}

/** The language messages come in. Saved on the profile, so alerts, texts and the wallet pass follow it. */
function MessagesLanguage() {
  const { t, locale, setLocale } = useLocaleOrEnglish();
  const toast = useToast();
  return (
    <section aria-labelledby="msg-lang" className="flex flex-col gap-2.5 rounded-card border border-line p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="msg-lang" className="text-body-strong text-fg">{t("sh.set.messagesIn")}</h2>
        <p className="text-meta text-fg-muted">{t("sh.set.messagesInHint")}</p>
      </div>
      <SegmentedControl
        label={t("sh.set.language")}
        value={locale}
        onChange={(next) => {
          // The page switches now (cookie + ?lang=); the same choice is saved on the profile (English too: it is explicit here).
          setLocale(next);
          const message = translate(next, "sh.set.languageSaved");
          void saveProfileLocale(next, { explicit: true }).then((ok) => ok && toast({ message, tone: "success" }));
        }}
        className="self-start max-w-full"
        options={LOCALE_LIST.map((l) => ({ value: l.code, label: l.name }))}
      />
    </section>
  );
}

export function NotificationSettings() {
  const toast = useToast();
  const { t, locale } = useLocaleOrEnglish();
  const [prefs, setPrefs] = useState<customerApi.NotificationPrefsResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setPrefs(await browserApi.me.notificationPrefs());
      setState("ready");
    } catch (e) {
      setState(isApiError(e) && e.status === 404 ? "missing" : "error");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(type: customerApi.NotificationType, channel: customerApi.NotificationChannel, enabled: boolean) {
    if (!prefs) return;
    const prev = prefs;
    // Optimistic: the switch moves now; rolled back if the save fails.
    setPrefs({ ...prefs, items: prefs.items.map((x) => (x.type === type ? { ...x, channels: { ...x.channels, [channel]: enabled } } : x)) });
    try {
      setPrefs(await browserApi.me.updateNotificationPrefs({ prefs: [{ type, channel, enabled }] }));
    } catch {
      setPrefs(prev);
      toast({ message: t("sh.set.saveFail"), tone: "error" });
    }
  }

  const language = <MessagesLanguage />;
  if (state === "missing") return language;
  if (state === "loading")
    return (
      <div className="flex flex-col gap-7">
        {language}
        <SkeletonGroup className="flex flex-col gap-3" label={t("sh.set.notifications")}>
          <Skeleton className="h-3.5 w-28" />
          <div className="flex flex-col gap-4 rounded-card border border-line p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
                <Skeleton className="h-[31px] w-[51px] rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonGroup>
      </div>
    );
  if (state === "error")
    return (
      <div className="flex flex-col gap-7">
        {language}
        <div className="flex items-center justify-between gap-4 rounded-card border border-line p-4">
          <p className="text-body text-fg">{t("sh.set.loadFail")}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t("sh.act.tryAgain")}
          </Button>
        </div>
      </div>
    );

  const items = prefs?.items ?? [];
  const budget = prefs?.limits?.routinePushesPerDay ?? customerApi.ROUTINE_PUSHES_PER_DAY;
  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((x) => customerApi.NOTIFICATION_CATALOG.find((c) => c.type === x.type)?.androidChannel === g.channel) })).filter((g) => g.items.length);
  const label = (type: customerApi.NotificationType, fallback: string) => {
    const key = `sh.nt.${type}` as MessageKey;
    const out = t(key);
    return out === key ? fallback : out;
  };

  return (
    <div id="notifications-settings" className="flex flex-col gap-7">
      {language}
      {groups.map((g) => (
        <ListGroup key={g.titleKey} title={t(g.titleKey)} footer={g.noteKey ? t(g.noteKey) : g.channel === "points" ? t("sh.set.budget", { n: budget }) : undefined}>
          {g.items.map((item) => {
            const chans = (Object.keys(item.channels) as customerApi.NotificationChannel[]).sort((a, b) => ["push", "sms", "email"].indexOf(a) - ["push", "sms", "email"].indexOf(b));
            const [first, ...more] = chans;
            if (!first) return null;
            return (
              <li key={item.type} className="py-2">
                <Switch label={label(item.type, item.label)} description={locale === "en" ? item.description : undefined} checked={!!item.channels[first]} onChange={(v) => void toggle(item.type, first, v)} />
                {more.map((ch) => (
                  <div key={ch} className="ps-4">
                    <Switch label={t("sh.set.alsoBy", { channel: t(CHANNEL_KEY[ch]) })} checked={!!item.channels[ch]} onChange={(v) => void toggle(item.type, ch, v)} />
                  </div>
                ))}
              </li>
            );
          })}
        </ListGroup>
      ))}
    </div>
  );
}
