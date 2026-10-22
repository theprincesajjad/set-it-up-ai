"use client";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { EventPage } from "@/components/dashboard/restaurant/catering/EventPage";
import { EVENT_TYPE_LABEL } from "@/components/dashboard/restaurant/catering/labels";
import { Loader, TierGate, dayLabel } from "@/components/dashboard/restaurant/common";
import { useApi } from "@/lib/dashboard/useApi";
import { formatNumber } from "@/lib/format";

const GATE = { featureKey: "restaurant.catering" as const, title: "Catering", what: "Walima, mehndi and office lunch inquiries with per-head or tray quotes, deposits and tastings." };

export default function CateringEventRoute() {
  return (
    <TierGate {...GATE}>
      <Event />
    </TierGate>
  );
}

function Event() {
  const { eventId } = useParams<{ eventId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.catering.get(eventId), [api, eventId]);
  const e = state.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        back={{ href: `${base}/restaurant/catering`, label: "Catering" }}
        title={e ? `${EVENT_TYPE_LABEL[e.eventType]}${e.customer?.name ? `, ${e.customer.name}` : ""}` : "Catering event"}
        description={e ? `Inquiry #${e.number} · ${dayLabel(e.eventDate)} · ${formatNumber(e.headcount)} guests` : undefined}
      />
      <Loader state={state} gate={GATE} rows={6}>{(ev) => <EventPage event={ev} onChange={(n) => state.setData(n)} />}</Loader>
    </div>
  );
}
