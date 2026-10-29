"use client";
/**
 * The customer's messages with shops on the web pass (phase solo, workstream D): the list of threads and one thread with a reply
 * box. The same threads show in the app. Replies go to the shop's inbox.
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { inboxApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export function MyThreads() {
  const { t, date, time } = useLocaleOrEnglish();
  const [data, setData] = useState<inboxApi.MyThreadsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    browserApi.me.threads().then(setData).catch(() => setFailed(true));
  }, []);
  const when = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? time(iso) : date(iso, { month: "short", day: "numeric" }));
  return (
    <div className="flex flex-col gap-4">
      <Link href="/me" className="inline-flex min-h-11 items-center gap-1 self-start text-meta text-fg-muted"><ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />{t("rc.back")}</Link>
      <h1 className="text-large-title text-fg">{t("inbox.me.title")}</h1>
      {failed ? <p className="text-body text-fg-muted">{t("inbox.me.failed")}</p> : null}
      {data && !data.items.length ? (
        <div className="rounded-card bg-bg-subtle p-5">
          <p className="text-body-strong text-fg">{t("inbox.me.empty")}</p>
          <p className="text-meta text-fg-muted">{t("inbox.me.emptyBody")}</p>
        </div>
      ) : null}
      {data?.items.length ? (
        <ul className="divide-y divide-border rounded-card border border-border bg-card" data-testid="my-threads">
          {data.items.map((th) => (
            <li key={th.id}>
              <Link href={`/me/messages/${th.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 focus-visible:focus-ring">
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-body", th.unread ? "font-semibold text-fg" : "text-fg")}><bdi>{th.merchant.name}</bdi></span>
                    {th.lastMessage ? <span className="shrink-0 text-caption text-fg-muted">{when(th.lastMessage.at)}</span> : null}
                  </span>
                  <span className="block truncate text-meta text-fg-muted">{th.lastMessage?.direction === "in" ? `${t("inbox.me.you")}: ` : ""}<bdi>{th.lastMessage?.body}</bdi></span>
                </span>
                {th.unread ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption text-primary-foreground">{th.unread}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MyThread({ id }: { id: string }) {
  const { t, time } = useLocaleOrEnglish();
  const [data, setData] = useState<inboxApi.MyThreadResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(() => browserApi.me.thread(id).then(setData).catch(() => setFailed(true)), [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/me/messages" className="inline-flex min-h-11 items-center gap-1 self-start text-meta text-fg-muted"><ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />{t("inbox.me.title")}</Link>
      {failed ? <p className="text-body text-fg-muted">{t("inbox.me.failed")}</p> : null}
      {data ? (
        <>
          <h1 className="text-title text-fg"><bdi>{data.thread.merchant.name}</bdi></h1>
          <div className="flex flex-col gap-2" aria-live="polite" data-testid="my-thread">
            {data.messages.map((m) => (
              <div key={m.id} className={cn("flex max-w-5/6 flex-col", m.direction === "in" ? "ms-auto items-end" : "me-auto items-start")}>
                <p dir="auto" className={cn("whitespace-pre-wrap rounded-r5 px-3.5 py-2 text-body", m.direction === "in" ? "bg-primary text-primary-foreground" : "bg-bg-subtle text-fg")}>{m.body}</p>
                <p className="mt-0.5 text-caption text-fg-muted">{m.direction === "in" ? `${t("inbox.me.you")} · ` : ""}{time(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form
            className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pb-4 pt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!body.trim()) return;
              setBusy(true);
              setErr(false);
              try {
                await browserApi.me.replyThread(id, body.trim());
                setBody("");
                await load();
              } catch {
                setErr(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="my-reply" className="sr-only">{t("inbox.me.reply")}</label>
            <textarea id="my-reply" dir="auto" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1000} placeholder={t("inbox.me.reply")} className="min-h-11 rounded-input border border-line bg-bg px-3 py-2 text-body text-fg focus-visible:focus-ring" />
            {err ? <p className="text-meta text-negative">{t("inbox.me.failed")}</p> : null}
            <Button type="submit" size="lg" loading={busy} disabled={!body.trim()}>{busy ? t("inbox.me.sending") : t("inbox.me.send")}</Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
