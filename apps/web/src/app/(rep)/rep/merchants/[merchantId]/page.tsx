"use client";
import { BackLink, Dot, PageHeader, Panel, Row, RowList, StatBlock, StatusDot } from "@/components/dashboard/kit";
import { ExternalLink, Printer, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
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
      <BackLink href="/rep/merchants">My merchants</BackLink>
      <Async state={detail}>
        {(d) => (
          <>
            <PageHeader title={d.merchant.name} description={<span className="flex flex-wrap items-center gap-2"><StatusDot domain="merchant" status={d.merchant.status} />Signed {formatDate(d.merchant.createdAt)}</span>} actions={
              <>
                <Button size="sm" variant="secondary" iconStart={Printer} href={`/rep/merchants/${merchantId}/kit`}>QR kit</Button>
                {/* Done-for-you migration: reps can import members on any plan. */}
                <Button size="sm" variant="secondary" iconStart={Upload} href={`/m/${merchantId}/customers/import`}>Import customers</Button>
                <Button size="sm" iconStart={ExternalLink} href={`/m/${merchantId}`}>Open as merchant</Button>
              </>
            } />
            {r ? (
              <Panel title="Activation" description={r.activatedAt ? `Activated ${formatDate(r.activatedAt)}` : `${r.daysSinceSignup} days since signing`}>
                <ProgressBar value={r.activeMembers} max={r.target} label="Members with a visit" valueText={`${r.activeMembers} of ${r.target}`} />
                <div className="mt-3 flex flex-wrap gap-4">
                  {r.checkIns.map((c) => <Dot key={c.day} tone={c.doneAt ? "positive" : c.due ? "accent" : "neutral"}>Day {c.day}: {c.doneAt ? `done ${formatDate(c.doneAt)}` : c.due ? "due" : formatDate(c.dueAt)}</Dot>)}
                </div>
              </Panel>
            ) : null}
            <StatBlock
              loading={overview.loading && !overview.data}
              items={[
                { label: "Members", value: overview.data ? formatNumber(overview.data.current.totalMembers) : "–" },
                { label: "Visits (30 days)", value: overview.data ? formatNumber(overview.data.current.visits) : "–" },
                { label: "New (30 days)", value: overview.data ? formatNumber(overview.data.current.newMembers) : "–" },
                { label: "Redeemed", value: overview.data ? formatNumber(overview.data.current.redemptions) : "–" },
              ]}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Program">
                <p className="text-meta text-fg">{d.program ? programSentence(draftFromProgram(d.program)) : "Not set up"}</p>
                <h3 className="mt-5 text-meta-strong text-fg">Staff</h3>
                <RowList className="mt-2">{(team.data?.items ?? []).map((s) => <Row key={s.userId} title={s.name ?? s.email ?? "Invited"} meta={s.role} trailing={<span className="text-meta text-fg-muted">{s.hasPin ? "PIN set" : "No PIN"}</span>} />)}</RowList>
              </Panel>
              <Panel title="Last 10 transactions">
                {activity.data?.items.length ? <RowList>{activity.data.items.map((a) => <Row key={a.id} title={a.customerName ?? "Member"} meta={`${a.type.replace(/_/g, " ")} · ${relativeTime(a.createdAt)}`} trailing={`${a.points > 0 ? "+" : ""}${a.points}`} />)}</RowList> : <p className="text-meta text-fg-muted">No activity yet.</p>}
              </Panel>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
