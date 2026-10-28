/**
 * The awning stripe (v3 mood board 01): 10 px, points and paper, scalloped by the gaps. Marketing header and the customer pass
 * only, and exactly one per page: the marketing layout renders it, so pages and sections must not.
 */
export function Awning() {
  return (
    <svg aria-hidden focusable="false" data-testid="awning" width="100%" height="10" className="block">
      <defs>
        <pattern id="awning-stripe" width="40" height="10" patternUnits="userSpaceOnUse">
          <rect width="20" height="10" className="fill-points" />
        </pattern>
      </defs>
      <rect width="100%" height="10" fill="url(#awning-stripe)" />
    </svg>
  );
}
