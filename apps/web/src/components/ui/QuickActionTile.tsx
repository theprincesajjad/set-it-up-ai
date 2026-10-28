import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { TONE_HOVER, TONE_SURFACE, type Tone } from "./tones";

/** A pastel quick-action tile: a Lucide icon over a label (Main Street Warm "Quick actions"). At least 64 px tall, the whole tile is the link. */
export function QuickActionTile({ href, icon: Icon, label, tone = "mint", className }: { href: string; icon: LucideIcon; label: string; tone?: Tone; className?: string }) {
  return (
    <Link href={href} className={cn("flex min-h-22 flex-col justify-between gap-3 rounded-tile p-4 text-body-strong focus-visible:focus-ring", TONE_SURFACE[tone], TONE_HOVER, className)}>
      <Icon aria-hidden className="size-6" strokeWidth={1.8} />
      <span className="text-foreground">{label}</span>
    </Link>
  );
}
