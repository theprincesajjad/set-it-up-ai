"use client";
import { Plus, Tablet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { barberApi } from "@ll/shared";
import { AddToLine } from "@/components/dashboard/queue/AddToLine";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, PageHeader, StatBlock } from "@/components/dashboard/kit";
import { ListError, ListLoading } from "@/components/dashboard/ListStates";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { chairAction, entryMeta, nextFor } from "@/lib/dashboard/queue";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function QueuePage() {
  return (
    <FeatureGate keys={["booking.walkin_queue"]} title="Walk-in line">
      <Board />
    </FeatureGate>
  );
}

/** Walk-in line (docs/research/barbers-beauty.md, Figma frame 1): who is waiting, who is in each chair, the barber picks who is next. */
function Board() {
  const { api, base, me, role } = useMerchant();
  const toast = useToast();
  const router = useRouter();
  const act = useAction();
  const [add, setAdd] = useState(false);
  const state = useApi(() => api.barber.board(), [api], { pollMs: 10_000 });
  const b = state.data;
  const open = b?.settings.open ?? false;
  const myId = me.user.id;

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    const r = await act.run(fn);
    if (r && ok) toast({ message: ok, tone: "success" });
    await state.reload();
    return r;
  }
  // Skip is for someone who was called and did not answer. The second skip takes them off the line, so it asks first; both can be undone for 10 s.
  const [confirmSkip, setConfirmSkip] = useState<barberApi.QueueEntryDto | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<barberApi.QueueEntryDto | null>(null);
  async function skip(e: barberApi.QueueEntryDto) {
    const r = await act.run(() => api.barber.skip(e.id));
    await state.reload();
    const undo = r?.undo;
    if (r && undo) {
      toast({
        message: r.entry.status === "no_show" ? `${e.name} is off the line` : `${e.name} goes back two places`,
        tone: "success",
        duration: 10_000,
        action: { label: "Undo", onClick: () => void act.run(() => api.barber.undoSkip(e.id, undo)).then(() => state.reload()) },
      });
    }
  }
  // Done finishes the chair; the visit still needs its payment, tip and stamp, so the toast and the board offer Check out.
  async function finish(entryId: string) {
    const r = await act.run(() => api.barber.done(entryId));
    await state.reload();
    const appt = r?.entry.appointmentId;
    if (r && appt) toast({ message: `${r.entry.name} is done. Take payment next.`, tone: "success", duration: 12_000, action: { label: "Check out", onClick: () => router.push(`${base}/calendar?appt=${appt}&checkout=1`) } });
  }
  const callFor = (entry: barberApi.QueueEntryDto, staffId: string) => run(() => api.barber.call(entry.id, staffId), `${entry.name} was texted if they asked`);
  const myChair = b?.chairs.find((c) => c.staffId === myId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Walk-in line"
        description="Clients join from their phone or the tablet at the door. You pick who is next."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={open ? "secondary" : "primary"} onClick={() => run(() => api.barber.saveSettings({ open: !open }), open ? "The line is closed to new people" : "The line is open")}>
              {open ? "Close the line" : "Open the line"}
            </Button>
            <Button size="sm" variant="secondary" iconStart={Tablet} href={`${base}/queue/door`}>Door tablet</Button>
            <Button size="sm" iconStart={Plus} onClick={() => setAdd(true)}>Add someone</Button>
          </div>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {state.error && !b ? <ListError title="We could not load the line." detail={state.error} onRetry={state.reload} /> : null}
      <StatBlock tiles
        label="The line now"
        loading={!b}
        items={[
          { label: "Waiting", value: b?.stats.waiting ?? 0, caption: b && b.stats.waiting ? `Longest ${b.stats.longestWaitMin} min` : "Nobody waiting", dot: b && b.stats.waiting ? "accent" : undefined },
          { label: "About", value: b?.stats.estimateMin == null ? "No chair" : b.stats.estimateMin <= 0 ? "No wait" : `${b.stats.estimateMin} min`, caption: "for someone joining now" },
          { label: "Chairs taking walk-ins", value: b ? `${b.stats.chairsTaking} of ${b.stats.chairsTotal}` : "", caption: "Set who takes walk-ins in Staff" },
          { label: "Served today", value: b?.stats.servedToday ?? 0, caption: `${b?.stats.noShowsToday ?? 0} no-show${b?.stats.noShowsToday === 1 ? "" : "s"}` },
        ]}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Waiting" className="overflow-hidden rounded-card bg-card shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-body-strong text-fg">Waiting</h2>
            <p className="text-meta text-fg-muted">Barber&apos;s pick, not first come only</p>
          </div>
          {!b ? (
            <ListLoading label="Loading the line" rows={3} avatar={false} className="rounded-none border-0" />
          ) : b.waiting.length === 0 && b.called.length === 0 ? (
            <p className="px-5 py-6 text-meta text-fg-muted">{open ? "Nobody is waiting. New people show up here the moment they join." : "The line is closed. Open it when you are ready for walk-ins."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {b.called.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 bg-points-soft px-5 py-3.5">
                  <span aria-hidden className="w-6 text-[20px] font-semibold text-points-text">&rsaquo;</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-meta-strong text-fg">{e.name}</p>
                    <p className="text-meta text-fg-muted">{entryMeta(e)}</p>
                  </div>
                  <Dot tone="accent">Called, on the way to {b.chairs.find((c) => c.staffId === e.calledStaffId)?.name ?? "a chair"}</Dot>
                  <Button size="sm" onClick={() => run(() => api.barber.start(e.id))}>In the chair</Button>
                  <Button size="sm" variant="ghost" onClick={() => (e.skips >= 1 ? setConfirmSkip(e) : skip(e))}>Skip</Button>
                </li>
              ))}
              {b.waiting.map((e) => (
                <li key={e.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5", e.position === 1 && "bg-points-soft")}>
                  <span className={cn("w-6 text-[20px] font-semibold tabular", e.position === 1 ? "text-points-text" : "text-fg-muted")}>{e.position}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-meta-strong text-fg">{e.name}{e.skips ? <span className="font-normal text-fg-muted"> · skipped once</span> : null}</p>
                    <p className="text-meta text-fg-muted">{entryMeta(e)}</p>
                  </div>
                  <span className="text-meta text-fg-muted tabular">waiting {e.waitedMin} min</span>
                  {e.textedNext ? <span className="rounded-pill bg-bg-muted px-2 py-0.5 text-meta text-positive-text">Text sent: you&apos;re next</span> : null}
                  <Button size="sm" variant="secondary" disabled={!myChair?.takesWalkIns && role === "staff"} onClick={() => callFor(e, myChair?.takesWalkIns ? myId : (b.chairs.find((c) => c.state === "free" && c.takesWalkIns)?.staffId ?? myId))}>Call</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(e)}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Chairs" className="flex flex-col gap-3">
          <h2 className="text-body-strong text-fg">Chairs</h2>
          {(b?.chairs ?? []).map((c) => {
            const a = chairAction(c, (b?.waiting.length ?? 0) > 0);
            const next = b ? nextFor(c.staffId, b.waiting) : null;
            return (
              <div key={c.staffId} className="flex flex-col gap-1.5 rounded-card bg-card shadow-card px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-meta-strong text-fg">{c.name}{c.staffId === myId ? <span className="font-normal text-fg-muted"> (you)</span> : null}</p>
                  {a.kind === "none" ? (
                    <span className="text-meta text-fg-muted">{a.label}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant={a.kind === "call-next" ? "primary" : "secondary"}
                      onClick={() => {
                        if (a.kind === "done" && c.entryId) return finish(c.entryId);
                        if (a.kind === "start" && c.entryId) return run(() => api.barber.start(c.entryId!));
                        if (a.kind === "call-next" && next) return callFor(next, c.staffId);
                      }}
                    >
                      {a.label}
                    </Button>
                  )}
                </div>
                <p className="text-meta text-fg-muted">
                  {c.state === "busy" ? `${c.doing ?? "In the chair"}${c.minutesIn !== null ? ` · ${c.minutesIn} min in` : ""}` : c.state === "called" ? (c.doing ?? "Someone is on the way") : c.state === "away" ? "Not taking walk-ins" : "Free"}
                  {c.waitingForThem ? ` · ${c.waitingForThem} asked for ${c.staffId === myId ? "you" : c.name}` : ""}
                </p>
              </div>
            );
          })}
          <div className="rounded-card bg-bg-subtle px-4 py-3.5">
            <p className="text-meta-strong text-fg">No-show rule</p>
            <p className="mt-1 text-meta text-fg-muted">Called and no answer after {b?.settings.callHoldMinutes ?? 5} minutes: Skip puts them back 2 places and texts them again. A second skip takes them off. Skip only works on someone you have called. No fee, no card needed.</p>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={!!confirmSkip}
        onClose={() => setConfirmSkip(null)}
        title={`Take ${confirmSkip?.name ?? "them"} off the line?`}
        body="They were already skipped once. Skipping again removes them and they would have to join again. You can undo it for a few seconds."
        confirmLabel="Take off the line"
        danger
        onConfirm={() => (confirmSkip ? skip(confirmSkip) : undefined)}
      />
      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title={`Remove ${confirmRemove?.name ?? "them"}?`}
        body="Use this when someone left. They drop off the line and are not texted."
        confirmLabel="Remove"
        danger
        onConfirm={() => (confirmRemove ? run(() => api.barber.remove(confirmRemove.id)) : undefined)}
      />
      <AddToLine open={add} onClose={() => setAdd(false)} board={b} onAdded={() => state.reload()} />
    </div>
  );
}
