"use client";
import { Info, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One quiet row for an error or a hint on the counter: an icon, a sentence, a dismiss. Not the dashboard Banner (the counter has none). */
export function CounterNotice({ tone = "info", icon: Icon = Info, children, action, onDismiss }: { tone?: "info" | "danger"; icon?: LucideIcon; children: ReactNode; action?: ReactNode; onDismiss?: () => void }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className="flex min-h-12 items-center gap-3 rounded-xl bg-muted px-4 py-2 text-meta text-foreground">
      <Icon aria-hidden className={cn("size-[18px] shrink-0", tone === "danger" ? "text-destructive" : "text-muted-foreground")} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
      {onDismiss ? (
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-hover focus-visible:focus-ring">
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
