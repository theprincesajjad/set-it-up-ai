"use client";
import type { merchantApi } from "@ll/shared";
import { Dot, QuietLink } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { leadingMarkPct, membersLine, paceTone, stepsLeft } from "@/lib/dashboard/onboarding";

/**
 * Home, first 30 days (docs/research/merchant-onboarding.md). One number that matters (members who visited),
 * whether that is enough for today's date, the four milestones, and one concrete next move.
 */
export function ActivationCard({ c, base }: { c: merchantApi.OnboardingChecklist; base: string }) {
  const a = c.activation;
  const pct = a.target > 0 ? Math.min(100, (a.members / a.target) * 100) : 0;
  const mark = leadingMarkPct(a);
  const left = stepsLeft(c);
  return (
    <section aria-label="Your first 30 days" className="flex flex-col gap-5 rounded-card border border-line p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">Your first 30 days</p>
          <h2 className="display mt-1 text-title text-fg">{membersLine(a.members, a.target)}</h2>
        </div>
        <Dot tone={paceTone(a.pace)} className="rounded-full bg-bg-subtle px-3 py-1.5">
          {a.paceLabel}
        </Dot>
      </div>

      <div>
        <div role="progressbar" aria-label="Active members" aria-valuemin={0} aria-valuemax={a.target} aria-valuenow={a.members} className="relative h-2 w-full rounded-full bg-bg-muted">
          <div className="h-full rounded-full bg-fg" style={{ width: `${pct}%` }} />
          <span aria-hidden className="absolute -top-1 h-4 w-px bg-accent" style={{ insetInlineStart: `${mark}%` }} />
        </div>
        <div className="relative mt-2 flex justify-between text-caption text-fg-muted">
          <span>0</span>
          <span className="text-accent-text">
            {a.leadingMembers} by day {a.leadingByDay} is the pace that gets you to {a.target}
          </span>
          <span>{a.target} = active shop</span>
        </div>
      </div>

      <ol className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4" aria-label="Milestones">
        {a.milestones.map((m) => (
          <li key={m.key} className="min-w-0">
            <span className="flex items-center gap-2 text-body text-fg">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full border-[1.5px]", m.at ? "border-fg bg-fg" : "border-line-strong")} />
              {m.label}
              <span className="sr-only">{m.at ? " (reached)" : " (not yet)"}</span>
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
          <h3 className="text-body-strong text-fg">Where members came from</h3>
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
            <p className="mt-2 text-meta text-fg-muted">Nobody has joined yet.</p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-body-strong text-fg">Setup left</h3>
            <QuietLink href={`${base}/setup`}>Setup guide</QuietLink>
          </div>
          {left.length || c.later.some((s) => !s.done) ? (
            <ul className="mt-2 divide-y divide-line">
              {left.map((s) => (
                <li key={s.key} className="flex min-h-9 items-center justify-between text-body text-fg">
                  {s.label}
                  <QuietLink href={`${base}/setup?step=${s.key}`} chevron={false}>
                    Do it
                  </QuietLink>
                </li>
              ))}
              {c.later
                .filter((s) => !s.done)
                .map((s) => (
                  <li key={s.key} className="flex min-h-9 items-center justify-between text-body text-fg-muted">
                    {s.label}
                    <span className="text-caption">Optional</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-meta text-fg-muted">Everything is set up.</p>
          )}
        </div>
      </div>
    </section>
  );
}
