import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";

/** v2: one quiet grey block for every tone; only the small icon carries meaning (never a tinted card). */
const tones: Record<BannerTone, { icon: LucideIcon; iconCls: string }> = {
  info: { icon: Info, iconCls: "text-fg-muted" },
  success: { icon: CircleCheck, iconCls: "text-positive" },
  warning: { icon: TriangleAlert, iconCls: "text-fg" },
  danger: { icon: CircleAlert, iconCls: "text-negative" },
  neutral: { icon: Info, iconCls: "text-fg-muted" },
};

/** Inline / global banner (system.md §4 Banner). */
export function Banner({ tone = "info", title, children, action, className, icon }: { tone?: BannerTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: LucideIcon }) {
  const t = tones[tone];
  const Icon = icon ?? t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex min-h-12 items-start gap-3 rounded-card bg-bg-subtle px-4 py-3 text-meta text-fg", className)}>
      <Icon aria-hidden className={cn("mt-px size-[18px] shrink-0", t.iconCls)} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        {title ? <p className="text-meta-strong">{title}</p> : null}
        {children ? <div className={title ? "text-fg-muted" : undefined}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
