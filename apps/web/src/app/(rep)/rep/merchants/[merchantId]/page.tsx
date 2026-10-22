"use client";
import { ArrowLeft, ExternalLink, Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { Async } from "@/components/dashboard/PageStates";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, ListRow } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatTile } from "@/components/ui/StatTile";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatNumber } from "@/lib/format";
import { draftFromProgram, programSentence } from "@/lib/dashboard/program";
import { relativeTime } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

/** Read-mostly merchant summary for the rep (rep-console.md §3). */
export default function RepMerchantPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const api = browserApi.merchant(merchantId);
  const detail = useApi(() => api.detail(), [merchantId]);
  const rm = useApi(() => browserApi.rep.merchants(), []);
  const overview = useApi(() => api.reports.overview(), [merchantId]);
  const team = useApi(() => api.team(), [merchantId]);
  const activity = useApi(() => api.activity({ limit: 10 }), [merchantId]);
  const r = rm.data?.items.find((x) => x.merchantId === merchantId);
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href="/rep/merchants" className="self-start">My merchants</Button>
      <Async state={detail}>
        {(d) => (
          <>
            <PageHeader title={d.merchant.name} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge domain="merchant" status={d.merchant.status} />Signed {formatDate(d.merchant.createdAt)}</span>} actions={
              <>
                <Button variant="secondary" iconStart={Printer} href={`/rep/merchants/${merchantId}/kit`}>QR kit</Button>
                <Button iconStart={ExternalLink} href={`/m/${merchantId}`}>Open as merchant</Button>
              </>
            } />
            {r ? (
              <Card padding="lg">
                <CardHeader title="Activation" subtitle={r.activatedAt ? `Activated ${formatDate(r.activatedAt)}` : `${r.daysSinceSignup} days since signing`} />
                <ProgressBar value={r.activeMembers} max={r.target} label="Members with a visit" valueText={`${r.activeMembers} of ${r.target}`} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.checkIns.map((c) => <Badge key={c.day} tone={c.doneAt ? "success" : c.due ? "warning" : "neutral"}>Day {c.day}: {c.doneAt ? `done ${formatDate(c.doneAt)}` : c.due ? "due" : formatDate(c.dueAt)}</Badge>)}
                </div>
              </Card>
            ) : null}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Members" value={overview.data ? formatNumber(overview.data.current.totalMembers) : null} loading={overview.loading} />
              <StatTile label="Visits (30 days)" value={overview.data ? formatNumber(overview.data.current.visits) : null} loading={overview.loading} />
              <StatTile label="New (30 days)" value={overview.data ? formatNumber(overview.data.current.newMembers) : null} loading={overview.loading} />
              <StatTile label="Redeemed" value={overview.data ? formatNumber(overview.data.current.redemptions) : null} loading={overview.loading} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card padding="lg">
                <CardHeader title="Program" />
                <p className="text-body text-fg">{d.program ? programSentence(draftFromProgram(d.program)) : "Not set up"}</p>
                <CardHeader className="mt-5" title="Staff" />
                <ul className="divide-y divide-line">{(team.data?.items ?? []).map((s) => <li key={s.userId}><ListRow title={s.name ?? s.email ?? "Invited"} subtitle={s.role} trailing={s.hasPin ? <Badge tone="success">PIN set</Badge> : <Badge>No PIN</Badge>} /></li>)}</ul>
              </Card>
              <Card padding="lg">
                <CardHeader title="Last 10 transactions" />
                {activity.data?.items.length ? <ul className="divide-y divide-line">{activity.data.items.map((a) => <li key={a.id}><ListRow title={a.customerName ?? "Member"} subtitle={`${a.type.replace(/_/g, " ")} · ${relativeTime(a.createdAt)}`} trailing={<span className="tabular-nums">{a.points > 0 ? "+" : ""}{a.points}</span>} /></li>)}</ul> : <p className="text-meta text-fg-muted">No activity yet.</p>}
              </Card>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
