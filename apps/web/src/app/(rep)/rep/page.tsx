"use client";
import { Navigation, Phone, PlusCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { repApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, ListRow } from "@/components/ui/Card";
import { DensityGauge } from "@/components/ui/DensityGauge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { formatTime } from "@/lib/format";
import { longDate } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

const LEAD_STAGE_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "brand"> = { new: "neutral", contacted: "info", visit_booked: "warning", signed: "brand", activated: "success", lost: "neutral" };
const OUTCOMES = ["Reached owner: going well", "Reached owner: needs help", "Left a message", "No answer", "Visited in person"];

export default function RepToday() {
  const toast = useToast();
  const leads = useApi(() => browserApi.rep.leads({ due: "true", limit: 50 }), []);
  const merchants = useApi(() => browserApi.rep.merchants(), []);
  const hoods = useNeighbourhoods();
  const [log, setLog] = useState<{ m: repApi.RepMerchant; day: 7 | 30 } | null>(null);
  const [outcome, setOutcome] = useState(OUTCOMES[0]!);
  const [note, setNote] = useState("");
  const due = (merchants.data?.items ?? []).flatMap((m) => m.checkIns.filter((c) => c.due).map((c) => ({ m, c })));
  const mainHood = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of merchants.data?.items ?? []) if (m.neighbourhoodId) counts.set(m.neighbourhoodId, (counts.get(m.neighbourhoodId) ?? 0) + 1);
    const id = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return hoods?.find((h) => h.id === id) ?? hoods?.[0] ?? null;
  }, [merchants.data, hoods]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={mainHood ? `Today on ${mainHood.name}` : "Today"} description={longDate()} actions={<Button iconStart={PlusCircle} href="/rep/new">Set up a merchant</Button>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="lg">
            <CardHeader title="Visits and follow-ups planned" subtitle="Leads whose next step is due" action={<Button variant="ghost" size="sm" href="/rep/leads">Pipeline</Button>} />
            {leads.loading && !leads.data ? (
              <Skeleton className="h-24" />
            ) : leads.data?.items.length ? (
              <ul className="divide-y divide-border">
                {leads.data.items.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/rep/leads/${l.id}`} className="text-body-strong text-fg hover:underline">{l.businessName}</Link>
                      <p className="text-body-sm text-fg-muted">{l.nextActionAt ? formatTime(l.nextActionAt) : ""} {l.address ? `· ${l.address}` : ""}</p>
                    </div>
                    <Badge tone={LEAD_STAGE_TONE[l.stage]}>{l.stage.replace("_", " ")}</Badge>
                    {l.address ? <Button size="sm" variant="ghost" iconStart={Navigation} href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`}>Navigate</Button> : null}
                    <Button size="sm" variant="secondary" href={`/rep/new?leadId=${l.id}`}>Start setup</Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-fg-muted">Nothing due. Add prospects from the pipeline.</p>
            )}
          </Card>
          <Card padding="lg">
            <CardHeader title="Check-ins due" subtitle="Day 7 and day 30 calls from the playbook" />
            {merchants.loading && !merchants.data ? (
              <Skeleton className="h-24" />
            ) : due.length ? (
              <ul className="divide-y divide-border">
                {due.map(({ m, c }) => (
                  <li key={`${m.merchantId}-${c.day}`} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <ListRow title={<Link href={`/rep/merchants/${m.merchantId}`} className="hover:underline">{m.name}</Link>} subtitle={`Day ${c.day} check-in · ${m.daysSinceSignup} days since signing`} />
                      <ProgressBar value={m.activeMembers} max={m.target} valueText={`${m.activeMembers} / ${m.target}`} className="max-w-60" />
                    </div>
                    <Button size="sm" variant="secondary" iconStart={Phone} onClick={() => setLog({ m, day: c.day })}>Log call</Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="All caught up" description="No check-ins due today." className="py-4" />
            )}
          </Card>
        </div>
        {mainHood ? <DensityGauge label={`${mainHood.name} density`} value={mainHood.shopCount} target={40} unit="shops" /> : <Skeleton className="h-48 rounded-lg" />}
      </div>
      <ConfirmDialog open={!!log} onClose={() => setLog(null)} title={`Log day ${log?.day} call`} body={log?.m.name} confirmLabel="Save" onConfirm={async () => {
        await browserApi.rep.checkIn(log!.m.merchantId, { day: log!.day, outcome, notes: note.trim() || undefined });
        setNote("");
        toast({ message: "Check-in logged", tone: "success" });
        await merchants.reload();
      }}>
        <div className="flex flex-col gap-3">
          <Select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={OUTCOMES.map((o) => ({ value: o, label: o }))} />
          <TextField type="textarea" label="Notes" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
