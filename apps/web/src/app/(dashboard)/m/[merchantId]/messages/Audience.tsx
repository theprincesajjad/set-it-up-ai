"use client";
import type { messagingApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { StatTile } from "@/components/ui/StatTile";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

/** CASL consent counts, always visible on Messages (merchant-dashboard.md §8). */
export function AudienceHeader() {
  const { api, enabled } = useMerchant();
  const all: messagingApi.Segment = { kind: "all" };
  const email = useApi(() => api.messages.audience({ channel: "email", segment: all }), [api]);
  const sms = useApi(enabled("marketing.sms") ? () => api.messages.audience({ channel: "sms", segment: all }) : null, [api]);
  return (
    <section aria-label="Who can get messages" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Can email" value={email.data ? formatNumber(email.data.recipients) : null} loading={email.loading} />
        <StatTile label="Can text" value={enabled("marketing.sms") ? (sms.data ? formatNumber(sms.data.recipients) : null) : "–"} loading={sms.loading} caption={enabled("marketing.sms") ? undefined : "SMS is coming soon"} />
        <StatTile label="No consent" value={email.data ? formatNumber(email.data.excludedNoConsent + email.data.excludedMuted) : null} loading={email.loading} caption={email.data?.excludedMuted ? `incl. ${formatNumber(email.data.excludedMuted)} muted` : undefined} />
      </div>
      <p className="text-meta text-fg-muted">Only customers who said yes get offers. That&apos;s the law (CASL) and it&apos;s good manners.</p>
    </section>
  );
}
