"use client";
import { LogOut, ScanLine } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { classesApi } from "@ll/shared";
import { SalePanel } from "@/components/dashboard/classes/SalePanel";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, PageHeader } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/dashboard/calendar";
import { classifyRef, doorTone, timeLabel } from "@/lib/dashboard/classes";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n/client";

export default function DoorPage() {
  const { t } = useLocale();
  return (
    <FeatureGate keys={["booking.classes"]} title={t("counter.cd.title")}>
      <Door />
    </FeatureGate>
  );
}

/** The result is told by the dot and the sentence; the start edge says it at a glance (a thick edge, not a tinted card). */
const CARD = { positive: "border-s-4 border-s-success", neutral: "border-s-4 border-s-border", negative: "border-s-4 border-s-destructive" } as const;

function Door() {
  const { api, base } = useMerchant();
  const { t, date, number } = useLocale();
  const params = useSearchParams();
  const sessionId = params.get("session") ?? undefined;
  const act = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [last, setLast] = useState<classesApi.CheckInResponse | null>(null);
  const door = useApi(() => api.classes.door(sessionId), [api, sessionId], { pollMs: 15_000 });
  const products = useApi(() => api.classes.products(), [api]);
  const [selling, setSelling] = useState(false);
  const [lastRef, setLastRef] = useState<ReturnType<typeof classifyRef>>(null);
  // Drop-in first, then packs and intro offers (a membership is signed up in the app, not paid at the desk).
  const sellable = (products.data?.items ?? []).filter((p) => p.active && p.kind !== "membership").sort((a, b) => Number(b.kind === "drop_in") - Number(a.kind === "drop_in"));
  useEffect(() => input.current?.focus(), [last]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ref = classifyRef(value);
    if (!ref) return act.setError(t("counter.cd.refErr"));
    const r = await act.run(() => api.classes.checkIn({ ...ref, sessionId, idempotencyKey: crypto.randomUUID() }));
    if (r) {
      setLastRef(ref);
      setLast(r);
      setValue("");
      await door.reload();
    }
  }
  /** The desk sold them something: check them in again, now that they have a pass. */
  async function afterSale() {
    if (!lastRef) return;
    const r = await act.run(() => api.classes.checkIn({ ...lastRef, sessionId, idempotencyKey: crypto.randomUUID() }));
    if (r) {
      setLast(r);
      await door.reload();
    }
  }
  const s = door.data?.session;
  return (
    <div className="mx-auto flex min-h-dvh max-w-300 flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        flush
        title={t("counter.cd.title")}
        description={s ? t("counter.cd.descOpen", { time: timeLabel(s.startsAt), name: s.name }) : t("counter.cd.descNone")}
        actions={
          <>
            {s ? <Button variant="secondary" href={`${base}/classes/${s.id}`}>{t("counter.cd.classList")}</Button> : null}
            <Button variant="secondary" href={`${base}/classes`} iconStart={LogOut}>{t("counter.cd.exit")}</Button>
          </>
        }
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <form onSubmit={submit} className="flex min-w-0 items-center gap-3 rounded-xl border border-input bg-background px-4 py-3 focus-within:border-foreground">
            <ScanLine aria-hidden className="size-5 shrink-0 text-fg-muted" />
            <input
              ref={input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t("counter.cd.inputLabel")}
              placeholder={t("counter.cd.placeholder")}
              autoComplete="off"
              className="min-h-12 min-w-0 flex-1 bg-transparent text-headline text-foreground outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="lg" loading={act.busy} className="rounded-xl">{t("counter.cd.lookUp")}</Button>
          </form>
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          {last ? (
            <section aria-live="polite" className={cn("flex flex-col gap-3 rounded-card border border-border bg-card p-5", CARD[doorTone(last.outcome)])}>
              <Dot tone={doorTone(last.outcome) === "positive" ? "positive" : doorTone(last.outcome) === "negative" ? "negative" : "neutral"}>{last.message}</Dot>
              {last.member ? <h2 className="font-display text-h1 text-foreground">{last.member.name ?? last.member.maskedPhone ?? t("counter.member")}</h2> : null}
              <dl className="grid grid-cols-1 gap-3 text-meta sm:grid-cols-3">
                {last.pass ? <div><dt className="text-fg-muted">{t("counter.cd.pass")}</dt><dd className="text-body text-fg">{last.pass.label}{last.pass.creditsLeft != null ? t("counter.cd.credits", { n: last.pass.creditsLeft }) : last.pass.renewsOn ? t("counter.cd.renews", { date: date(`${last.pass.renewsOn}T12:00:00Z`, { month: "short", day: "numeric" }, "UTC") }) : ""}</dd></div> : null}
                {last.pointsEarned > 0 ? <div><dt className="text-fg-muted">{t("counter.cd.reward")}</dt><dd className="text-body text-fg">{t("counter.cd.rewardPoints", { n: last.pointsEarned })}{last.balance != null ? t("counter.cd.rewardAll", { n: last.balance }) : ""}</dd></div> : null}
                {last.visitsThisMonth != null ? <div><dt className="text-fg-muted">{t("counter.cd.thisMonth")}</dt><dd className="text-body text-fg">{t("counter.cd.visits", { n: last.visitsThisMonth })}</dd></div> : null}
                {last.amountDueCents ? <div><dt className="text-fg-muted">{t("counter.cd.owed")}</dt><dd className="text-body text-fg">{money(last.amountDueCents)}</dd></div> : null}
              </dl>
              {last.outcome === "no_pass" && last.member?.memberCode && sellable.length ? (
                <div><Button size="lg" className="rounded-xl" onClick={() => setSelling(true)}>{t("counter.cd.sell")}</Button></div>
              ) : null}
            </section>
          ) : null}
          <details className="rounded-card border border-line px-5 py-3">
            <summary className="cursor-pointer text-body-strong text-fg">{t("counter.cd.means")}</summary>
            <ul className="mt-2 flex flex-col gap-1.5 text-meta text-fg-muted">
              <li>{t("counter.cd.m1")}</li>
              <li>{t("counter.cd.m2")}</li>
              <li>{t("counter.cd.m3")}</li>
              <li>{t("counter.cd.m4")}</li>
            </ul>
          </details>
        </div>
        <section aria-label={t("counter.cd.arrived")} className="flex flex-col gap-2">
          <h2 className="text-body-strong text-fg">{s?.booked !== undefined ? t("counter.cd.arrivedOf", { n: number(door.data?.arrivals.length ?? 0), total: number(s.booked) }) : t("counter.cd.arrivedN", { n: number(door.data?.arrivals.length ?? 0) })}</h2>
          {door.data && door.data.arrivals.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {door.data.arrivals.map((a) => (
                <li key={a.bookingId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-16 text-meta text-fg-muted tabular">{timeLabel(a.at)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-body-strong">{a.name ?? t("counter.member")}</span><span className="block truncate text-meta text-fg-muted">{a.payLabel}</span></span>
                  <Dot tone="positive">{t("counter.cd.in")}</Dot>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-card border border-line px-4 py-4 text-meta text-fg-muted">{t("counter.cd.nobody")}</p>
          )}
        </section>
      </div>
      <SalePanel
        open={selling}
        onClose={() => setSelling(false)}
        packs={sellable}
        who={last?.member?.memberCode ? { memberCode: last.member.memberCode, label: last.member.name ?? last.member.maskedPhone ?? t("counter.cd.thisMember") } : null}
        onSaved={afterSale}
      />
    </div>
  );
}
