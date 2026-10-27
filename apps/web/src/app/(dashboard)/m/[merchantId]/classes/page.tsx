"use client";
import { ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AddClassPanel } from "@/components/dashboard/classes/AddClassPanel";
import { ClassSettingsPanel } from "@/components/dashboard/classes/ClassSettingsPanel";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { EmptyState, PageHeader, Segmented, StatBlock, Tag, ToolbarButton } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { addDays, capacityText, dayHeading, fillPct, groupByDay, sessionState, timeLabel, todayOf, weekNumbers, weekRange } from "@/lib/dashboard/classes";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";

export default function ClassSchedulePage() {
  return (
    <FeatureGate keys={["booking.classes"]} title="Classes">
      <Schedule />
    </FeatureGate>
  );
}

const DOT = { positive: "bg-positive", negative: "bg-negative", neutral: "bg-fg-subtle", accent: "bg-accent" } as const;

function Schedule() {
  const { api, base, role } = useMerchant();
  const manager = role === "owner" || role === "manager";
  const now = new Date(useNow());
  const today = todayOf(now);
  const [anchor, setAnchor] = useState(today);
  const [women, setWomen] = useState<"all" | "women">("all");
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const week = useMemo(() => weekRange(anchor), [anchor]);
  const sessions = useApi(() => api.classes.sessions({ from: week.from, to: week.to }), [api, week.from, week.to], { pollMs: 60_000 });
  const types = useApi(() => api.classes.types(), [api]);
  const summary = useApi(() => api.classes.summary(), [api]);
  const filtered = (sessions.data?.items ?? []).filter((s) => women === "all" || s.womenOnly);
  const nums = weekNumbers(sessions.data?.items ?? []);
  const days = groupByDay(filtered);
  const label = `${new Date(`${week.days[0]}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" })} to ${new Date(`${week.days[6]}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Class schedule"
        description="Classes, spots left and who is waiting. Cancel a class and everyone booked is told and credited."
        actions={
          manager ? (
            <>
              <Button variant="secondary" iconStart={Settings} onClick={() => setSettings(true)}>Class rules</Button>
              <Button iconStart={Plus} onClick={() => setAdding(true)}>Add class</Button>
            </>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <ToolbarButton icon={ChevronLeft} onClick={() => setAnchor(addDays(anchor, -7))}>Previous</ToolbarButton>
          <ToolbarButton onClick={() => setAnchor(today)}>This week</ToolbarButton>
          <ToolbarButton icon={ChevronRight} onClick={() => setAnchor(addDays(anchor, 7))}>Next</ToolbarButton>
        </div>
        <span className="text-meta text-fg-muted tabular">{label}</span>
        <div className="ms-auto">
          <Segmented label="Show" value={women} onChange={setWomen} options={[{ value: "all", label: "All classes" }, { value: "women", label: "Women-only classes" }]} />
        </div>
      </div>
      <StatBlock
        label="This week"
        items={[
          { label: "Booked this week", value: nums.booked, caption: `of ${nums.capacity} spots` },
          { label: "Average fill", value: `${nums.fill}%`, caption: "Of spots in scheduled classes" },
          { label: "On waitlists", dot: nums.waitlisted ? "accent" : undefined, value: nums.waitlisted, caption: nums.fullClasses ? `${nums.fullClasses} class${nums.fullClasses === 1 ? "" : "es"} full` : "No class is full" },
          { label: "Late cancels", value: summary.data?.lateCancelsThisWeek ?? 0, caption: "This calendar week" },
        ]}
      />
      <Async state={sessions}>
        {() =>
          days.length === 0 ? (
            <EmptyState title="No classes this week" description="Add a class and repeat it weekly. Members can book it as soon as it is on the schedule." action={manager ? <Button onClick={() => setAdding(true)}>Add class</Button> : undefined} />
          ) : (
            <div className="flex flex-col gap-6">
              {days.map((d) => (
                <section key={d.date} aria-label={dayHeading(d.date, today)} className="flex flex-col gap-2">
                  <h2 className="text-body-strong text-fg">{dayHeading(d.date, today)}</h2>
                  <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                    {d.items.map((s) => {
                      const cap = capacityText(s);
                      const st = sessionState(s, now);
                      return (
                        <li key={s.id}>
                          <Link href={`${base}/classes/${s.id}`} className="grid min-h-14 grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-bg-subtle focus-visible:focus-ring sm:grid-cols-[84px_minmax(0,1fr)_auto_130px_110px_90px]">
                            <span className="text-body-strong tabular">{timeLabel(s.startsAt)}</span>
                            <span className="min-w-0">
                              <span className={cn("block truncate text-body-strong", s.status === "cancelled" && "text-fg-muted line-through")}>{s.name}</span>
                              <span className="block truncate text-meta text-fg-muted">{s.instructorName ?? "No instructor"}</span>
                            </span>
                            <span className="hidden sm:block">{s.womenOnly ? <Tag>Women only</Tag> : null}</span>
                            <span className="flex items-center gap-2 text-meta">
                              <span aria-hidden className="h-1.5 w-[72px] overflow-hidden rounded-full bg-bg-muted"><span className={cn("block h-full rounded-full", cap.full ? "bg-fg" : "bg-accent")} style={{ width: `${Math.max(fillPct(s.booked, s.capacity), 6)}%` }} /></span>
                              <span className="tabular text-fg">{cap.count}</span>
                              <span className="sr-only">booked</span>
                            </span>
                            <span className="hidden text-meta text-accent-text sm:block">{cap.waitlist ?? (cap.full ? <span className="text-fg-muted">Full</span> : "")}</span>
                            <span className="hidden items-center gap-1.5 text-meta text-fg sm:flex"><span aria-hidden className={cn("size-2 rounded-full", DOT[st.tone])} />{st.text}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )
        }
      </Async>
      <AddClassPanel open={adding} onClose={() => setAdding(false)} types={types.data?.items ?? []} onSaved={async () => { await Promise.all([sessions.reload(), types.reload(), summary.reload()]); }} defaultDate={anchor} />
      <ClassSettingsPanel open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
