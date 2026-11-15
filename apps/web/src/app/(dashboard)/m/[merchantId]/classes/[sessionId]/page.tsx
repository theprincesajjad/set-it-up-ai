"use client";
import { nowMs } from "@/lib/restaurant/util";
import { UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { classesApi } from "@ll/shared";
import { SalePanel } from "@/components/dashboard/classes/SalePanel";
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
import { errorMessage, isApiError } from "@/lib/api/errors";
import { money } from "@/lib/dashboard/calendar";
import { dayHeading, rosterState, timeLabel, todayOf } from "@/lib/dashboard/classes";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { formatTime } from "@/lib/format";

export default function ClassRosterPage() {
  return (
    <FeatureGate keys={["booking.classes"]} title="Classes">
      <Roster />
    </FeatureGate>
  );
}

/** "Thu 5:30 p.m.": the weekday and the dashboard's one time style. */
function when(iso: string) {
  return `${new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short" })} ${formatTime(iso)}`;
}

function Roster() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { api, base, role } = useMerchant();
  const manager = role === "owner" || role === "manager";
  // An Instructor login checks people in; the desk adds, cancels and books.
  const desk = role !== "instructor";
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.classes.roster(sessionId), [api, sessionId], { pollMs: 30_000 });
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [dropping, setDropping] = useState<classesApi.RosterRowDto | null>(null);
  const [guest, setGuest] = useState<classesApi.RosterRowDto | null>(null);
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
        // A class that is over cannot be cancelled, added to or checked in: only its roster remains.
        const ended = !cancelled && new Date(s.endsAt).getTime() < nowMs();
        const dayLabel = dayHeading(new Date(s.startsAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }), todayOf());
        const endedWhen = dayLabel.startsWith("Today") ? "earlier today" : `on ${dayLabel}`;
        const cutoff = when(d.policy.freeCancelUntil);
        const attendedCount = d.rows.filter((r) => r.status === "attended").length;
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
                ) : ended ? (
                  <Tag>Ended</Tag>
                ) : (
                  <>
                    {manager && new Date(s.startsAt).getTime() > nowMs() ? <Button variant="secondary" onClick={() => setCancelling(true)}>Cancel class</Button> : null}
                    {desk ? <Button variant="secondary" iconStart={UserPlus} onClick={() => setAdding(true)}>Add member</Button> : null}
                    <Button href={`${base}/classes/door?session=${s.id}`}>Open check-in</Button>
                  </>
                )
              }
            />
            {ended ? (
              <p data-testid="class-ended" className="rounded-input bg-bg-subtle px-4 py-3 text-meta text-fg-muted">
                This class ended {endedWhen}. {attendedCount === 1 ? "1 person attended" : `${attendedCount} people attended`}.
              </p>
            ) : (
              <p className="rounded-input bg-bg-subtle px-4 py-3 text-meta text-fg-muted">
                Free to cancel until {cutoff}{cutoff.endsWith(".") ? "" : "."} After that the class is used up
                {d.policy.lateFeeCents ? `, and members pay a ${money(d.policy.lateFeeCents)} late fee` : ""}.
              </p>
            )}
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <section aria-label="Roster" className="flex flex-col gap-2">
                <h2 className="text-body-strong text-fg">Booked {s.booked} of {s.capacity}</h2>
                {booked.length === 0 ? (
                  <p className="rounded-card bg-card shadow-card px-4 py-6 text-meta text-fg-muted">Nobody is booked yet.</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-card">
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
                              {desk ? <Button size="sm" variant="ghost" onClick={() => setDropping(r)}>Cancel booking</Button> : null}
                            </>
                          ) : r.status === "attended" ? (
                            <span className="text-meta text-fg-muted">{r.checkedInAt ? formatTime(r.checkedInAt) : ""}</span>
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
                  <p className="rounded-card bg-card shadow-card px-4 py-4 text-meta text-fg-muted">Nobody is waiting.</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-card">
                    {waiting.map((r) => (
                      <li key={r.bookingId} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-5 text-body-strong tabular text-points-text">{r.waitlistPosition}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-strong">{r.name ?? r.maskedPhone ?? "Member"}</span>
                          <span className="block truncate text-meta text-fg-muted">{r.payLabel}</span>
                        </span>
                        {desk && r.waitlistPosition && r.waitlistPosition > 1 ? <Button size="sm" variant="ghost" onClick={() => run(() => api.classes.moveWaitlist(r.bookingId, 1), "Moved to the front")}>Move up</Button> : null}
                        {desk ? <Button size="sm" variant="secondary" onClick={async () => {
                          act.setError(null);
                          try {
                            state.setData(await api.classes.bookIn(r.bookingId, { overCapacity: s.booked >= s.capacity }));
                            toast({ message: `${r.name ?? "They"} booked in`, tone: "success" });
                          } catch (e) {
                            if (isApiError(e) && e.code === "no_pass") setGuest(r);
                            else act.setError(errorMessage(e));
                          }
                        }}>Book in now</Button> : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-meta text-fg-muted">When someone cancels before the cutoff, the first person on the list with a membership or a pass gets the spot and a text. No one is promoted inside the last 2 hours.</p>
              </section>
            </div>
            <ConfirmDialog
              open={!!dropping}
              onClose={() => setDropping(null)}
              danger
              title={`Cancel ${dropping?.name ?? "this"} booking?`}
              body={`Inside the free cancel window their pass credit goes back. After ${when(d.policy.freeCancelUntil)} the class is used up${d.policy.lateFeeCents ? ` and the ${money(d.policy.lateFeeCents)} late fee applies` : ""}. Use Excuse afterwards if it was not their fault.`}
              confirmLabel="Cancel booking"
              onConfirm={async () => {
                if (!dropping) return;
                await run(() => api.classes.cancelBooking(dropping.bookingId), "Booking cancelled");
              }}
            />
            <ConfirmDialog
              open={!!guest}
              onClose={() => setGuest(null)}
              title={`${guest?.name ?? "They"} cannot be booked from a pass`}
              body="They have no membership or pass to use. Book them in as a guest with no charge, or sell a drop-in first from Memberships & passes."
              confirmLabel="Book as a guest"
              onConfirm={async () => {
                if (!guest) return;
                await run(() => api.classes.bookIn(guest.bookingId, { comp: true, overCapacity: s.booked >= s.capacity }), "Booked in as a guest");
              }}
            />
            <AddMember
              open={adding}
              onClose={() => setAdding(false)}
              full={s.booked >= s.capacity}
              sessionId={sessionId}
              offersHref={`${base}/classes/offers`}
              onAdded={(r) => {
                state.setData(r);
                toast({ message: "Added to the class", tone: "success" });
              }}
            />
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

function AddMember({ open, ...rest }: { open: boolean; onClose: () => void; full: boolean; sessionId: string; offersHref: string; onAdded: (r: classesApi.RosterResponse) => void }) {
  return open ? <AddMemberBody {...rest} /> : null;
}

/**
 * Add someone to a class by phone. With no membership or pass the sheet stays open with what was typed, says so in the
 * owner's words and offers the two ways forward in place: sell a drop-in (then book), or add them as a guest.
 */
function AddMemberBody({ onClose, full, sessionId, offersHref, onAdded }: { onClose: () => void; full: boolean; sessionId: string; offersHref: string; onAdded: (r: classesApi.RosterResponse) => void }) {
  const { api } = useMerchant();
  const act = useAction();
  const products = useApi(() => api.classes.products(), [api]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [comp, setComp] = useState(false);
  const [over, setOver] = useState(false);
  const [selling, setSelling] = useState(false);
  const offers = (products.data?.items ?? []).filter((p) => (p.kind === "pack" || p.kind === "drop_in") && p.active).sort((a, b) => Number(b.kind === "drop_in") - Number(a.kind === "drop_in"));
  const dropIn = offers.find((p) => p.kind === "drop_in");
  const who = name.trim() || "They";
  const phoneOk = phone.replace(/\D/g, "").length >= 10;
  const submit = async (asGuest = comp) => {
    const r = await act.run(() => api.classes.addToSession(sessionId, { phone, customerName: name.trim() || undefined, comp: asGuest, overCapacity: over }));
    if (r) {
      onAdded(r);
      onClose();
    }
  };
  // The error says why: only a missing pass keeps the sheet open with next steps.
  const missing = isApiError(act.cause) && act.cause.code === "no_pass";
  return (
    <>
      {selling ? (
        <SalePanel
          open
          onClose={() => setSelling(false)}
          packs={offers}
          prefill={{ phone, name, productId: dropIn?.id }}
          onSaved={async () => {
            setSelling(false);
            await submit(false);
          }}
        />
      ) : null}
      <SidePanel
        open={!selling}
        onClose={onClose}
        title="Add a member"
        subtitle="Uses their membership or pass. Turn on Guest for no charge."
        label="Add a member"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!phoneOk} loading={act.busy} onClick={() => void submit()}>Add to class</Button>
          </div>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (phoneOk) void submit(); }}>
          {missing ? (
            <Banner tone="danger" title={`${who === "They" ? "This person" : who} has no membership or pass yet`}>
              <div className="flex flex-col gap-3">
                <p>
                  {offers.length
                    ? "Sell a drop-in to book them in, or add them as a guest with no charge."
                    : "You have nothing for sale yet, so nobody can book a spot. Add a drop-in price first, or add them as a guest for now."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {offers.length ? <Button size="sm" onClick={() => setSelling(true)}>{dropIn ? `Sell a drop-in (${money(dropIn.priceCents)})` : "Sell a pass"}</Button> : <Button size="sm" href={offersHref}>Add a drop-in price</Button>}
                  <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void submit(true)}>Add as a guest</Button>
                </div>
              </div>
            </Banner>
          ) : act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="416 555 0100" />
          <TextField label="Name, if new" optionalLabel value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex items-center justify-between gap-4"><p className="text-body text-fg">Guest (no pass used)</p><SwitchControl checked={comp} onChange={setComp} ariaLabel="Guest" /></div>
          {full ? <div className="flex items-center justify-between gap-4"><p className="text-body text-fg">Add above capacity</p><SwitchControl checked={over} onChange={setOver} ariaLabel="Add above capacity" /></div> : null}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </SidePanel>
    </>
  );
}
