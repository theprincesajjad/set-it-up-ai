import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { TONE_SURFACE, type Tone } from "./tones";

/**
 * A Lucide icon in a coloured rounded square (Main Street Warm: Lucide in tiles, never emoji). `tone` is a pastel tile or `trade`.
 * Decorative by default (`aria-hidden`); the text next to it carries the meaning.
 */
export function IconTile({ icon: Icon, tone = "peach", size = "md", className }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "size-8 rounded-xl", md: "size-10 rounded-[14px]", lg: "size-12 rounded-2xl" }[size];
  const glyph = { sm: "size-4", md: "size-5", lg: "size-6" }[size];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center", box, TONE_SURFACE[tone], className)}>
      <Icon className={glyph} strokeWidth={1.9} />
    </span>
  );
}
