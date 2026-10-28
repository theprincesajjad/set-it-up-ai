import { cn } from "@/lib/cn";

/**
 * The awning stripe: one per page, at the top (Main Street Warm). Terracotta and white stripes by default; `tone="trade"` stripes in the
 * shop's accent (`[data-trade]`). Decorative: hidden from assistive tech. Shared by the dashboard shell, the customer pass and marketing.
 *
 *   <Awning />                       8 px strip across the content column (dashboard pages)
 *   <Awning size="lg" scalloped />   the pass card's top edge: 24 px with scalloped teeth
 */
export function Awning({ tone = "primary", size = "sm", scalloped, className }: { tone?: "primary" | "trade"; size?: "sm" | "md" | "lg"; scalloped?: boolean; className?: string }) {
  const h = { sm: "h-2", md: "h-3", lg: "h-6" }[size];
  return (
    <div
      aria-hidden
      data-awning=""
      className={cn(
        "w-full shrink-0 rounded-full",
        h,
        // Stripes: 36 px terracotta, 36 px card. The teeth are a mask on the lower edge.
        tone === "trade"
          ? "bg-[repeating-linear-gradient(90deg,var(--trade)_0_36px,var(--card)_36px_72px)]"
          : "bg-[repeating-linear-gradient(90deg,var(--primary)_0_36px,var(--card)_36px_72px)]",
        scalloped && "rounded-none [mask-image:radial-gradient(circle_at_12px_100%,transparent_0_7px,#000_7.5px)] [mask-size:24px_100%] [mask-repeat:repeat-x]",
        className,
      )}
    />
  );
}
