import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "@/components/primitives/alert";
import { cn } from "@/lib/utils";

export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";

/** v2: one quiet grey block for every tone; only the small icon carries meaning (never a tinted card). */
const tones: Record<BannerTone, { icon: LucideIcon; iconCls: string }> = {
  info: { icon: Info, iconCls: "text-fg-muted" },
  success: { icon: CircleCheck, iconCls: "text-positive" },
  warning: { icon: TriangleAlert, iconCls: "text-fg" },
  danger: { icon: CircleAlert, iconCls: "text-negative" },
  neutral: { icon: Info, iconCls: "text-fg-muted" },
};

/**
 * Inline / global banner (system.md section 4 Banner). v3: the shadcn Alert is the element (its `role="alert"` is replaced with `status`
 * for non-danger tones so polite messages are not announced as alerts); the v2 grey block and the icon-only tone stay.
 */
export function Banner({ tone = "info", title, children, action, className, icon }: { tone?: BannerTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: LucideIcon }) {
  const t = tones[tone];
  const Icon = icon ?? t.icon;
  return (
    <Alert role={tone === "danger" ? "alert" : "status"} className={cn("flex min-h-12 items-start gap-3 rounded-card border-0 bg-bg-subtle px-4 py-3 text-meta text-fg", className)}>
      <Icon aria-hidden className={cn("mt-px size-[18px] shrink-0", t.iconCls)} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        {title ? <p className="text-meta-strong">{title}</p> : null}
        {children ? <div className={title ? "text-fg-muted" : undefined}>{children}</div> : null}
      </div>
      {action}
    </Alert>
  );
}
