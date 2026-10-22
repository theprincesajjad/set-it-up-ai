"use client";
import type { messagingApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { StatBlock } from "@/components/dashboard/kit";
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
      <StatBlock
        label="Who can get messages"
        loading={email.loading && !email.data}
        items={[
          { label: "Can email", value: email.data ? formatNumber(email.data.recipients) : "–" },
          ...(enabled("marketing.sms") ? [{ label: "Can text", value: sms.data ? formatNumber(sms.data.recipients) : "–" }] : []),
          { label: "No consent", value: email.data ? formatNumber(email.data.excludedNoConsent + email.data.excludedMuted) : "–", caption: email.data?.excludedMuted ? `incl. ${formatNumber(email.data.excludedMuted)} muted` : undefined },
        ]}
      />
      <p className="text-meta text-fg-muted">Only customers who said yes get offers. That&apos;s the law (CASL) and it&apos;s good manners.</p>
    </section>
  );
}
