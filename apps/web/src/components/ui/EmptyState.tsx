import { CloudOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/primitives/empty";
import { cn } from "@/lib/utils";

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

/**
 * v2: one sentence + one action. A small plain glyph at most, never an icon in a coloured circle. v3: the shadcn Empty (header, media,
 * description, content) is the structure; the title stays a real heading (h3) and the look stays plain, no dashed box.
 */
export function EmptyState({ icon: Icon, title, description, action, secondaryAction, tone = "brand", className }: EmptyStateProps) {
  return (
    <Empty className={cn("mx-auto max-w-90 gap-0 rounded-none p-0 px-4 py-12", className)}>
      <EmptyHeader className="max-w-none gap-0">
        {Icon ? (
          <EmptyMedia className="mb-4">
            <Icon aria-hidden className={cn("size-7", tone === "danger" ? "text-negative" : "text-fg-subtle")} strokeWidth={1.5} />
          </EmptyMedia>
        ) : null}
        <h3 className="text-headline text-fg">{title}</h3>
        {description ? <EmptyDescription className="mt-1.5 text-body text-fg-muted">{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action || secondaryAction ? (
        <EmptyContent className="mt-5 max-w-none gap-2">
          {action}
          {secondaryAction}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

/** Same layout as EmptyState with a retry. */
// Server-safe (icons are passed in by server pages), so no locale hook here: customer pages always pass a translated title and
// description; these English defaults are the shop-side (dashboard) wording.
export function ErrorState({ title = "Something went wrong on our end", /* l10n-ok */ description = "Try again in a moment.", /* l10n-ok */ action, icon = CloudOff, className }: Partial<EmptyStateProps>) {
  return <EmptyState icon={icon} tone="danger" title={title} description={description} action={action} className={className} />;
}
