"use client";
import { EmptyState, PageHeader, StatusDot } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Mail, PenLine, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import type { messagingApi } from "@ll/shared";
import { AudienceHeader } from "./Audience";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function MessagesPageGated() {
  return (
    <FeatureGate keys={["marketing.email", "marketing.sms"]} title="Email & SMS campaigns">
      <MessagesPage />
    </FeatureGate>
  );
}

function MessagesPage() {
  const { api, base } = useMerchant();
  const router = useRouter();
  const list = useApi(() => api.messages.list({ limit: 50 }), [api]);
  const cols: Column<messagingApi.Message>[] = [
    { key: "subject", header: "Message", mobile: "title", cell: (m) => <span className="font-medium">{m.subject ?? m.body.slice(0, 60)}</span> },
    { key: "channel", header: "Channel", mobile: "subtitle", cell: (m) => m.channel[0]!.toUpperCase() + m.channel.slice(1) },
    { key: "status", header: "Status", mobile: "trailing", cell: (m) => <StatusDot domain="message" status={m.status} /> },
    { key: "when", header: "Sent / scheduled", mobile: "subtitle", sortValue: (m) => m.sentAt ?? m.scheduledAt ?? m.createdAt, cell: (m) => formatDateTime(m.sentAt ?? m.scheduledAt ?? m.createdAt) },
    { key: "count", header: "Audience", align: "end", mobile: "hidden", cell: (m) => formatNumber(m.recipientCount) },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Messages" description="Email your regulars. The legally required footer and unsubscribe link are added for you." actions={<><Button size="sm" variant="secondary" iconStart={Workflow} href={`${base}/messages/automations`}>Automations</Button><Button size="sm" iconStart={PenLine} href={`${base}/messages/new`}>Write an email</Button></>} />
      <AudienceHeader />
      <DataTable caption="Messages" columns={cols} rows={list.data?.items ?? []} rowKey={(m) => m.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(m) => router.push(`${base}/messages/${m.id}`)} empty={<EmptyState icon={Mail} title="Say hello to your regulars" description="Customers who said yes to hearing from you will get it." action={<Button variant="secondary" size="sm" href={`${base}/messages/new`}>Write an email</Button>} />} />
    </div>
  );
}
