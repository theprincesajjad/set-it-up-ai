import { CloudOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** One primary or tonal Button. Never a dead end. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: "brand" | "danger";
  className?: string;
}

/** v2: one sentence + one action. A small plain glyph at most, never an icon in a coloured circle. */
export function EmptyState({ icon: Icon, title, description, action, secondaryAction, tone = "brand", className }: EmptyStateProps) {
  return (
    <div className={cn("mx-auto flex max-w-[360px] flex-col items-center px-4 py-12 text-center", className)}>
      {Icon ? <Icon aria-hidden className={cn("mb-4 size-7", tone === "danger" ? "text-negative" : "text-fg-subtle")} strokeWidth={1.5} /> : null}
      <h3 className="text-headline text-fg">{title}</h3>
      {description ? <p className="mt-1.5 text-body text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
      {secondaryAction ? <div className="mt-2">{secondaryAction}</div> : null}
    </div>
  );
}

/** Same layout as EmptyState with a retry. */
// Server-safe (icons are passed in by server pages), so no locale hook here: customer pages always pass a translated title and
// description; these English defaults are the shop-side (dashboard) wording.
export function ErrorState({ title = "Something went wrong on our end", /* l10n-ok */ description = "Try again in a moment.", /* l10n-ok */ action, icon = CloudOff, className }: Partial<EmptyStateProps>) {
  return <EmptyState icon={icon} tone="danger" title={title} description={description} action={action} className={className} />;
}
