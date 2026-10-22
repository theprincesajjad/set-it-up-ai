"use client";
import { BackLink, Dot, PageHeader, Panel, QuietLink, Row, RowList, StatBlock, StatusDot } from "@/components/dashboard/kit";
import { ExternalLink, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

type St = adminApi.AdminMerchant["status"];

export default function AdminMerchantPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const m = useApi(() => browserApi.admin.merchant(merchantId), [merchantId]);
  const audit = useApi(() => browserApi.admin.audit({ merchantId, limit: 20 }), [merchantId]);
  const [to, setTo] = useState<St | null>(null);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin/merchants">Merchants</BackLink>
      <Async state={m}>
        {(d) => (
          <>
            <PageHeader title={d.name} description={<span className="flex flex-wrap items-center gap-3"><StatusDot domain="merchant" status={d.status} /><span>{d.plan[0]!.toUpperCase() + d.plan.slice(1)} plan</span>{d.betaOptIn ? <span>· Beta opt-in</span> : null}</span>} actions={
              <>
                <Button size="sm" iconStart={ExternalLink} href={`/m/${d.id}`}>Open dashboard</Button>
                {/* Done-for-you migration: admins can import members on any plan. */}
                <Button size="sm" variant="secondary" iconStart={Upload} href={`/m/${d.id}/customers/import`}>Import customers</Button>
                {d.status !== "paused" && d.status !== "closed" ? <Button size="sm" variant="secondary" onClick={() => setTo("paused")}>Pause</Button> : null}
                {d.status === "paused" ? <Button size="sm" variant="secondary" onClick={() => setTo("active")}>Resume</Button> : null}
                {d.status !== "closed" ? <Button size="sm" variant="ghost" onClick={() => setTo("closed")}>Close</Button> : null}
              </>
            } />
            <StatBlock
              items={[
                { label: "Members", value: formatNumber(d.members), caption: `${formatNumber(d.activeMembers)} active` },
                { label: "Locations", value: formatNumber(d.locations) },
                { label: "SMS used", value: formatNumber(d.smsCreditsUsed), caption: "This month" },
                { label: "Setup step", value: <span className="text-headline">{d.onboardingStep.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span> },
              ]}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Staff">
                <RowList>{d.staff.map((s) => <Row key={s.userId} title={s.name ?? s.email ?? "User"} meta={s.email ?? undefined} trailing={<span className="text-meta text-fg-muted">{s.role}</span>} />)}</RowList>
                <div className="mt-5 flex items-center justify-between">
                  <h3 className="text-meta-strong text-fg">Feature overrides</h3>
                  <QuietLink href="/admin/rollout">Rollout</QuietLink>
                </div>
                {d.overrides.length ? <ul className="mt-2 divide-y divide-line border-y border-line text-meta">{d.overrides.map((o) => <li key={o.key} className="flex min-h-9 items-center justify-between gap-2"><span className="font-mono text-caption font-normal">{o.key}</span><Dot tone={o.enabled ? "positive" : "neutral"}>{o.enabled ? "On" : "Off"}</Dot></li>)}</ul> : <p className="mt-2 text-meta text-fg-muted">None.</p>}
              </Panel>
              <Panel title="Audit trail">
                <ul className="divide-y divide-line border-y border-line text-meta">{(audit.data?.items ?? []).map((a) => <li key={a.id} className="py-2"><span className="font-mono text-caption font-normal text-fg">{a.action}</span> <span className="text-fg-muted">· {a.actorName ?? "system"} · {formatDateTime(a.createdAt)}</span></li>)}</ul>
              </Panel>
            </div>
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
