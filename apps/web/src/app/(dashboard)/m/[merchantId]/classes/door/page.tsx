"use client";
import { ScanLine } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { classesApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, PageHeader } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/dashboard/calendar";
import { classifyRef, doorTone, timeLabel } from "@/lib/dashboard/classes";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";

export default function DoorPage() {
  return (
    <FeatureGate keys={["booking.classes"]} title="Door check-in">
      <Door />
    </FeatureGate>
  );
}

const CARD = { positive: "border-positive/30 bg-positive/10", neutral: "border-line bg-bg-subtle", negative: "border-line bg-bg" } as const;

function Door() {
  const { api, base } = useMerchant();
  const params = useSearchParams();
  const sessionId = params.get("session") ?? undefined;
  const act = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [last, setLast] = useState<classesApi.CheckInResponse | null>(null);
  const door = useApi(() => api.classes.door(sessionId), [api, sessionId], { pollMs: 15_000 });
  useEffect(() => input.current?.focus(), [last]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ref = classifyRef(value);
    if (!ref) return act.setError("Scan a member card or type a 10-digit phone number.");
    const r = await act.run(() => api.classes.checkIn({ ...ref, sessionId, idempotencyKey: crypto.randomUUID() }));
    if (r) {
      setLast(r);
      setValue("");
      await door.reload();
    }
  }
  const s = door.data?.session;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Door check-in"
        description={s ? `Scan the member card or type a phone number. ${timeLabel(s.startsAt)} ${s.name} is open.` : "Scan the member card or type a phone number. No class is open right now."}
        actions={s ? <Button variant="secondary" href={`${base}/classes/${s.id}`}>Class list</Button> : undefined}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <form onSubmit={submit} className="flex items-center gap-3 rounded-card border border-fg px-4 py-3">
            <ScanLine aria-hidden className="size-5 shrink-0 text-fg-muted" />
            <input
              ref={input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Member card, QR code or phone number"
              placeholder="Scan QR or enter phone / member code"
              autoComplete="off"
              className="min-h-10 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle"
            />
            <Button type="submit" loading={act.busy}>Look up</Button>
          </form>
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          {last ? (
            <section aria-live="polite" className={cn("flex flex-col gap-3 rounded-card border p-5", CARD[doorTone(last.outcome)])}>
              <Dot tone={doorTone(last.outcome) === "positive" ? "positive" : doorTone(last.outcome) === "negative" ? "negative" : "neutral"}>{last.message}</Dot>
              {last.member ? <h2 className="display text-[28px] leading-tight text-fg">{last.member.name ?? last.member.maskedPhone ?? "Member"}</h2> : null}
              <dl className="grid grid-cols-1 gap-3 text-meta sm:grid-cols-3">
                {last.pass ? <div><dt className="text-fg-muted">Pass</dt><dd className="text-body text-fg">{last.pass.label}{last.pass.creditsLeft != null ? `, ${last.pass.creditsLeft} left` : last.pass.renewsOn ? `, renews ${new Date(`${last.pass.renewsOn}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" })}` : ""}</dd></div> : null}
                {last.pointsEarned > 0 ? <div><dt className="text-fg-muted">Reward</dt><dd className="text-body text-fg">+{last.pointsEarned} points{last.balance != null ? `, ${last.balance} in all` : ""}</dd></div> : null}
                {last.visitsThisMonth != null ? <div><dt className="text-fg-muted">This month</dt><dd className="text-body text-fg">{last.visitsThisMonth} visit{last.visitsThisMonth === 1 ? "" : "s"}</dd></div> : null}
                {last.amountDueCents ? <div><dt className="text-fg-muted">Owed</dt><dd className="text-body text-fg">{money(last.amountDueCents)}</dd></div> : null}
              </dl>
            </section>
          ) : null}
          <section className="rounded-card border border-line px-5 py-4">
            <h2 className="text-body-strong text-fg">Other outcomes the desk handles</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-meta text-fg-muted">
              <li>Not booked, class has room: they are added using their pass or membership.</li>
              <li>Not booked, class is full: offer the waitlist or a different class.</li>
              <li>No pass: record a desk sale of a drop-in pack or intro offer, or send them the studio page.</li>
              <li>Membership past due: tell them the amount; they pay from the app.</li>
            </ul>
          </section>
        </div>
        <section aria-label="Arrived" className="flex flex-col gap-2">
          <h2 className="text-body-strong text-fg">Arrived, {s?.booked !== undefined ? `${door.data?.arrivals.length ?? 0} of ${s.booked}` : door.data?.arrivals.length ?? 0}</h2>
          {door.data && door.data.arrivals.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {door.data.arrivals.map((a) => (
                <li key={a.bookingId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-16 text-meta text-fg-muted tabular">{timeLabel(a.at)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-body-strong">{a.name ?? "Member"}</span><span className="block truncate text-meta text-fg-muted">{a.payLabel}</span></span>
                  <Dot tone="positive">In</Dot>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-card border border-line px-4 py-4 text-meta text-fg-muted">Nobody has checked in yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
