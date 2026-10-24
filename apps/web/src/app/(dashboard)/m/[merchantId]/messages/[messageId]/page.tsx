"use client";
import { BackLink, PageHeader, Panel, StatTile, StatusDot } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Send } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function MessagePageGated() {
  return (
    <FeatureGate keys={["marketing.email", "marketing.sms"]} title="Email & SMS campaigns">
      <MessagePage />
    </FeatureGate>
  );
}

function MessagePage() {
  const { messageId } = useParams<{ messageId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.messages.get(messageId), [api, messageId]);
  const act = useAction();
  const test = useAction();
  const [testNote, setTestNote] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/messages`}>Messages</BackLink>
      <Async state={state}>
        {(m) => (
          <>
            <PageHeader title={m.subject ?? `${m.channel.toUpperCase()} message`} description={<span className="flex flex-wrap items-center gap-2"><StatusDot domain="message" status={m.status} />{m.sentAt ? `Sent ${formatDateTime(m.sentAt)}` : m.scheduledAt ? `Scheduled for ${formatDateTime(m.scheduledAt)}` : "Draft"}</span>} actions={
              <>
                {m.status === "draft" ? <Button size="sm" loading={act.busy} onClick={async () => { const r = await act.run(() => api.messages.send(m.id)); if (r) state.setData(r); }}>Send now</Button> : null}
                {m.status === "draft" || m.status === "scheduled" ? <Button size="sm" variant="secondary" onClick={async () => { const r = await act.run(() => api.messages.cancel(m.id)); if (r) state.setData(r); }}>Cancel</Button> : null}
                <Button size="sm" variant="ghost" iconStart={Send} loading={test.busy} onClick={async () => { setTestNote(null); const r = await test.run(() => api.messages.sendTest(m.id)); if (r) setTestNote(`Test sent to ${r.to.join(", ")}. ${r.testsRemainingToday} left today.`); }}>Send test to me</Button>
              </>
            } />
            {testNote ? <p role="status" className="text-meta text-positive-text">{testNote}</p> : null}
            {test.error ? <p className="text-negative">{test.error}</p> : null}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-4">
              <StatTile label="Recipients" value={formatNumber(m.recipientCount)} />
              <StatTile label="Sent" value={formatNumber(m.stats.sent)} />
              <StatTile label="Delivered" value={formatNumber(m.stats.delivered)} />
              <StatTile label="Failed" value={formatNumber(m.stats.failed)} />
            </div>
            <Panel>
              <h2 className="text-body-strong text-fg">What recipients get</h2>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-body text-fg">{m.preview}</pre>
            </Panel>
            {act.error ? <p className="text-negative">{act.error}</p> : null}
          </>
        )}
      </Async>
    </div>
  );
}
