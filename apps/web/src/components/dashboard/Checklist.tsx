"use client";
import { Check, ChevronRight, Leaf } from "lucide-react";
import Link from "next/link";
import type { merchantApi } from "@ll/shared";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/dashboard/useApi";

export const STEP_COPY: Record<merchantApi.OnboardingStepKey, { label: string; action: string; path: string }> = {
  profile: { label: "Shop details", action: "Add details", path: "/settings" },
  program: { label: "Program set", action: "Review program", path: "/program" },
  rewards: { label: "Rewards ready", action: "Check rewards", path: "/program?tab=rewards" },
  staff: { label: "Staff added", action: "Invite staff", path: "/staff" },
  qr_kit: { label: "QR stand printed", action: "Print QR kit", path: "/locations" },
  first_members: { label: "25 active members", action: "Open counter", path: "/counter" },
};

/** Ordered for display: incomplete first, completed (leaf check, normal text) below. */
export function orderSteps(steps: merchantApi.OnboardingStep[]): merchantApi.OnboardingStep[] {
  return [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)];
}

/** Home checklist card (merchant-dashboard.md §1): shown until 100%, "4 of 6". */
export function ChecklistCard({ checklist, base }: { checklist: merchantApi.OnboardingChecklist; base: string }) {
  const done = checklist.steps.filter((s) => s.done).length;
  return (
    <Card padding="lg" aria-labelledby="checklist-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="checklist-title" className="text-body-strong text-fg">
            Get set up
          </h2>
          <p className="text-meta text-fg-muted">A few minutes now, and your first customers can join today.</p>
        </div>
        <Link href={`${base}/setup`} className="text-label text-fg underline-offset-2 hover:underline">
          Open setup guide
        </Link>
      </div>
      <ProgressBar value={done} max={checklist.steps.length} label="Setup progress" valueText={`${done} of ${checklist.steps.length}`} />
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {orderSteps(checklist.steps).map((s) => {
          const c = STEP_COPY[s.key];
          return (
            <li key={s.key}>
              <Link href={`${base}${s.key === "first_members" || s.done ? c.path : `/setup?step=${s.key}`}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-bg-subtle focus-visible:focus-ring">
                <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", s.done ? "bg-success-subtle text-on-success-subtle" : "border-2 border-line-strong")}>
                  {s.done ? <Leaf className="size-4" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-fg">
                    <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
                    {c.label}
                  </span>
                  {s.detail ? <span className="block text-meta text-fg-muted">{s.detail}</span> : null}
                </span>
                {!s.done ? (
                  <span className="flex shrink-0 items-center gap-1 text-label text-fg">
                    {c.action}
                    <ChevronRight aria-hidden className="size-4" />
                  </span>
                ) : (
                  <Check aria-hidden className="size-4 text-positive" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** First-30-days activation card. */
export function ActivationCard({ active, target, createdAt }: { active: number; target: number; createdAt: string }) {
  const now = useNow();
  const days = Math.max(0, 30 - Math.floor((now - new Date(createdAt).getTime()) / 86_400_000));
  return (
    <Card padding="lg">
      <h2 className="text-title text-fg">Your first 25 members</h2>
      <ProgressBar className="mt-3" value={active} max={target} label="Active members" valueText={`${active} of ${target} active members`} />
      <p className="mt-2 text-meta text-fg-muted">
        {days > 0 ? `${days} day${days === 1 ? "" : "s"} left in your first 30. ` : ""}Ask every customer for their number this week. A member counts once they&apos;ve visited.
      </p>
    </Card>
  );
}
