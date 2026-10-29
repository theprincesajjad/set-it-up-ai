"use client";
/**
 * On the web pass (phase solo, workstream D): "Book again" from the last visit, the messages from shops (with the unread count),
 * and the prompt to get reminders on this phone (docs/business/people-side.md gap 10).
 */
import Link from "next/link";
import { MessageCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { NotifyPrompt } from "@/components/pass/NotifyPrompt";
import { browserApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { bookAgainHref } from "@/lib/people";

export function PeopleLinks({ last, hasVisits }: { last: appointmentsApi.MyAppointmentDto | null; hasVisits: boolean }) {
  const { t } = useLocaleOrEnglish();
  const [threads, setThreads] = useState<{ n: number; unread: number } | null>(null);
  useEffect(() => {
    let live = true;
    browserApi.me
      .threads()
      .then((r) => live && setThreads({ n: r.items.length, unread: r.unreadTotal }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const service = last?.items.map((i) => i.name).join(", ") ?? "";
  return (
    <>
      {last ? (
        <section aria-label={t("people.bookAgain")} className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-4" data-testid="book-again">
          <div className="min-w-0">
            <p className="text-body-strong text-fg"><bdi>{last.merchant.name}</bdi></p>
            <p className="truncate text-meta text-fg-muted">{last.staffName ? t("people.bookAgainWith", { service, name: last.staffName }) : t("people.bookAgainLast", { service })}</p>
          </div>
          <Link href={bookAgainHref(last)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill bg-primary px-4 text-meta-strong text-primary-foreground focus-visible:focus-ring">
            <RotateCcw aria-hidden className="size-4" />
            {t("people.bookAgain")}
          </Link>
        </section>
      ) : null}
      {threads && threads.n > 0 ? (
        <nav aria-label={t("inbox.me.title")} className="rounded-card border border-border bg-card px-4">
          <Link href="/me/messages" className="flex min-h-12 items-center justify-between gap-3 py-3 text-body-strong text-fg" data-testid="my-messages-link">
            <span className="inline-flex items-center gap-2">
              <MessageCircle aria-hidden className="size-4" />
              {t("inbox.me.title")}
            </span>
            {threads.unread ? <span className="text-meta text-fg-muted">{t("inbox.me.unread", { n: threads.unread })}</span> : null}
          </Link>
        </nav>
      ) : null}
      {hasVisits ? <NotifyPrompt compact /> : null}
    </>
  );
}
