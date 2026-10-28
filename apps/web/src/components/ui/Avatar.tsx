import { Avatar as AvatarPrimitive, AvatarFallback, AvatarImage } from "@/components/primitives/avatar";
import { cn } from "@/lib/utils";

const SIZES = { 24: "size-6 text-[10px]", 32: "size-8 text-caption", 40: "size-10 text-meta-strong", 56: "size-14 text-headline", 80: "size-20 text-title" } as const;

/**
 * A person's avatar: photo, or initials on a neutral grey disc (v2: no colour for people). v3: built on the shadcn Avatar (Base UI), which
 * shows the fallback while a photo loads or when it fails. Decorative: the person's name is always written next to it.
 */
export function Avatar({ name, src, size = 40, className }: { name: string | null; id?: string; src?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const initials =
    (name ?? "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <AvatarPrimitive aria-hidden className={cn("shrink-0", SIZES[size], className)}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className={cn("bg-bg-muted font-semibold text-fg", SIZES[size])}>{initials}</AvatarFallback>
    </AvatarPrimitive>
  );
}
