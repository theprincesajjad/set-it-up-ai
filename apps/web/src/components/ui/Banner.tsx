import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";

const tones: Record<BannerTone, { cls: string; icon: LucideIcon; iconCls: string }> = {
  info: { cls: "bg-info-subtle text-on-info-subtle", icon: Info, iconCls: "text-info" },
  success: { cls: "bg-success-subtle text-on-success-subtle", icon: CircleCheck, iconCls: "text-success" },
  warning: { cls: "bg-warning-subtle text-on-warning-subtle", icon: TriangleAlert, iconCls: "text-on-warning-subtle" },
  danger: { cls: "bg-danger-subtle text-on-danger-subtle", icon: CircleAlert, iconCls: "text-danger" },
  neutral: { cls: "bg-neutral-subtle text-on-neutral-subtle", icon: Info, iconCls: "text-fg-muted" },
};

/** Inline / global banner (system.md §4 Banner). */
export function Banner({ tone = "info", title, children, action, className, icon }: { tone?: BannerTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: LucideIcon }) {
  const t = tones[tone];
  const Icon = icon ?? t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex min-h-12 items-start gap-3 rounded-md px-4 py-3 text-body-sm font-medium", t.cls, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", t.iconCls)} />
      <div className="flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
