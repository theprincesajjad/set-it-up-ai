"use client";
import { Meter, PageHeader, Panel, EmptyState, Tag } from "@/components/dashboard/kit";
import { Footprints, Navigation, PlusCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { repApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatTime } from "@/lib/format";
import { longDate } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

const OUTCOMES = ["Reached owner: going well", "Reached owner: needs help", "Left a message", "No answer", "Visited in person"];
const CHANNEL: Record<string, string> = { phone: "phone", whatsapp: "WhatsApp video", video: "video call" };

/** Today: what is due, in the order a rep does it: the street day, calls due on day 7 and day 30, setup sessions, website leads. */
export default function RepToday() {
  const toast = useToast();
  const today = useApi(() => browserApi.rep.today(), [], { pollMs: 60000 });
  const [showAll, setShowAll] = useState(false);
  const [log, setLog] = useState<repApi.RepToday["checkInsDue"][number] | null>(null);
  const [outcome, setOutcome] = useState(OUTCOMES[0]!);
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Today" description={longDate()} actions={<Button size="sm" iconStart={PlusCircle} href="/rep/signup">Sign up a shop</Button>} />
      <Async state={today}>
        {(t) => (
          <>
            {t.streetDay ? (
              <section aria-label="Street day" className="rounded-card border border-line p-4">
                <p className="text-label text-fg-muted">{t.streetDay.isToday ? "STREET DAY · TODAY" : `STREET DAY · ${t.streetDay.streetDayOn ? formatDate(`${t.streetDay.streetDayOn}T12:00:00`, true).toUpperCase() : "NEXT"}`}</p>
                <h2 className="mt-1 font-display text-[24px] font-semibold leading-8 text-fg">{t.streetDay.areaName}</h2>
                <div className="mt-3 flex items-center gap-3">
                  <Meter value={t.streetDay.visited} max={Math.max(t.streetDay.total, 1)} label="Shops visited" className="flex-1" />
                  <span className="shrink-0 text-meta text-fg-muted tabular">{t.streetDay.visited} of {t.streetDay.total} visited</span>
                </div>
                <Button className="mt-3" fullWidth size="lg" iconStart={Footprints} href="/rep/day">{t.streetDay.visited ? "Continue the route" : "Start the route"}</Button>
              </section>
            ) : (
              <EmptyState title="No street day planned" description="Your next street day shows here once an admin assigns one in Areas." action={<Button variant="secondary" href="/rep/leads">Open leads</Button>} />
            )}

            <Panel title="Calls and setups due" description="Day 7 and day 30 follow-ups, and remote setup sessions" padded={false}>
              {t.checkInsDue.length || t.setupSessions.length ? (
                <ul className="divide-y divide-line">
                  {t.setupSessions.map((s) => (
                    <li key={s.leadId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/rep/leads/${s.leadId}`} className="block truncate text-body font-medium text-fg hover:underline">{s.businessName}</Link>
                        <p className="truncate text-meta text-fg-muted">Setup session · {formatTime(s.setupAt)} · {s.setupChannel ? CHANNEL[s.setupChannel] : "phone"}</p>
                      </div>
                      {s.phone ? <Button size="sm" variant="secondary" href={`tel:${s.phone}`}>Call</Button> : null}
                      <Button size="sm" variant="secondary" href={`/rep/signup?leadId=${s.leadId}`}>Start</Button>
                    </li>
                  ))}
                  {[...t.checkInsDue].sort((a, b) => b.daysSinceSignup - a.daysSinceSignup).slice(0, showAll ? undefined : 8).map((c) => (
                    <li key={`${c.merchantId}-${c.day}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/rep/merchants/${c.merchantId}`} className="block truncate text-body font-medium text-fg hover:underline">{c.name}</Link>
                        <p className="truncate text-meta text-fg-muted">Day {c.day} call · {c.activeMembers} of {c.target} members · signed {c.daysSinceSignup} days ago</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setLog(c)}>Log call</Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-meta text-fg-muted">All caught up. No calls or setup sessions are due.</p>
              )}
              {t.checkInsDue.length > 8 && !showAll ? <div className="border-t border-line px-4 py-2"><Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>Show all {t.checkInsDue.length} calls</Button></div> : null}
            </Panel>

            <Panel title="New from the website" description="Unassigned. Touching one claims it" padded={false} action={<Button variant="ghost" size="sm" href="/rep/leads">Pipeline</Button>}>
              {t.websiteLeads.length ? (
                <ul className="divide-y divide-line">
                  {t.websiteLeads.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span aria-hidden className="size-2 shrink-0 rounded-full bg-points" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/rep/leads/${l.id}`} className="block truncate text-body font-medium text-fg hover:underline">{l.businessName}</Link>
                        <p className="truncate text-meta text-fg-muted">{[l.vertical?.replace(/_/g, " "), l.language ? { en: "English", hi: "Hindi", ur: "Urdu", pa: "Punjabi" }[l.language] : null, `asked ${formatTime(l.createdAt)}`].filter(Boolean).join(" · ")}</p>
                      </div>
                      {l.phone ? <Button size="sm" variant="secondary" href={`tel:${l.phone}`}>Call</Button> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-meta text-fg-muted">Nothing waiting.</p>
              )}
            </Panel>

            {t.leadsDue.length ? (
              <Panel title="Follow-ups due" description="Leads whose next step is today or overdue" padded={false}>
                <ul className="divide-y divide-line">
                  {t.leadsDue.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/rep/leads/${l.id}`} className="block truncate text-body font-medium text-fg hover:underline">{l.businessName}</Link>
                        <p className="truncate text-meta text-fg-muted">{l.address ?? ""}{l.nextActionAt ? ` · due ${formatDate(l.nextActionAt, true)}` : ""}</p>
                      </div>
                      <Tag>{l.stage.replace("_", " ")}</Tag>
                      {l.address ? <Button size="sm" variant="ghost" iconStart={Navigation} href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`}>Navigate</Button> : null}
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </>
        )}
      </Async>
      <ConfirmDialog open={!!log} onClose={() => setLog(null)} title={`Log day ${log?.day} call`} body={log?.name} confirmLabel="Save" onConfirm={async () => {
        await browserApi.rep.checkIn(log!.merchantId, { day: log!.day, outcome, notes: note.trim() || undefined });
        setNote("");
        toast({ message: "Call logged", tone: "success" });
        await today.reload();
      }}>
        <div className="flex flex-col gap-3">
          <Select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={OUTCOMES.map((o) => ({ value: o, label: o }))} />
          <TextField type="textarea" label="Notes" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
