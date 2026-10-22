"use client";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Async } from "@/components/dashboard/PageStates";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, ListRow } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { StatTile } from "@/components/ui/StatTile";
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
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href="/admin/merchants" className="self-start">Merchants</Button>
      <Async state={m}>
        {(d) => (
          <>
            <PageHeader title={d.name} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge domain="merchant" status={d.status} /><Badge>{d.plan}</Badge>{d.betaOptIn ? <Badge tone="info">Beta opt-in</Badge> : null}</span>} actions={
              <>
                <Button iconStart={ExternalLink} href={`/m/${d.id}`}>Open dashboard</Button>
                {d.status !== "paused" && d.status !== "closed" ? <Button variant="secondary" onClick={() => setTo("paused")}>Pause</Button> : null}
                {d.status === "paused" ? <Button variant="secondary" onClick={() => setTo("active")}>Resume</Button> : null}
                {d.status !== "closed" ? <Button variant="ghost" onClick={() => setTo("closed")}>Close</Button> : null}
              </>
            } />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Members" value={formatNumber(d.members)} caption={`${formatNumber(d.activeMembers)} active`} />
              <StatTile label="Locations" value={formatNumber(d.locations)} />
              <StatTile label="SMS used" value={formatNumber(d.smsCreditsUsed)} caption="This month" />
              <StatTile label="Setup step" value={d.onboardingStep.replace(/_/g, " ")} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card padding="lg">
                <CardHeader title="Staff" />
                <ul className="divide-y divide-border">{d.staff.map((s) => <li key={s.userId}><ListRow title={s.name ?? s.email ?? "User"} subtitle={s.email ?? undefined} trailing={<Badge>{s.role}</Badge>} /></li>)}</ul>
                <CardHeader className="mt-5" title="Feature overrides" action={<Button variant="ghost" size="sm" href="/admin/rollout">Rollout</Button>} />
                {d.overrides.length ? <ul className="flex flex-col gap-1 text-body-sm">{d.overrides.map((o) => <li key={o.key} className="flex justify-between gap-2"><span className="font-mono">{o.key}</span><Badge tone={o.enabled ? "success" : "neutral"}>{o.enabled ? "on" : "off"}</Badge></li>)}</ul> : <p className="text-body-sm text-fg-muted">None.</p>}
              </Card>
              <Card padding="lg">
                <CardHeader title="Audit trail" />
                <ul className="flex flex-col gap-2 text-body-sm">{(audit.data?.items ?? []).map((a) => <li key={a.id}><span className="font-mono text-fg">{a.action}</span> <span className="text-fg-muted">· {a.actorName ?? "system"} · {formatDateTime(a.createdAt)}</span></li>)}</ul>
              </Card>
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
