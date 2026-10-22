import { categoryAsset, verticalCategory, type MapCategoryId, type VerticalCategory } from "@ll/design-tokens";
import { cn } from "@/lib/cn";

/**
 * The flat-3D object illustration for a map category (packages/design-tokens/assets/categories,
 * copied to /public/categories). Pass a vertical or a category. Decorative: always alt="".
 */
export function CategoryIcon({ vertical, category, size = 28, className }: { vertical?: string | null; category?: MapCategoryId | VerticalCategory; size?: number; className?: string }) {
  const c = category ?? verticalCategory(vertical);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/categories/${categoryAsset[c]}.svg`} alt="" aria-hidden width={size} height={size} draggable={false} className={cn("pointer-events-none shrink-0 select-none", className)} style={{ width: size, height: size }} />
  );
}
