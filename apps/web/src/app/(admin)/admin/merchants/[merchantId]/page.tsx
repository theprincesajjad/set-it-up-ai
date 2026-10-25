"use client";
import { BackLink, Dot, PageHeader, Panel, QuietLink, Row, RowList, StatBlock, StatusDot } from "@/components/dashboard/kit";
import { ExternalLink, Upload } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

type St = adminApi.AdminMerchant["status"];

export default function AdminMerchantPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const m = useApi(() => browserApi.admin.merchant(merchantId), [merchantId]);
  const audit = useApi(() => browserApi.admin.audit({ merchantId, limit: 20 }), [merchantId]);
  const money = useApi(() => browserApi.admin.merchantMoney(merchantId), [merchantId]);
  const router = useRouter();
  const [to, setTo] = useState<St | null>(null);
  const [reason, setReason] = useState("");
  const [support, setSupport] = useState(false);
  const [supportReason, setSupportReason] = useState("");
  const [mode, setMode] = useState<"destination" | "direct" | null>(null);
  const [modeReason, setModeReason] = useState("");
  const [log, setLog] = useState<7 | 30 | null>(null);
  const [outcome, setOutcome] = useState("Reached owner: going well");
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin/merchants">Merchants</BackLink>
      <Async state={m}>
        {(d) => (
          <>
            <PageHeader title={d.name} description={<span className="flex flex-wrap items-center gap-3"><StatusDot domain="merchant" status={d.status} /><span>{d.plan[0]!.toUpperCase() + d.plan.slice(1)} plan</span>{d.betaOptIn ? <span>· Beta opt-in</span> : null}</span>} actions={
              <>
                <Button size="sm" iconStart={ExternalLink} onClick={() => setSupport(true)}>Open as support</Button>
                {/* Done-for-you migration: admins can import members on any plan. */}
                <Button size="sm" variant="secondary" iconStart={Upload} href={`/m/${d.id}/customers/import`}>Import customers</Button>
                {d.status !== "paused" && d.status !== "closed" ? <Button size="sm" variant="secondary" onClick={() => setTo("paused")}>Pause</Button> : null}
                {d.status === "paused" ? <Button size="sm" variant="secondary" onClick={() => setTo("active")}>Resume</Button> : null}
                {d.status !== "closed" ? <Button size="sm" variant="ghost" onClick={() => setTo("closed")}>Close</Button> : null}
              </>
            } />
            <StatBlock
              loading={!money.data}
              items={[
                { label: "Members", value: formatNumber(d.members), caption: `${formatNumber(d.activeMembers)} active · setup: ${d.onboardingStep.replace(/_/g, " ")}` },
                { label: "MRR", value: formatMoney(money.data?.mrrCents ?? 0), caption: money.data?.subscriptionStatus ? `${money.data.subscriptionStatus.replace(/_/g, " ")}${money.data.renewsOn ? ` · renews ${formatDate(`${money.data.renewsOn}T12:00:00`)}` : ""}${money.data.mrrSplit.addOnCents ? ` · incl. ${formatMoney(money.data.mrrSplit.addOnCents)} add-ons` : ""}` : "No paid plan" },
                { label: "Fees, 30 days", value: formatMoney(money.data?.fees30dCents ?? 0), caption: `On ${formatMoney(money.data?.volume30dCents ?? 0)} paid through the app` },
                { label: "Cost this month", value: formatMoney(money.data?.costs.totalCents ?? 0), caption: `${formatNumber(money.data?.costs.smsCredits ?? 0)} texts · ${formatNumber(money.data?.costs.whatsappMessages ?? 0)} WhatsApp · hosting` },
              ]}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Payments set-up" description="Who is merchant of record for card payments. Changes are audited with a reason.">
                <RowList>
                  <Row title="Charge mode" meta={money.data?.chargeMode === "direct" ? "Direct: the shop is merchant of record" : "Destination: the platform is merchant of record"} trailing={money.data?.stripe.connected ? <Button size="sm" variant="secondary" onClick={() => setMode(money.data!.chargeMode === "direct" ? "destination" : "direct")}>Change</Button> : <span className="text-meta text-fg-muted">No Stripe account</span>} />
                  <Row title="Stripe account" meta={money.data?.stripe.connected ? `Charges ${money.data.stripe.chargesEnabled ? "on" : "off"} · payouts ${money.data.stripe.payoutsEnabled ? "on" : "off"}` : "Not connected yet"} />
                </RowList>
              </Panel>
              <Panel title="Follow-up calls" description="Day 7 and day 30 after signing">
                {!d.repUserId ? <p className="text-meta text-fg-muted">Signed up on their own, no rep assigned. These calls are yours.</p> : null}
                <RowList>
                  {([7, 30] as const).map((day) => {
                    const ci = d.checkIns.find((c) => c.day === day)!;
                    return <Row key={day} title={`Day ${day}`} meta={ci.doneAt ? `Done ${formatDate(ci.doneAt)}` : ci.due ? `Due since ${formatDate(ci.dueAt)}` : `Due ${formatDate(ci.dueAt)}`} trailing={ci.doneAt ? undefined : <Button size="sm" variant="secondary" onClick={() => setLog(day)}>Log call</Button>} />;
                  })}
                </RowList>
              </Panel>
              <Panel title="Staff">
                <RowList>{d.staff.map((s) => <Row key={s.userId} title={s.name ?? s.email ?? "User"} meta={s.email ?? undefined} trailing={<span className="text-meta text-fg-muted">{s.role}</span>} />)}</RowList>
                <div className="mt-5 flex items-center justify-between">
                  <h3 className="text-meta-strong text-fg">Feature overrides</h3>
                  <QuietLink href="/admin/rollout">Rollout</QuietLink>
                </div>
                {d.overrides.length ? <ul className="mt-2 divide-y divide-line border-y border-line text-meta">{d.overrides.map((o) => <li key={o.key} className="flex min-h-9 items-center justify-between gap-2"><span className="font-mono text-caption font-normal">{o.key}</span><Dot tone={o.enabled ? "positive" : "neutral"}>{o.enabled ? "On" : "Off"}</Dot></li>)}</ul> : <p className="mt-2 text-meta text-fg-muted">None.</p>}
              </Panel>
              <Panel title="Audit trail">
                <ul className="divide-y divide-line border-y border-line text-meta">{(audit.data?.items ?? []).slice(0, 8).map((a) => <li key={a.id} className="py-2"><span className="font-mono text-caption font-normal text-fg">{a.action}</span> <span className="text-fg-muted">· {a.actorName ?? "system"} · {formatDateTime(a.createdAt)}</span></li>)}</ul>
                <p className="mt-3 text-meta"><Link href="/admin/audit" className="text-fg-muted underline hover:text-fg">Whole audit log</Link></p>
              </Panel>
            </div>
            <ConfirmDialog open={support} onClose={() => { setSupport(false); setSupportReason(""); }} title={`Open ${d.name} as support`} body="You get 30 minutes inside their dashboard. The reason and every change you make are written to the audit log." confirmLabel="Start support session" disabled={supportReason.trim().length < 5} onConfirm={async () => {
              await browserApi.admin.startSupportSession(d.id, supportReason.trim());
              router.push(`/m/${d.id}`);
            }}>
              <TextField label="Reason (audit log)" placeholder="Fix opening hours for the owner" value={supportReason} onChange={(e) => setSupportReason(e.target.value)} />
            </ConfirmDialog>
            <ConfirmDialog open={!!mode} onClose={() => { setMode(null); setModeReason(""); }} title={mode === "direct" ? "Switch to direct charges?" : "Switch back to destination charges?"} body={mode === "direct" ? "The shop becomes merchant of record: it bears Stripe fees, refunds and chargebacks. Saved tiffin payment methods are reset." : "The platform becomes merchant of record again. Saved tiffin payment methods are reset."} confirmLabel="Change charge mode" disabled={modeReason.trim().length < 5} onConfirm={async () => {
              await browserApi.admin.setChargeMode(d.id, { chargeMode: mode!, reason: modeReason.trim() });
              setModeReason("");
              await money.reload();
              await audit.reload();
            }}>
              <TextField label="Reason (audit log)" value={modeReason} onChange={(e) => setModeReason(e.target.value)} />
            </ConfirmDialog>
            <ConfirmDialog open={!!log} onClose={() => setLog(null)} title={`Log day ${log} call`} body={d.name} confirmLabel="Save" onConfirm={async () => {
              await browserApi.rep.checkIn(d.id, { day: log!, outcome, notes: note.trim() || undefined });
              setNote("");
              await m.reload();
              await audit.reload();
            }}>
              <div className="flex flex-col gap-3">
                <Select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={["Reached owner: going well", "Reached owner: needs help", "Left a message", "No answer"].map((o) => ({ value: o, label: o }))} />
                <TextField type="textarea" label="Notes" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </ConfirmDialog>
            <ConfirmDialog open={!!to} onClose={() => { setTo(null); setReason(""); }} title={to === "closed" ? `Close ${d.name}?` : to === "paused" ? `Pause ${d.name}?` : `Resume ${d.name}?`} body={to === "active" ? "Awards and messages work again." : "Paused and closed shops can't award points or send messages. Members keep their balances."} confirmLabel={to === "closed" ? "Close shop" : to === "paused" ? "Pause shop" : "Resume"} danger={to !== "active"} disabled={!reason.trim()} onConfirm={async () => {
              const r = await browserApi.admin.setMerchantStatus(d.id, { status: to!, reason: reason.trim() });
              m.setData(r);
            }}>
              <TextField label="Reason (audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </ConfirmDialog>
          </>
        )}
      </Async>
    </div>
  );
}
