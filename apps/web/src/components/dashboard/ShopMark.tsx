import { cn } from "@/lib/cn";
import { onColor } from "@/lib/shopAvatar";

/** Shop identity: brandColor lives only inside this mark (foundations.md "Shop identity"). */
export function ShopMark({ name, brandColor, logoUrl, size = 28, className }: { name: string; brandColor?: string | null; logoUrl?: string | null; size?: number; className?: string }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .split(/\s+/)
      .filter((w) => !/^(the|and|of|co)$/i.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  const brand = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : null;
  if (logoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" style={style} className={cn("shrink-0 object-cover", !className?.includes("rounded") && "rounded-[8px]", className)} />;
  return (
    <span aria-hidden style={{ ...style, background: brand ?? "var(--ll-color-fg)", color: brand ? onColor(brand) : undefined }} className={cn("inline-flex shrink-0 items-center justify-center font-semibold", !className?.includes("rounded") && "rounded-[8px]", !brand && "text-bg", className)}>
      {initials}
    </span>
  );
}
