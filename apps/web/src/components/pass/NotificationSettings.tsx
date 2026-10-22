"use client";
/**
 * /me Settings → Notifications: the latest inbox items (mark read, open) and per-type switches grouped like
 * the app (points and rewards · orders and repairs · offers), on the customer notifications API
 * (docs/engineering/api/notifications.md). An older API (404) hides the section instead of erroring.
 */
import { customerApi } from "@ll/shared";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/Card";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/format";

const GROUPS: { title: string; channel: customerApi.AndroidChannelId; note?: string }[] = [
  { title: "Points and rewards", channel: "points" },
  { title: "Orders and repairs", channel: "orders" },
  { title: "Offers", channel: "offers", note: "Only from shops you've said yes to, at most one a day, never 9 pm to 8 am." },
];
const CHANNEL: Record<customerApi.NotificationChannel, string> = { push: "app", sms: "text", email: "email" };

function when(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? formatTime(iso) : formatDate(iso);
}

/** Inbox links: ll://shop/<slug> → /shops/<slug>; web links as they are. */
function hrefFor(n: customerApi.NotificationDto): string | null {
  const url = typeof n.data?.url === "string" ? n.data.url : null;
  if (url?.startsWith("http") || url?.startsWith("/")) return url;
  const slug = (typeof n.data?.slug === "string" && n.data.slug) || n.merchant?.slug || (url?.match(/^ll:\/\/shop\/([^/?#]+)/)?.[1] ?? null);
  return slug ? `/shops/${slug}` : null;
}

export function NotificationSettings() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<customerApi.NotificationPrefsResponse | null>(null);
  const [inbox, setInbox] = useState<customerApi.NotificationsResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [p, n] = await Promise.all([browserApi.me.notificationPrefs(), browserApi.me.notifications({ limit: 5 })]);
      setPrefs(p);
      setInbox(n);
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
      toast({ message: "That didn't save. Try again.", tone: "error" });
    }
  }

  async function markAll() {
    if (!inbox) return;
    setInbox({ ...inbox, unreadCount: 0, items: inbox.items.map((n) => ({ ...n, read: true })) });
    await browserApi.me.readAllNotifications().catch(() => undefined);
  }

  if (state === "missing") return null;
  if (state === "loading")
    return (
      <SkeletonGroup className="flex flex-col gap-3" label="Loading notifications">
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
    );
  if (state === "error")
    return (
      <div className="flex items-center justify-between gap-4 rounded-card border border-line p-4">
        <p className="text-body text-fg">Your notification settings didn&apos;t load.</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );

  const items = prefs?.items ?? [];
  const groups = GROUPS.map((g) => ({ ...g, items: items.filter((x) => customerApi.NOTIFICATION_CATALOG.find((c) => c.type === x.type)?.androidChannel === g.channel) })).filter((g) => g.items.length);

  return (
    <div id="notifications" className="flex flex-col gap-7">
      <ListGroup
        title="Notifications"
        action={
          inbox && inbox.unreadCount > 0 ? (
            <button type="button" onClick={() => void markAll()} className="text-meta-strong text-fg hover:underline focus-visible:focus-ring">
              Mark all read
            </button>
          ) : null
        }
      >
        {inbox && inbox.items.length ? (
          inbox.items.map((n) => {
            const href = hrefFor(n);
            const body = (
              <>
                <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-fg")} />
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
          <li className="py-3.5 text-body text-fg-muted">Nothing yet. Points, rewards and order updates land here.</li>
        )}
      </ListGroup>

      {groups.map((g) => (
        <ListGroup key={g.title} title={g.title} footer={g.note}>
          {g.items.map((item) => {
            const chans = (Object.keys(item.channels) as customerApi.NotificationChannel[]).sort((a, b) => ["push", "sms", "email"].indexOf(a) - ["push", "sms", "email"].indexOf(b));
            const [first, ...more] = chans;
            if (!first) return null;
            return (
              <li key={item.type} className="py-2">
                <Switch label={item.label} description={item.description} checked={!!item.channels[first]} onChange={(v) => void toggle(item.type, first, v)} />
                {more.map((ch) => (
                  <div key={ch} className="ps-4">
                    <Switch label={`Also by ${CHANNEL[ch]}`} checked={!!item.channels[ch]} onChange={(v) => void toggle(item.type, ch, v)} />
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
