import { Info, Sprout, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-neutral-subtle text-on-neutral-subtle",
  brand: "bg-brand-subtle text-on-brand-subtle",
  accent: "bg-accent-subtle text-on-accent-subtle",
  success: "bg-success-subtle text-on-success-subtle",
  warning: "bg-warning-subtle text-on-warning-subtle",
  danger: "bg-danger-subtle text-on-danger-subtle",
  info: "bg-info-subtle text-on-info-subtle",
};

/** Non-interactive status label: always text, never colour alone. */
export function Badge({ tone = "neutral", icon: Icon, iconEnd: IconEnd, dot, children, className }: { tone?: BadgeTone; icon?: LucideIcon; iconEnd?: LucideIcon; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-caption font-semibold", tones[tone], className)}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
      {children}
      {IconEnd ? <IconEnd aria-hidden className="size-3" /> : null}
    </span>
  );
}

export function ComingSoonBadge({ label = "Coming soon" }: { label?: string }) {
  return (
    <Badge tone="neutral" icon={Sprout}>
      {label}
    </Badge>
  );
}

export function SponsoredBadge() {
  return (
    <Badge tone="neutral" iconEnd={Info}>
      Sponsored
    </Badge>
  );
}

/** Domain status → tone mapping (system.md §4 Badge). */
const STATUS_TONES: Record<string, Record<string, BadgeTone>> = {
  promo: { draft: "neutral", scheduled: "info", live: "success", ended: "neutral", archived: "neutral" },
  message: { draft: "neutral", scheduled: "info", sending: "info", sent: "success", failed: "danger", cancelled: "neutral" },
  order: { pending: "warning", accepted: "info", preparing: "info", ready: "success", picked_up: "neutral", cancelled: "neutral", refunded: "neutral" },
  ticket: { intake: "info", diagnosing: "info", quote_sent: "warning", approved: "info", in_progress: "info", waiting_parts: "info", ready: "success", picked_up: "neutral", declined: "neutral", cancelled: "neutral" },
  quote: { draft: "neutral", sent: "warning", approved: "success", declined: "danger", expired: "neutral", superseded: "neutral" },
  invoice: { draft: "neutral", open: "warning", paid: "success", void: "neutral" },
  integration: { connected: "success", pending: "info", error: "danger", disconnected: "neutral" },
  merchant: { onboarding: "info", active: "success", paused: "warning", closed: "neutral" },
  rollout: { hidden: "neutral", beta: "info", ga: "success" },
  campaign: { draft: "neutral", scheduled: "info", live: "success", ended: "neutral", cancelled: "neutral" },
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  ticket: { quote_sent: "Needs approval", waiting_parts: "Waiting for parts", in_progress: "In progress", picked_up: "Picked up", intake: "Dropped off" },
  quote: { sent: "Needs your approval" },
  rollout: { hidden: "Hidden", beta: "Beta", ga: "Live" },
  order: { picked_up: "Picked up" },
};

export type StatusDomain = keyof typeof STATUS_TONES;

export function StatusBadge({ domain, status, label }: { domain: StatusDomain; status: string; label?: string }) {
  const tone = STATUS_TONES[domain]?.[status] ?? "neutral";
  const text = label ?? STATUS_LABELS[domain]?.[status] ?? status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <Badge tone={tone} dot>
      {text}
    </Badge>
  );
}
