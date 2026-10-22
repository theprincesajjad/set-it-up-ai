"use client";
/** Order kind and channel as quiet tags (pre-order, tiffin, catering, WhatsApp, phone). Plain app and pickup orders get none. */
import { Tag } from "@/components/dashboard/kit";

const KIND: Record<string, string> = { preorder: "Pre-order", tiffin: "Tiffin", catering: "Catering", banquet: "Banquet" };
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", phone: "Phone", counter: "Counter" };

export function orderBadgeLabels(kind: string | null | undefined, channel: string | null | undefined): string[] {
  const out: string[] = [];
  if (kind && KIND[kind]) out.push(KIND[kind]!);
  if (channel && CHANNEL[channel]) out.push(CHANNEL[channel]!);
  return out;
}

export function OrderBadges({ kind, channel, className }: { kind?: string | null; channel?: string | null; className?: string }) {
  const labels = orderBadgeLabels(kind, channel);
  if (!labels.length) return null;
  return (
    <span className={className ?? "inline-flex flex-wrap items-center gap-1.5"}>
      {labels.map((l) => (
        <Tag key={l}>{l}</Tag>
      ))}
    </span>
  );
}
