"use client";
import { BackLink, PageHeader, Panel } from "@/components/dashboard/kit";
import { Mail, Phone, Store } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { repApi } from "@ll/shared";
import { Async } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatDateTime } from "@/lib/format";
import { boardMeetingSoon, leadLanguageName } from "@/lib/leads";
import { formatE164 } from "@/lib/phone";
import { fromLocalInput, toLocalInput } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const STAGE_LABEL: Record<string, string> = { new: "New", contacted: "Contacted", visit_booked: "Visit booked", signed: "Signed", activated: "Live", lost: "Lost" };

export default function LeadPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const toast = useToast();
  const lead = useApi(() => browserApi.rep.lead(leadId), [leadId]);
  const [kind, setKind] = useState<(typeof repApi.LEAD_ACTIVITY_KINDS)[number]>("call");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [next, setNext] = useState("");
  const act = useAction();
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/rep/leads">Leads</BackLink>
      <Async state={lead}>
        {(l) => (
          <>
            <PageHeader title={l.businessName} description={<span className="flex flex-wrap items-center gap-2"><Badge>{STAGE_LABEL[l.stage]}</Badge>{l.vertical ? verticalLabel(l.vertical) : null}{l.address ? ` · ${l.address}` : ""}</span>} actions={
              l.merchantId ? <Button size="sm" href={`/rep/merchants/${l.merchantId}`} iconStart={Store}>Open merchant</Button> : <Button size="sm" href={`/rep/new?leadId=${l.id}`}>Start setup</Button>
            } />
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex flex-col gap-6">
                <Panel title="Log activity" description="Calls, emails and visits move a new lead to Contacted.">
                  <form className="flex flex-col gap-3" onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act.run(() => browserApi.rep.addActivity(l.id, { kind, outcome: outcome.trim() || undefined, notes: notes.trim() || undefined, nextActionAt: next ? fromLocalInput(next) : undefined }));
                    if (r) {
                      lead.setData(r);
                      setOutcome("");
                      setNotes("");
                      toast({ message: "Logged", tone: "success" });
                    }
                  }}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} options={repApi.LEAD_ACTIVITY_KINDS.map((k) => ({ value: k, label: k[0]!.toUpperCase() + k.slice(1) }))} />
                      <TextField label="Outcome" optionalLabel value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Owner interested, visit Tue" />
                    </div>
                    <TextField type="textarea" label="Notes" optionalLabel value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <TextField type="datetime-local" label="Next action" optionalLabel value={next} onChange={(e) => setNext(e.target.value)} />
                    <Button size="sm" type="submit" loading={act.busy} className="self-start">Log activity</Button>
                  </form>
                </Panel>
                <Panel title="History">
                  {l.activities.length ? (
                    <ol className="flex flex-col gap-3">
                      {l.activities.map((a) => (
                        <li key={a.id} className="border-s-2 border-line ps-3">
                          <p className="text-body-strong text-fg">{a.kind[0]!.toUpperCase() + a.kind.slice(1)}{a.outcome ? `: ${a.outcome}` : ""}</p>
                          {a.notes ? <p className="text-meta text-fg">{a.notes}</p> : null}
                          <p className="text-caption text-fg-muted">{formatDateTime(a.createdAt)}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-meta text-fg-muted">No activity yet.</p>
                  )}
                </Panel>
              </div>
              <Panel className="flex flex-col gap-3" title="Details">
                <Select label="Stage" value={l.stage} onChange={async (e) => {
                  const r = await act.run(() => browserApi.rep.updateLead(l.id, { stage: e.target.value }));
                  if (r) lead.setData(r);
                }} options={repApi.LEAD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s]! }))} />
                <TextField type="datetime-local" label="Next action" value={toLocalInput(l.nextActionAt)} onChange={async (e) => {
                  const r = await act.run(() => browserApi.rep.updateLead(l.id, { nextActionAt: fromLocalInput(e.target.value) }));
                  if (r) lead.setData(r);
                }} />
                {l.contactName ? <p className="text-body text-fg">{l.contactName}</p> : null}
                {l.phone ? <Button variant="secondary" size="sm" iconStart={Phone} href={`tel:${l.phone}`}>{formatE164(l.phone)}</Button> : null}
                {l.email ? <Button variant="ghost" size="sm" iconStart={Mail} href={`mailto:${l.email}`}>{l.email}</Button> : null}
                {l.currentLoyalty ? <p className="text-meta text-fg-muted">Uses today: {l.currentLoyalty}</p> : null}
                {leadLanguageName(l.language) ? <p className="text-meta text-fg">Speaks {leadLanguageName(l.language)}. Call or message in that language.</p> : null}
                {l.contactRole ? <p className="text-meta text-fg-muted">Role: {l.contactRole}</p> : null}
                {l.memberCount ? <p className="text-meta text-fg-muted">BIA members: {l.memberCount}</p> : null}
                {l.eventDate ? <p className="text-meta text-fg-muted">Event: {formatDate(`${l.eventDate}T12:00:00`, true)}</p> : null}
                {l.boardMeetingAt ? (
                  <p className="text-meta text-fg">
                    Next board meeting: {formatDate(`${l.boardMeetingAt}T12:00:00`, true)}
                    {boardMeetingSoon(l) ? <Badge tone="accent" className="ms-2">Within 30 days: the report deadline is close</Badge> : null}
                  </p>
                ) : null}
                {l.notes ? <p className="text-meta text-fg">{l.notes}</p> : null}
              </Panel>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
