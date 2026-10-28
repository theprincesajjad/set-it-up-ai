"use client";
import { normalizeLocale, t, type merchantApi } from "@ll/shared";
import { Dot, QuietLink } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { leadingMarkPct, paceTone, stepsLeft } from "@/lib/dashboard/onboarding";
import { useMerchant } from "../MerchantContext";

/**
 * Home, first 30 days (docs/research/merchant-onboarding.md). One number that matters (members who visited),
 * whether that is enough for today's date, the four milestones, and one concrete next move.
 */
export function ActivationCard({ c, base }: { c: merchantApi.OnboardingChecklist; base: string }) {
  const L = normalizeLocale(useMerchant().me.user.locale) ?? "en";
  const a = c.activation;
  const pct = a.target > 0 ? Math.min(100, (a.members / a.target) * 100) : 0;
  const mark = leadingMarkPct(a);
  const left = stepsLeft(c);
  return (
    <section aria-label={t(L, "ob.card.title", { days: a.windowDays })} dir={L === "ur" ? "rtl" : undefined} lang={L} className="flex flex-col gap-5 rounded-card bg-card shadow-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">{t(L, "ob.card.title", { days: a.windowDays })}</p>
          <h2 className="display mt-1 text-title text-fg">{t(L, "ob.card.membersLine", { members: a.members, target: a.target })}</h2>
        </div>
        <Dot tone={paceTone(a.pace)} className="rounded-full bg-bg-subtle px-3 py-1.5">
          {a.paceLabel}
        </Dot>
      </div>

      <div>
        <div role="progressbar" aria-label={t(L, "ob.card.activeMembers")} aria-valuemin={0} aria-valuemax={a.target} aria-valuenow={a.members} className="relative h-2 w-full rounded-full bg-bg-muted">
          <div className="h-full rounded-full bg-trade" style={{ width: `${pct}%` }} />
          <span aria-hidden className="absolute -top-1 h-4 w-px bg-points" style={{ insetInlineStart: `${mark}%` }} />
        </div>
        <div className="relative mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-caption text-fg-muted">
          <span>0</span>
          {/* On a phone the three labels cannot share a line, so the pace sentence drops under the bar. */}
          <span className="order-last basis-full text-points-text md:order-none md:basis-auto">
            {t(L, "ob.card.pace", { lead: a.leadingMembers, day: a.leadingByDay, target: a.target })}
          </span>
          <span>{t(L, "ob.card.targetLine", { target: a.target })}</span>
        </div>
      </div>

      <ol className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4" aria-label={t(L, "ob.card.milestones")}>
        {a.milestones.map((m) => (
          <li key={m.key} className="min-w-0">
            <span className="flex items-center gap-2 text-body text-fg">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full border-[1.5px]", m.at ? "border-trade bg-trade" : "border-line-strong")} />
              {m.label}
              <span className="sr-only">{" "}{m.at ? t(L, "ob.card.reached") : t(L, "ob.card.notYet")}</span>
            </span>
            <span className="ms-[18px] block text-caption text-fg-muted">{m.detail}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 rounded-[12px] bg-bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-caption font-semibold text-fg-muted">{a.nextMove.title}</p>
          <p className="mt-0.5 text-body text-fg">{a.nextMove.body}</p>
        </div>
        <Button size="md" href={`${base}${a.nextMove.path}`} className="shrink-0 self-start sm:self-center">
          {a.nextMove.cta}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-body-strong text-fg">{t(L, "ob.card.sources")}</h3>
          {a.sources.length ? (
            <ul className="mt-2 divide-y divide-line">
              {a.sources.map((s) => (
                <li key={s.source} className="flex min-h-9 items-center justify-between text-body text-fg">
                  {s.label}
                  <span className="tabular text-fg-muted">{s.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-meta text-fg-muted">{t(L, "ob.card.none")}</p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-body-strong text-fg">{t(L, "ob.card.setupLeft")}</h3>
            <QuietLink href={`${base}/setup`}>{t(L, "ob.card.guide")}</QuietLink>
          </div>
          {left.length || c.later.some((s) => !s.done) ? (
            <ul className="mt-2 divide-y divide-line">
              {left.map((s) => (
                <li key={s.key} className="flex min-h-9 items-center justify-between text-body text-fg">
                  {s.label}
                  <QuietLink href={`${base}/setup?step=${s.key}`} chevron={false}>
                    {t(L, "ob.card.doIt")}
                  </QuietLink>
                </li>
              ))}
              {c.later
                .filter((s) => !s.done)
                .map((s) => (
                  <li key={s.key} className="flex min-h-9 items-center justify-between text-body text-fg-muted">
                    {s.label}
                    <span className="text-caption">{t(L, "ob.card.optional")}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-meta text-fg-muted">{t(L, "ob.card.allSet")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
