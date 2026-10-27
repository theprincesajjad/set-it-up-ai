"use client";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { classesApi } from "@ll/shared";
import { PaymentBox, pollUntil } from "@/components/pass/PaymentBox";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Heading, ShopHead, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { browserApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { withLang } from "@/lib/i18n/url";
import { addDays, dayDate, todayIso, torontoDay } from "@/lib/restaurant/util";

type Data = classesApi.PublicClassesResponse;
type Sess = classesApi.ClassSessionDto;
type Product = classesApi.ProductDto;
type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };
type Flow =
  | { kind: "book"; session: Sess }
  | { kind: "pay-drop-in"; session: Sess; payment: classesApi.PaymentRefDto }
  | { kind: "buy"; product: Product; payment: classesApi.PaymentRefDto | null }
  | { kind: "join"; product: Product; agreement: classesApi.AgreementDto; payment: classesApi.PaymentRefDto | null; accepted: boolean }
  | { kind: "done"; text: string };

const DAYS = 14;

/**
 * /shops/<slug>/classes (Figma M1 to M4): the schedule by day with spots left, a waitlist for full classes, a booking
 * sheet that says what pays for the class and the cancellation rule before the tap, packs and memberships with the
 * Ontario agreement shown before the card, and the women-only note on every class that has it.
 */
