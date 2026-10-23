"use client";
import { messagingApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { StatBlock, type StatItem } from "@/components/dashboard/kit";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

/** CASL consent counts, always visible on Messages (merchant-dashboard.md §8): who can be reached, who will not be messaged, texts left. */
export function AudienceHeader() {
  const { api, enabled, detail } = useMerchant();
  const all: messagingApi.Segment = { kind: "all" };
  const sms = enabled("marketing.sms");
  const email = useApi(() => api.messages.audience({ channel: "email", segment: all }), [api]);
  const text = useApi(sms ? () => api.messages.audience({ channel: "sms", segment: all }) : null, [api, sms]);
  const usage = useApi(sms ? () => api.messages.smsUsage() : null, [api, sms]);
  const term = detail.program?.terminology ?? "stamps";
  const items: StatItem[] = [
    ...(sms ? [{ label: "Can text", value: text.data ? formatNumber(text.data.recipients) : "–", delta: text.data ? { good: true, text: "Agreed at the counter or on the pass" } : null }] : []),
    { label: "Can email", value: email.data ? formatNumber(email.data.recipients) : "–" },
    { label: "Not messaged", value: email.data ? formatNumber(email.data.excludedNoConsent + email.data.excludedMuted) : "–", caption: `No consent on file. They still earn ${term}.` },
    ...(sms ? [{ label: "Texts left this month", value: usage.data ? <span className="text-[24px] leading-9">{`${formatNumber(usage.data.remaining)} of ${formatNumber(usage.data.allowance)}`}</span> : "–" }] : []),
  ];
  return (
    <section aria-label="Who can get messages">
      <StatBlock label="Who can get messages" loading={email.loading && !email.data} items={items} />
    </section>
  );
}
