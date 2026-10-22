"use client";
import { BackLink, PageHeader, Panel } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useState } from "react";
import type { messagingApi } from "@ll/shared";
import { FeatureTeaser } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

/** Automations (Plus: marketing.automations). Gated: shows the Coming soon card until enabled. */
/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function AutomationsPageGated() {
  return (
    <FeatureGate keys={["marketing.automations"]} title="Automations">
      <AutomationsPage />
    </FeatureGate>
  );
}

function AutomationsPage() {
  const { api, base, enabled } = useMerchant();
  const state = useApi(enabled("marketing.automations") ? () => api.messages.automations() : null, [api]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/messages`}>Messages</BackLink>
      <PageHeader title="Automations" description="Messages that send themselves, only to customers who opted in." />
      {enabled("marketing.automations") ? <Async state={state}>{(d) => <div className="flex flex-col gap-4">{d.items.map((a) => <AutoCard key={a.kind} a={a} />)}</div>}</Async> : <FeatureTeaser featureKey="marketing.automations" title="Automations" />}
    </div>
  );
}

function AutoCard({ a: initial }: { a: messagingApi.Automation }) {
  const { api } = useMerchant();
  const toast = useToast();
  const [a, setA] = useState(initial);
  const [subject, setSubject] = useState(a.subject ?? "");
  const [body, setBody] = useState(a.body);
  const act = useAction();
  const save = async (enabledNow: boolean) => {
    const r = await act.run(() => api.messages.saveAutomation(a.kind, { enabled: enabledNow, channel: a.channel, subject: subject || null, body, days: a.days ?? undefined }));
    if (r) {
      setA(r);
      toast({ message: "Saved", tone: "success" });
    }
  };
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-body-strong text-fg">{a.label}</h2>
        <Badge>{formatNumber(a.sentCount)} sent</Badge>
      </div>
      <p className="text-meta text-fg-muted">{a.description}</p>
      <Switch label="On" checked={a.enabled} onChange={(v) => save(v)} />
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <TextField type="textarea" label="Message" value={body} onChange={(e) => setBody(e.target.value)} />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Button variant="secondary" className="self-start" loading={act.busy} onClick={() => save(a.enabled)}>
        Save
      </Button>
    </Panel>
  );
}
