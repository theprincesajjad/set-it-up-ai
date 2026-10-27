"use client";
import { UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { classesApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, PageHeader, SidePanel, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/dashboard/calendar";
import { dayHeading, rosterState, timeLabel, todayOf } from "@/lib/dashboard/classes";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function ClassRosterPage() {
  return (
    <FeatureGate keys={["booking.classes"]} title="Classes">
      <Roster />
    </FeatureGate>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", weekday: "short", hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.m\./i, (_, x: string) => ` ${x.toUpperCase()}M`);
}

function Roster() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { api, base, role } = useMerchant();
  const manager = role !== "staff";
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.classes.roster(sessionId), [api, sessionId], { pollMs: 30_000 });
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const run = async (fn: () => Promise<classesApi.RosterResponse>, ok?: string) => {
    const r = await act.run(fn);
    if (r) {
      state.setData(r);
      if (ok) toast({ message: ok, tone: "success" });
    }
  };

  return (
    <Async state={state}>
      {(d) => {
        const s = d.session;
        const booked = d.rows.filter((r) => ["held", "booked", "attended", "late_cancelled", "no_show"].includes(r.status));
        const waiting = d.rows.filter((r) => r.status === "waitlisted").sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
        const cancelled = s.status === "cancelled";
        return (
          <div className="flex flex-col gap-6">
            <PageHeader
              flush
              back={{ href: `${base}/classes`, label: "Class schedule" }}
              title={s.name}
              description={`${dayHeading(new Date(s.startsAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }), todayOf())}, ${timeLabel(s.startsAt)} to ${timeLabel(s.endsAt)}${s.instructorName ? `, ${s.instructorName}` : ""}${s.womenOnly ? `${s.instructorName?.endsWith(".") ? "" : "."} Women only.` : ""}`}
              actions={
                cancelled ? (
                  <Tag>Cancelled</Tag>
                ) : (
                  <>
                    {manager ? <Button variant="secondary" onClick={() => setCancelling(true)}>Cancel class</Button> : null}
                    <Button variant="secondary" iconStart={UserPlus} onClick={() => setAdding(true)}>Add member</Button>
                    <Button href={`${base}/classes/door?session=${s.id}`}>Open check-in</Button>
                  </>
                )
              }
            />
            <p className="rounded-input bg-bg-subtle px-4 py-3 text-meta text-fg-muted">
              Free to cancel until {when(d.policy.freeCancelUntil)}. After that the class is used up
              {d.policy.lateFeeCents ? `, and members pay a ${money(d.policy.lateFeeCents)} late fee` : ""}.
            </p>
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <section aria-label="Roster" className="flex flex-col gap-2">
                <h2 className="text-body-strong text-fg">Booked {s.booked} of {s.capacity}</h2>
                {booked.length === 0 ? (
                  <p className="rounded-card border border-line px-4 py-6 text-meta text-fg-muted">Nobody is booked yet.</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                    {booked.map((r) => {
                      const st = rosterState(r);
                      return (
                        <li key={r.bookingId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-strong">{r.name ?? r.maskedPhone ?? "Member"}</span>
                            <span className="block truncate text-meta text-fg-muted">{r.payLabel}</span>
                          </span>
                          <Dot tone={st.tone}>{st.text}</Dot>
                          {r.status === "booked" ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => run(() => api.classes.checkInRow(r.bookingId), "Checked in")}>Check in</Button>
                              {manager ? <Button size="sm" variant="ghost" onClick={() => run(() => api.classes.markBooking(r.bookingId, "no_show"), "Marked no-show")}>No-show</Button> : null}
                            </>
                          ) : r.status === "attended" ? (
                            <span className="text-meta text-fg-muted">{r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }) : ""}</span>
                          ) : r.status === "late_cancelled" || r.status === "no_show" ? (
                            manager ? <Button size="sm" variant="ghost" onClick={() => run(() => api.classes.markBooking(r.bookingId, "excused"), "Excused: credit back, fee refunded")}>Excuse</Button> : null
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section aria-label="Waitlist" className="flex flex-col gap-2">
                <h2 className="text-body-strong text-fg">Waitlist, {waiting.length} {waiting.length === 1 ? "person" : "people"}</h2>
                {waiting.length === 0 ? (
                  <p className="rounded-card border border-line px-4 py-4 text-meta text-fg-muted">Nobody is waiting.</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                    {waiting.map((r) => (
                      <li key={r.bookingId} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-5 text-body-strong tabular text-accent-text">{r.waitlistPosition}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-strong">{r.name ?? r.maskedPhone ?? "Member"}</span>
                          <span className="block truncate text-meta text-fg-muted">{r.payLabel}</span>
                        </span>
                        {r.waitlistPosition && r.waitlistPosition > 1 ? <Button size="sm" variant="secondary" onClick={() => run(() => api.classes.moveWaitlist(r.bookingId, 1), "Moved to the front")}>Move up</Button> : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-meta text-fg-muted">When someone cancels before the cutoff, the first person on the list with a membership or a pass gets the spot and a text. No one is promoted inside the last 2 hours.</p>
              </section>
            </div>
            <AddMember open={adding} onClose={() => setAdding(false)} full={s.booked >= s.capacity} onAdd={(b) => run(() => api.classes.addToSession(sessionId, b), "Added to the class")} />
            <ConfirmDialog
              open={cancelling}
              onClose={() => setCancelling(false)}
              danger
              title="Cancel this class?"
              body={`${s.booked} booked and ${s.waitlisted} waiting will be told. Pack credits go back and drop-ins are refunded.`}
              confirmLabel="Cancel class"
              onConfirm={async () => {
                await api.classes.cancelSession(sessionId, "Cancelled by the studio");
                await state.reload();
                toast({ message: "Class cancelled", tone: "success" });
              }}
            />
          </div>
        );
      }}
    </Async>
  );
}

function AddMember({ open, onClose, full, onAdd }: { open: boolean; onClose: () => void; full: boolean; onAdd: (b: Record<string, unknown>) => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [comp, setComp] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Add a member"
      subtitle="Uses their membership or pass. Turn on Guest for no charge."
      label="Add a member"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={phone.replace(/\D/g, "").length < 10}
            onClick={async () => {
              await onAdd({ phone, customerName: name.trim() || undefined, comp, overCapacity: over });
              setPhone("");
              setName("");
              onClose();
            }}
          >
            Add to class
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="416 555 0100" />
        <TextField label="Name, if new" optionalLabel value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex items-center justify-between gap-4"><p className="text-body text-fg">Guest (no pass used)</p><SwitchControl checked={comp} onChange={setComp} ariaLabel="Guest" /></div>
        {full ? <div className="flex items-center justify-between gap-4"><p className="text-body text-fg">Add above capacity</p><SwitchControl checked={over} onChange={setOver} ariaLabel="Add above capacity" /></div> : null}
      </div>
    </SidePanel>
  );
}
