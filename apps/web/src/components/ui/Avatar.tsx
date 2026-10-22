import { cn } from "@/lib/cn";

const SIZES = { 24: "size-6 text-[10px]", 32: "size-8 text-caption", 40: "size-10 text-meta-strong", 56: "size-14 text-headline", 80: "size-20 text-title" } as const;

/** A person's avatar: photo, or initials on a neutral grey disc (v2: no colour for people). */
export function Avatar({ name, src, size = 40, className }: { name: string | null; id?: string; src?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const initials =
    (name ?? "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("rounded-full object-cover", SIZES[size], className)} />;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-bg-muted font-semibold text-fg", SIZES[size], className)}>
      {initials}
    </span>
  );
}
