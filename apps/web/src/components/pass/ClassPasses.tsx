"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { classesApi } from "@ll/shared";
import { PaymentBox, pollUntil } from "@/components/pass/PaymentBox";
import { SetupBox } from "@/components/pass/SetupBox";
import { cardLabel } from "@/components/pass/cardLabel";
import { Heading, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { withLang } from "@/lib/i18n/url";

type Membership = classesApi.MyMembershipDto;
type Pass = classesApi.MyPassDto;
type Ask = { kind: "cancel" | "freeze" | "agreement" | "pay" | "card" | "cancelPending" | "payPass"; m: Membership; pass?: Pass; payment?: classesApi.PaymentRefDto; setup?: classesApi.MembershipSetupResponse } | null;

/**
 * /me/classes (Figma M3): every membership, pack and booked class. A membership always shows its price, the next
 * payment, the contract, and, inside the first 10 days, the full-refund right. Cancel is one tap in plain text.
 */
export function ClassPasses() {
  const f = useFmt();
  const { t, money, date, locale } = f;
  const [data, setData] = useState<classesApi.MyClassesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "danger" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await browserApi.me.classes());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    // Fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const day = (d: string | null) => (d ? date(new Date(`${d}T12:00:00Z`), { month: "short", day: "numeric" }, "UTC") : "");
  const when = (iso: string, tz: string) => `${date(iso, { weekday: "short", month: "short", day: "numeric" }, tz)}, ${f.time(iso, tz)}`;
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setBanner(null);
    try {
      await fn();
      await load();
      if (ok) setBanner({ tone: "info", text: ok });
      setAsk(null);
    } catch (e) {
      setBanner({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" onClick={() => void load()}>{t("rc.tryAgain")}</Button>} />;
  if (!data) return <Skeleton className="h-48 w-full rounded-card" />;
  const empty = !data.memberships.length && !data.passes.length && !data.bookings.length;
  if (empty) return <div className="flex flex-col gap-4">{banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}<EmptyState title={t("cl.ui.passes.none")} /></div>;

  return (
    <div className="flex flex-col gap-6">
      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      {data.memberships.map((m) => {
        const live = m.status === "active" || m.status === "frozen" || m.status === "past_due";
        return (
          <section key={m.id} aria-label={m.name} className="flex flex-col gap-3 rounded-card border border-fg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-headline text-fg">{m.name}</h2>
                <p className="text-meta text-fg-muted"><bdi>{m.merchant.name}</bdi></p>
              </div>
              <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-caption text-fg">{t(`cl.ui.m.status.${m.status}` as never)}</span>
            </div>
            <dl className="flex flex-col gap-2 text-meta">
              <div><dt className="text-fg-muted">{t("cl.ui.m.price")}</dt><dd className="text-body text-fg">{t("cl.ui.perMonth", { amount: money(m.totalCents) })}{m.taxCents ? ` (${t("cl.ui.m.withTax")})` : ""}</dd></div>
              {m.nextBillingDate ? <div><dt className="text-fg-muted">{t("cl.ui.m.next")}</dt><dd className="text-body text-fg">{day(m.nextBillingDate)}{m.card ? `, ${cardLabel(m.card as never)}` : ""}</dd></div> : null}
              <div><dt className="text-fg-muted">{t("cl.ui.m.contract")}</dt><dd className="text-body text-fg">{m.termMonths ? t("cl.ui.m.fixed", { n: m.termMonths, date: day(m.termEndsOn) }) : t("cl.ui.m.monthly")}</dd></div>
              {m.classesPerMonth ? <div><dd className="text-body text-fg">{t("cl.ui.m.used", { used: m.usedThisPeriod, n: m.classesPerMonth })}</dd></div> : null}
            </dl>
            {m.status === "past_due" ? <Banner tone="danger" action={<Button size="sm" onClick={async () => { setBusy(true); try { const r = await browserApi.me.payMembership(m.id); if (r.payment) setAsk({ kind: "pay", m, payment: r.payment }); } catch (e) { setBanner({ tone: "danger", text: errorMessage(e) }); } finally { setBusy(false); } }}>{t("cl.ui.m.payNow", { amount: money(m.amountDueCents ?? m.totalCents) })}</Button>}>{t("cl.ui.m.pastDue")}</Banner> : null}
            {m.status === "frozen" && m.frozenUntil ? <p className="rounded-input bg-bg-subtle px-3 py-2 text-meta text-fg">{t("cl.ui.m.frozenUntil", { date: day(m.frozenUntil) })}</p> : null}
            {m.inCoolingOff && m.coolingOffEndsOn ? <p className="rounded-input bg-accent-soft px-3 py-2 text-meta text-accent-text">{t("cl.ui.m.cooling", { date: day(m.coolingOffEndsOn) })}</p> : null}
            {m.cancelEffectiveOn ? <p className="rounded-input bg-bg-subtle px-3 py-2 text-meta text-fg">{t("cl.ui.m.ending", { date: day(new Date(new Date(`${m.cancelEffectiveOn}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)) })}</p> : null}
            {m.renewalNoticeSentAt && m.termEndsOn && !m.declineRenewal && live ? <p className="rounded-input bg-bg-subtle px-3 py-2 text-meta text-fg">{t("cl.ui.m.renewalNotice", { date: day(m.termEndsOn) })}</p> : null}
            {m.status === "pending" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" loading={busy} onClick={async () => { setBusy(true); setBanner(null); try { const r = await browserApi.me.payMembership(m.id); if (r.payment) setAsk({ kind: "pay", m, payment: r.payment }); } catch (e) { setBanner({ tone: "danger", text: errorMessage(e) }); } finally { setBusy(false); } }}>{t("cl.ui.m.finish")}</Button>
                <button type="button" className="min-h-9 px-1 text-meta-strong text-negative focus-visible:focus-ring" onClick={() => setAsk({ kind: "cancelPending", m })}>{t("cl.ui.m.cancelSignup")}</button>
              </div>
            ) : null}
            {live ? (
              <div className="flex flex-wrap gap-2">
                {m.canFreeze ? <Button size="sm" variant="secondary" onClick={() => setAsk({ kind: "freeze", m })}>{t("cl.ui.m.freeze")}</Button> : null}
                <Button size="sm" variant="secondary" loading={busy} onClick={async () => { setBusy(true); try { setAsk({ kind: "card", m, setup: await browserApi.me.membershipCardSetup(m.id) }); } catch (e) { setBanner({ tone: "danger", text: errorMessage(e) }); } finally { setBusy(false); } }}>{t("cl.ui.m.changeCard")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setAsk({ kind: "agreement", m })}>{t("cl.ui.m.agreement")}</Button>
                {m.termEndsOn && m.renewalNoticeSentAt && !m.declineRenewal ? <Button size="sm" variant="ghost" onClick={() => run(() => browserApi.me.declineRenewal(m.id), t("cl.ui.m.declined"))}>{t("cl.ui.m.declineRenewal")}</Button> : null}
                {m.cancelEffectiveOn ? <Button size="sm" variant="secondary" onClick={() => run(() => browserApi.me.keepMembership(m.id))}>{t("cl.ui.m.keep")}</Button> : <button type="button" className="min-h-9 px-1 text-meta-strong text-negative focus-visible:focus-ring" onClick={() => setAsk({ kind: "cancel", m })}>{t("cl.ui.m.cancel")}</button>}
              </div>
            ) : m.status === "pending" ? null : (
              <Button size="sm" variant="ghost" onClick={() => setAsk({ kind: "agreement", m })}>{t("cl.ui.m.agreement")}</Button>
            )}
          </section>
        );
      })}
      {data.passes.map((p) => (
        <section key={p.id} className="flex flex-col gap-2 rounded-card border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-body-strong text-fg">{p.name}</h2>
            {p.status === "pending" ? (
              <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-caption text-fg">{t("cl.ui.passes.waiting")}</span>
            ) : (
              <p className="text-body-strong tabular text-accent-text">{t("cl.ui.passes.left", { left: p.creditsLeft, total: p.creditsTotal })}</p>
            )}
          </div>
          <p className="text-meta text-fg-muted"><bdi>{p.merchant.name}</bdi>{p.status === "pending" ? "" : <>. {t("cl.ui.passes.useBy", { date: date(p.expiresAt, { month: "short", day: "numeric" }) })}</>}</p>
          {p.status === "pending" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" loading={busy} onClick={async () => { setBusy(true); setBanner(null); try { const r = await browserApi.me.payPass(p.id); if (r.payment) setAsk({ kind: "payPass", m: null as never, pass: p, payment: r.payment }); } catch (e) { setBanner({ tone: "danger", text: errorMessage(e) }); } finally { setBusy(false); } }}>{t("cl.ui.m.finish")}</Button>
              <button type="button" className="min-h-9 px-1 text-meta-strong text-negative focus-visible:focus-ring" onClick={() => setAsk({ kind: "cancelPending", m: null as never, pass: p })}>{t("cl.ui.m.cancelSignup")}</button>
            </div>
          ) : null}
        </section>
      ))}
      {data.bookings.length ? (
        <section aria-label={t("cl.ui.passes.booked")} className="flex flex-col gap-2">
          <Heading level={2} plain>{t("cl.ui.passes.booked")}</Heading>
          <ul className="divide-y divide-line rounded-card border border-line">
            {data.bookings.map((b) => (
              <li key={b.id} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="text-meta-strong text-accent-text">{when(b.session.startsAt, b.merchant.timezone)}</span>
                <span className="text-body-strong text-fg">{b.session.name}</span>
                <span className="text-meta text-fg-muted">{b.status === "waitlisted" ? t("cl.ui.onWaitlist", { n: b.waitlistPosition ?? 1 }) : t("cl.ui.freeUntil", { when: when(b.freeCancelUntil, b.merchant.timezone).replace(/\s([ap])\.m\.$/i, (_, x: string) => ` ${x.toUpperCase()}M`) })}</span>
              </li>
            ))}
          </ul>
          <Link href={withLang(`/shops/${encodeURIComponent(data.bookings[0]!.merchant.slug)}/classes`, locale)} className="text-meta-strong text-fg-muted hover:text-fg">{t("cl.ui.seeSchedule")}</Link>
        </section>
      ) : null}

      <Modal open={ask?.kind === "cancel"} onClose={() => setAsk(null)} title={t("cl.ui.m.cancelConfirm")} description={ask?.kind === "cancel" ? (ask.m.inCoolingOff ? t("cl.ui.m.cancelInside") : t("cl.ui.m.cancelAfter", { date: day(ask.m.termEndsOn && ask.m.termEndsOn >= (ask.m.currentPeriodEnd ?? "") ? ask.m.termEndsOn : ask.m.currentPeriodEnd) })) : undefined} actions={<><Button variant="secondary" onClick={() => setAsk(null)}>{t("cl.ui.m.back")}</Button><Button variant="danger" loading={busy} onClick={() => ask && run(async () => { const r = await browserApi.me.cancelMembership(ask.m.id); if (r.refundedCents) setBanner({ tone: "info", text: t("cl.ui.m.refunded", { amount: money(r.refundedCents) }) }); })}>{t("cl.ui.m.cancelGo")}</Button></>} />
      <Modal open={ask?.kind === "cancelPending"} onClose={() => setAsk(null)} title={t("cl.ui.m.cancelSignupTitle")} description={t("cl.ui.m.cancelSignupBody")} actions={<><Button variant="secondary" onClick={() => setAsk(null)}>{t("cl.ui.m.back")}</Button><Button variant="danger" loading={busy} onClick={() => ask && run(async () => { if (ask.pass) await browserApi.me.cancelPass(ask.pass.id); else await browserApi.me.cancelMembership(ask.m.id); }, t("cl.ui.m.signupCancelled"))}>{t("cl.ui.m.cancelSignup")}</Button></>} />
      <Modal open={ask?.kind === "freeze"} onClose={() => setAsk(null)} title={t("cl.ui.m.freezeDays")} actions={<><Button variant="secondary" onClick={() => setAsk(null)}>{t("cl.ui.m.back")}</Button><Button loading={busy} onClick={() => ask && run(() => browserApi.me.freezeMembership(ask.m.id, Number(days)), t("cl.ui.m.freezeDone"))}>{t("cl.ui.m.freezeGo")}</Button></>}>
        <div className="flex gap-2" role="group" aria-label={t("cl.ui.m.freezeDays")}>
          {["7", "14", "30"].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`min-h-11 flex-1 rounded-input border px-3 text-body ${days === d ? "border-fg bg-fg text-bg" : "border-line text-fg"}`}>{t("cl.ui.m.nDays", { n: d })}</button>
          ))}
        </div>
      </Modal>
      <Modal open={ask?.kind === "agreement"} onClose={() => setAsk(null)} variant="sheet" title={ask?.kind === "agreement" ? ask.m.name : ""}>
        {ask?.kind === "agreement" ? <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap font-sans text-meta text-fg" dir="ltr">{ask.m.agreementText}</pre> : null}
      </Modal>
      <Modal open={ask?.kind === "pay"} onClose={() => setAsk(null)} variant="sheet" title={t("cl.ui.m.payTitle")}>
        {ask?.kind === "pay" && ask.payment ? <PaymentBox paymentIntentId={ask.payment.paymentIntentId} clientSecret={ask.payment.clientSecret} amountCents={ask.payment.amountCents} label={t("cl.ui.pay", { amount: money(ask.payment.amountCents) })} onPaid={async () => { await pollUntil(async () => (await browserApi.me.classes()).memberships.some((x) => x.id === ask.m.id && x.status === "active"), { tries: 12, intervalMs: 800 }); await load(); setAsk(null); }} /> : null}
      </Modal>
      <Modal open={ask?.kind === "payPass"} onClose={() => setAsk(null)} variant="sheet" title={t("cl.ui.passes.payTitle")}>
        {ask?.kind === "payPass" && ask.payment && ask.pass ? <PaymentBox paymentIntentId={ask.payment.paymentIntentId} clientSecret={ask.payment.clientSecret} amountCents={ask.payment.amountCents} label={t("cl.ui.pay", { amount: money(ask.payment.amountCents) })} onPaid={async () => { const id = ask.pass!.id; await pollUntil(async () => (await browserApi.me.classes()).passes.some((x) => x.id === id && x.status === "active"), { tries: 12, intervalMs: 800 }); await load(); setAsk(null); }} /> : null}
      </Modal>
      <Modal open={ask?.kind === "card"} onClose={() => setAsk(null)} variant="sheet" title={t("cl.ui.m.changeCard")}>
        {ask?.kind === "card" && ask.setup ? <SetupBox setupIntentId={ask.setup.setupIntentId} clientSecret={ask.setup.clientSecret} label={t("cl.ui.saveCard")} onSaved={async () => { await pollUntil(async () => (await browserApi.me.classes()).memberships.some((x) => x.id === ask.m.id && x.status !== "past_due"), { tries: 8, intervalMs: 700 }); await load(); setAsk(null); setBanner({ tone: "info", text: t("cl.ui.cardSaved") }); }} /> : null}
      </Modal>
    </div>
  );
}
