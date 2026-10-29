/**
 * The awning stripe: terracotta and white, one per marketing page, rendered by the marketing layout (pages and sections must not).
 * It unrolls once on load; with reduced motion it is simply there (see marketing.css). Main Street Warm only: Clear has no awning
 * (docs/design/v3.2-clear-build.md), so under Clear it is not shown.
 */
export function Awning() {
  return <div aria-hidden data-testid="awning" className="mkt-awning h-3.5 w-full rounded-b-lg clear:hidden" />;
}
