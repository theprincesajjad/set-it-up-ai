"use client";
import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { StatTile } from "@/components/ui/StatTile";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function MessagePage() {
  const { messageId } = useParams<{ messageId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.messages.get(messageId), [api, messageId]);
  const act = useAction();
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/messages`} className="self-start">
        Messages
      </Button>
      <Async state={state}>
        {(m) => (
          <>
            <PageHeader title={m.subject ?? `${m.channel.toUpperCase()} message`} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge domain="message" status={m.status} />{m.sentAt ? `Sent ${formatDateTime(m.sentAt)}` : m.scheduledAt ? `Scheduled for ${formatDateTime(m.scheduledAt)}` : "Draft"}</span>} actions={
              m.status === "draft" || m.status === "scheduled" ? (
                <>
                  {m.status === "draft" ? <Button loading={act.busy} onClick={async () => { const r = await act.run(() => api.messages.send(m.id)); if (r) state.setData(r); }}>Send now</Button> : null}
                  <Button variant="secondary" onClick={async () => { const r = await act.run(() => api.messages.cancel(m.id)); if (r) state.setData(r); }}>Cancel</Button>
                </>
              ) : undefined
            } />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Recipients" value={formatNumber(m.recipientCount)} />
              <StatTile label="Sent" value={formatNumber(m.stats.sent)} />
              <StatTile label="Delivered" value={formatNumber(m.stats.delivered)} />
              <StatTile label="Failed" value={formatNumber(m.stats.failed)} />
            </div>
            <Card padding="lg">
              <h2 className="text-title text-fg">What recipients get</h2>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-body text-fg">{m.preview}</pre>
            </Card>
            {act.error ? <p className="text-danger">{act.error}</p> : null}
          </>
        )}
      </Async>
    </div>
  );
}
