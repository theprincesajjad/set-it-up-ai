import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon3d, type Icon3dProps } from "@/components/ui/Icon3d";
import { cn } from "@/lib/cn";

export interface ShareRowProps {
  icon: Icon3dProps["name"];
  trade?: Icon3dProps["trade"];
  title: ReactNode;
  hint?: ReactNode;
  actionLabel: string;
  onAction?: () => void;
  href?: string;
  className?: string;
}

/** A row with a 40 px 3D object, a 13/550 title, a 12 hint and one 32 px (44 on phones) secondary button on the end edge ("Copy link", "Download"). */
export function ShareRow({ icon, trade, title, hint, actionLabel, onAction, href, className }: ShareRowProps) {
  return (
    <div className={cn("flex items-center gap-4 border-b border-border py-3 last:border-b-0", className)}>
      <Icon3d name={icon} size={40} trade={trade} />
      <div className="min-w-0 flex-1">
        <p className="text-body font-[550] text-foreground">{title}</p>
        {hint ? <p className="text-meta text-muted-foreground">{hint}</p> : null}
      </div>
      <Button variant="secondary" size="md" onClick={onAction} href={href} className="shrink-0">
        {actionLabel}
      </Button>
    </div>
  );
}
