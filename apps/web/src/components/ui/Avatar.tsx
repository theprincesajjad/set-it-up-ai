import { cn } from "@/lib/cn";

const PALETTE = ["cafe", "pharmacy", "bookstore", "pet", "salon", "fitness"] as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SIZES = { 24: "size-6 text-[10px]", 32: "size-8 text-caption", 40: "size-10 text-label", 56: "size-14 text-title", 80: "size-20 text-h3" } as const;

/** Initials on a deterministic vertical tint (system.md §5 Avatar). */
export function Avatar({ name, id, src, size = 40, className }: { name: string | null; id?: string; src?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const initials = (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
  const v = PALETTE[hash(id ?? name ?? "") % PALETTE.length]!;
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("rounded-full object-cover", SIZES[size], className)} />;
  return (
    <span aria-hidden className={cn("inline-flex items-center justify-center rounded-full font-semibold", SIZES[size], className)} style={{ background: `var(--ll-vertical-${v}-tint)`, color: `var(--ll-vertical-${v}-ink)` }}>
      {initials}
    </span>
  );
}
