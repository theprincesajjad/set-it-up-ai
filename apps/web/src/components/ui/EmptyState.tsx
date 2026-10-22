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

export function EmptyState({ icon: Icon, title, description, action, secondaryAction, tone = "brand", className }: EmptyStateProps) {
  return (
    <div className={cn("mx-auto flex max-w-[360px] flex-col items-center px-4 py-10 text-center", className)}>
      {Icon ? (
        <div className={cn("mb-4 flex size-24 items-center justify-center rounded-full", tone === "danger" ? "bg-danger-subtle text-danger" : "bg-brand-subtle text-fg-brand")}>
          <Icon aria-hidden className="size-12" strokeWidth={1.75} />
        </div>
      ) : null}
      <h3 className="text-h3 text-fg">{title}</h3>
      {description ? <p className="mt-2 text-body text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
      {secondaryAction ? <div className="mt-2">{secondaryAction}</div> : null}
    </div>
  );
}

/** Same layout as EmptyState with a danger circle and a retry. */
export function ErrorState({ title = "Something went wrong on our end", description = "Try again in a moment.", action, icon = CloudOff, className }: Partial<EmptyStateProps>) {
  return <EmptyState icon={icon} tone="danger" title={title} description={description} action={action} className={className} />;
}
