/**
 * The awning stripe: terracotta and white, one per marketing page, rendered by the marketing layout (pages and sections must not).
 * It unrolls once on load; with reduced motion it is simply there (see marketing.css).
 */
export function Awning() {
  return <div aria-hidden data-testid="awning" className="mkt-awning h-3.5 w-full rounded-b-lg" />;
}