export function ClassSchedule({ shop, data: initial, signedIn, devAutofill }: { shop: Shop; data: Data; signedIn: boolean; devAutofill?: boolean }) {
  const f = useFmt();
  const { t, money, date, time, locale } = f;
  const [data, setData] = useState<Data>(initial);
  const [my, setMy] = useState<classesApi.MyClassesResponse | null>(null);
  const [day, setDay] = useState<string>(() => {
    const first = initial.sessions[0];
    return first ? torontoDay(first.startsAt) : todayIso();
  });
  const [flow, setFlow] = useState<Flow | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wantsSignIn, setWantsSignIn] = useState(false);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(todayIso(), i)), []);

  const refresh = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([browserApi.public.studioClasses(shop.slug), signedIn ? browserApi.me.classes(data.shop.id) : Promise.resolve(null)]);
      setData(d);
      setMy(m);
    } catch {
      // keep what is on screen
    }
  }, [shop.slug, signedIn, data.shop.id]);
  useEffect(() => {
    // Signed-in viewers get their own booking state; the first paint is the public list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const byDay = useMemo(() => {
    const m = new Map<string, Sess[]>();
    for (const s of data.sessions) m.set(torontoDay(s.startsAt), [...(m.get(torontoDay(s.startsAt)) ?? []), s]);
    return m;
  }, [data.sessions]);
  const when = (iso: string) => `${date(iso, { weekday: "short", month: "short", day: "numeric" }, data.shop.timezone)}, ${time(iso, data.shop.timezone)}`;
  const dropIn = data.products.find((p) => p.kind === "drop_in");
  const activeMembership = my?.memberships.find((m) => m.status === "active");
  const passes = (my?.passes ?? []).filter((p) => p.status === "active" && p.creditsLeft > 0);
  const payLine = (s: Sess): string => {
    if (activeMembership) return activeMembership.name;
    if (passes[0]) return `${passes[0].name}, ${t("cl.ui.passes.left", { left: passes[0].creditsLeft, total: passes[0].creditsTotal })}`;
    if (dropIn) return `${t("cl.ui.dropIn")}, ${money(dropIn.priceCents)}`;
    void s;
    return t("cl.ui.noPass");
  };
  // "8:00 a.m." at the end of a sentence reads "a.m..": say "8:00 AM" where a full stop follows.
  const untilText = (s: Sess) => when(new Date(new Date(s.startsAt).getTime() - data.policy.cancelWindowHours * 3_600_000).toISOString()).replace(/\s([ap])\.m\.$/i, (_, x: string) => ` ${x.toUpperCase()}M`);

  async function book(s: Sess, use: "auto" | "drop_in") {
    if (!signedIn) return setWantsSignIn(true);
    setBusy(true);
    setBanner(null);
    try {
      const r = await browserApi.me.bookClass({ sessionId: s.id, use });
      if (r.outcome === "needs_payment" && r.payment) return setFlow({ kind: "pay-drop-in", session: s, payment: r.payment });
      await refresh();
      setFlow({ kind: "done", text: r.outcome === "waitlisted" ? t("cl.ui.done.waitlisted", { n: r.booking.waitlistPosition ?? 1 }) : t("cl.ui.done.booked") });
    } catch (e) {
      const code = isApiError(e) ? e.code : undefined;
      if (code === "no_pass" && dropIn && use === "auto") return setBanner(t("cl.ui.err.noPass"));
      setBanner(code === "membership_past_due" ? t("cl.ui.err.pastDue") : code === "membership_frozen" ? t("cl.ui.err.frozen") : code === "month_used" ? t("cl.ui.err.monthUsed") : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel(bookingId: string) {
    setBusy(true);
    try {
      const r = await browserApi.me.cancelClassBooking(bookingId);
      await refresh();
      setFlow({
        kind: "done",
        text: r.late ? t("cl.ui.done.cancelledLate", { hours: data.policy.cancelWindowHours }) + (r.feeChargedCents ? ` ${t("cl.ui.done.fee", { fee: money(r.feeChargedCents) })}` : "") : t("cl.ui.done.cancelled"),
      });
    } catch (e) {
      setBanner(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function startBuy(p: Product) {
    if (!signedIn) return setWantsSignIn(true);
    setBusy(true);
    setBanner(null);
    try {
      if (p.kind === "membership") {
        const agreement = await browserApi.me.membershipAgreement(p.id);
        setFlow({ kind: "join", product: p, agreement, payment: null, accepted: false });
      } else {
        const r = await browserApi.me.buyPack(p.id);
        if (r.payment) setFlow({ kind: "buy", product: p, payment: r.payment });
        else {
          await refresh();
          setFlow({ kind: "done", text: t("cl.ui.done.pack") });
        }
      }
    } catch (e) {
      setBanner(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function join(fl: Extract<Flow, { kind: "join" }>) {
    setBusy(true);
    setBanner(null);
    try {
      const r = await browserApi.me.joinMembership({ productId: fl.product.id, agreementHash: fl.agreement.hash });
      setFlow({ ...fl, payment: r.payment });
    } catch (e) {
      const code = isApiError(e) ? e.code : undefined;
      setBanner(code === "agreement_changed" ? t("cl.ui.agree.changed") : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function afterPay(text: string, check: () => Promise<boolean>) {
    const ok = await pollUntil(check, { tries: 12, intervalMs: 800 });
    await refresh();
    setFlow({ kind: "done", text: ok ? text : t("cl.ui.done.processing") });
  }

  const pass = (
    <div className="flex items-center justify-between gap-3 rounded-input bg-bg-subtle px-4 py-3">
      <div className="min-w-0">
        <p className="text-caption text-fg-muted">{t("cl.ui.yourPass")}</p>
        <p className="truncate text-body-strong text-fg">{activeMembership ? activeMembership.name : passes[0] ? `${passes[0].name}, ${t("cl.ui.passes.left", { left: passes[0].creditsLeft, total: passes[0].creditsTotal })}` : t("cl.ui.noPass")}</p>
      </div>
      <Link href={withLang("/me/classes", locale)} className="text-meta-strong text-fg-muted hover:text-fg focus-visible:focus-ring">{t("cl.ui.manage")}</Link>
    </div>
  );

  const offers = data.products;
  return (
    <div className="flex flex-col gap-6">
      <ShopHead shop={data.shop} kicker={data.shop.address ?? undefined} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <div className="flex flex-col gap-1">
        <Heading>{t("cl.ui.title")}</Heading>
        {data.hasWomenOnly ? <p className="text-meta text-fg-muted">{t("cl.ui.womenOnlyNote")}</p> : null}
      </div>
      {signedIn ? pass : null}
      {banner && !flow ? <Banner tone="danger">{banner}</Banner> : null}
      <div role="group" aria-label={t("cl.ui.title")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const n = byDay.get(d)?.length ?? 0;
          const on = d === day;
          return (
            <button key={d} type="button" aria-pressed={on} onClick={() => setDay(d)} className={cn("flex h-[72px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-card border focus-visible:focus-ring", on ? "border-fg bg-fg text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle", !on && n === 0 && "text-fg-subtle")}>
              <span className="text-caption">{date(dayDate(d), { weekday: "short" }, "UTC")}</span>
              <span className="text-title tabular-nums">{date(dayDate(d), { day: "numeric" }, "UTC")}</span>
            </button>
          );
        })}
      </div>
      <section aria-label={t("cl.ui.title")} className="flex flex-col gap-3">
        {(byDay.get(day) ?? []).length === 0 ? <p className="rounded-card border border-line px-4 py-6 text-body text-fg-muted">{t("cl.ui.noClasses")}</p> : null}
        {(byDay.get(day) ?? []).map((s) => {
          const full = s.booked >= s.capacity;
          const m = s.mine;
          const left = s.capacity - s.booked;
          return (
            <article key={s.id} className="flex flex-col gap-2 rounded-card border border-line p-4">
              <div className="flex items-center gap-2">
                <span className="text-meta-strong tabular text-accent-text">{time(s.startsAt, data.shop.timezone)}</span>
                {s.womenOnly ? <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-caption text-fg-muted">{t("cl.ui.womenOnly")}</span> : null}
              </div>
              <h3 className="text-headline text-fg">{s.name}</h3>
              {s.instructorName ? <p className="text-meta text-fg-muted">{t("cl.ui.withInstructor", { name: s.instructorName })}</p> : null}
              <div className="flex items-center justify-between gap-3">
                <p className={cn("text-meta-strong", m?.status === "booked" || m?.status === "attended" ? "text-positive-text" : "text-fg")}>
                  {m?.status === "booked" || m?.status === "attended" ? t("cl.ui.booked") : m?.status === "waitlisted" ? t("cl.ui.onWaitlist", { n: m.waitlistPosition ?? 1 }) : m?.status === "held" ? t("cl.ui.holding") : full ? (s.waitlisted ? t("cl.ui.fullWaitlist", { n: s.waitlisted }) : t("cl.ui.full")) : t("cl.ui.spotsLeft", { n: left })}
                </p>
                {m && (m.status === "booked" || m.status === "waitlisted") ? (
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => cancel(m.bookingId)}>{m.status === "waitlisted" ? t("cl.ui.leaveWaitlist") : t("cl.ui.cancel")}</Button>
                ) : !m ? (
                  <Button size="sm" variant={full ? "secondary" : "primary"} onClick={() => { setBanner(null); setFlow({ kind: "book", session: s }); }}>{full ? t("cl.ui.joinWaitlist") : t("cl.ui.book")}</Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
      {offers.length ? (
        <section aria-label={t("cl.ui.offers")} className="flex flex-col gap-3">
          <Heading level={2} plain>{t("cl.ui.offers")}</Heading>
          <ul className="divide-y divide-line rounded-card border border-line">
            {offers.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-fg">{p.name}</p>
                  <p className="text-meta text-fg-muted">{rule(p, t)}</p>
                </div>
                <div className="text-end">
                  <p className="text-body-strong tabular">{p.kind === "membership" ? t("cl.ui.perMonth", { amount: money(p.priceCents) }) : money(p.priceCents)}</p>
                  {data.tax.applies ? <p className="text-caption text-fg-muted">{t("cl.ui.plusTax", { tax: data.tax.name })}</p> : null}
                </div>
                {p.kind !== "drop_in" ? <Button size="sm" variant="secondary" loading={busy} onClick={() => startBuy(p)}>{p.kind === "membership" ? t("cl.ui.join") : t("cl.ui.buy")}</Button> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* sign in */}
      <Modal open={wantsSignIn && !signedIn} onClose={() => setWantsSignIn(false)} variant="sheet" title={t("cl.ui.signIn")}>
        <PhoneSignIn heading="h2" devAutofill={devAutofill} title={t("cl.ui.signIn")} />
      </Modal>

      {/* book sheet */}
      <Modal open={flow?.kind === "book"} onClose={() => setFlow(null)} variant="sheet" title={flow?.kind === "book" ? flow.session.name : ""}>
        {flow?.kind === "book" ? (
          <div className="flex flex-col gap-4">
            <p className="text-meta text-fg-muted">{when(flow.session.startsAt)}{flow.session.instructorName ? `, ${flow.session.instructorName}` : ""}</p>
            {flow.session.womenOnly ? (
              <div className="rounded-input bg-bg-subtle px-4 py-3">
                <p className="text-meta-strong text-fg">{t("cl.ui.womenOnly")}</p>
                <p className="text-meta text-fg-muted">{t("cl.ui.womenOnlyDetail")}</p>
              </div>
            ) : null}
            {banner ? <Banner tone="danger">{banner}</Banner> : null}
            {flow.session.booked >= flow.session.capacity ? (
              <p className="text-meta text-fg-muted">{t("cl.ui.waitlistRule")}</p>
            ) : (
              <div className="rounded-card border border-line px-4 py-3">
                <p className="text-caption text-fg-muted">{t("cl.ui.willUse")}</p>
                <p className="text-body-strong text-fg">{payLine(flow.session)}</p>
              </div>
            )}
            <p className="text-meta text-fg-muted">{t("cl.ui.cancelRule", { until: untilText(flow.session) })}{data.policy.lateFeeCents ? ` ${t("cl.ui.cancelFee", { fee: money(data.policy.lateFeeCents) })}` : ""}</p>
            {data.policy.termsNote ? <p dir="auto" className="text-meta text-fg-muted">{data.policy.termsNote}</p> : null}
            <div className="flex flex-col gap-2">
              <Button size="lg" fullWidth loading={busy} onClick={() => book(flow.session, "auto")}>{flow.session.booked >= flow.session.capacity ? t("cl.ui.joinWaitlist") : t("cl.ui.bookClass")}</Button>
              {dropIn && flow.session.booked < flow.session.capacity && !activeMembership && !passes.length ? <Button size="lg" fullWidth variant="secondary" loading={busy} onClick={() => book(flow.session, "drop_in")}>{t("cl.ui.payDropIn", { amount: money(dropIn.priceCents) })}</Button> : null}
              {!signedIn ? <p className="text-center text-meta text-fg-muted">{t("cl.ui.signInToBook")}</p> : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* drop-in payment */}
      <Modal open={flow?.kind === "pay-drop-in"} onClose={() => setFlow(null)} variant="sheet" title={t("cl.ui.dropIn")}>
        {flow?.kind === "pay-drop-in" ? (
          <div className="flex flex-col gap-4">
            <p className="text-meta text-fg-muted">{flow.session.name}, {when(flow.session.startsAt)}. {t("cl.ui.holdNote")}</p>
            <PaymentBox paymentIntentId={flow.payment.paymentIntentId} clientSecret={flow.payment.clientSecret} amountCents={flow.payment.amountCents} label={t("cl.ui.payDropIn", { amount: money(flow.payment.amountCents) })} onPaid={() => afterPay(t("cl.ui.done.booked"), async () => (await browserApi.me.classes(data.shop.id)).bookings.some((b) => b.session.id === flow.session.id && b.status === "booked"))} />
          </div>
        ) : null}
      </Modal>

      {/* pack payment */}
      <Modal open={flow?.kind === "buy"} onClose={() => setFlow(null)} variant="sheet" title={flow?.kind === "buy" ? flow.product.name : ""}>
        {flow?.kind === "buy" && flow.payment ? (
          <div className="flex flex-col gap-4">
            <p className="text-meta text-fg-muted">{rule(flow.product, t)}</p>
            <PaymentBox paymentIntentId={flow.payment.paymentIntentId} clientSecret={flow.payment.clientSecret} amountCents={flow.payment.amountCents} label={t("cl.ui.pay", { amount: money(flow.payment.amountCents) })} onPaid={() => afterPay(t("cl.ui.done.pack"), async () => (await browserApi.me.classes(data.shop.id)).passes.some((p) => p.status === "active" && p.name === flow.product.name))} />
          </div>
        ) : null}
      </Modal>

      {/* membership agreement */}
      <Modal open={flow?.kind === "join"} onClose={() => setFlow(null)} variant="sheet" title={flow?.kind === "join" ? flow.product.name : ""}>
        {flow?.kind === "join" ? (
          <div className="flex flex-col gap-4">
            <h3 className="text-headline text-fg">{t("cl.ui.agree.title")}</h3>
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-card border border-line p-4 font-sans text-meta text-fg" dir="ltr">{flow.agreement.text}</pre>
            {banner ? <Banner tone="danger">{banner}</Banner> : null}
            {flow.payment ? (
              <PaymentBox paymentIntentId={flow.payment.paymentIntentId} clientSecret={flow.payment.clientSecret} amountCents={flow.payment.amountCents} label={t("cl.ui.agree.pay", { amount: money(flow.payment.amountCents) })} onPaid={() => afterPay(t("cl.ui.done.member"), async () => (await browserApi.me.classes(data.shop.id)).memberships.some((m) => m.status === "active"))} />
            ) : (
              <>
                <label className="flex items-start gap-3 text-meta text-fg">
                  <input type="checkbox" className="mt-0.5 size-5" checked={flow.accepted} onChange={(e) => setFlow({ ...flow, accepted: e.target.checked })} />
                  <span>{t("cl.ui.agree.check")}</span>
                </label>
                <Button size="lg" fullWidth loading={busy} disabled={!flow.accepted} onClick={() => join(flow)}>{t("cl.ui.agree.pay", { amount: money(flow.agreement.totalPerPeriodCents) })}</Button>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      {/* done */}
      <Modal open={flow?.kind === "done"} onClose={() => setFlow(null)} variant="sheet" title={t("cl.ui.title")}>
        {flow?.kind === "done" ? (
          <div className="flex flex-col items-start gap-4">
            <CircleCheck aria-hidden className="size-8 text-positive" strokeWidth={1.75} />
            <p className="text-body text-fg">{flow.text}</p>
            <Button size="lg" fullWidth onClick={() => setFlow(null)}>{t("cl.ui.ok")}</Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function rule(p: Product, t: ReturnType<typeof useFmt>["t"]): string {
  if (p.kind === "drop_in") return t("cl.ui.rule.dropIn");
  if (p.kind === "pack") return `${t("cl.ui.rule.pack", { n: p.credits ?? 1, days: p.validDays ?? 90 })}${p.introOnly ? `. ${t("cl.ui.intro")}` : ""}`;
  return `${p.classesPerMonth ? t("cl.ui.nClassesMonth", { n: p.classesPerMonth }) : t("cl.ui.unlimited")}. ${p.termMonths ? t("cl.ui.termMonths", { n: p.termMonths }) : t("cl.ui.monthToMonth")}`;
}
