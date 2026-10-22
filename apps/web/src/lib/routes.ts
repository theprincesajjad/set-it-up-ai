/**
 * Route constants shared across teams. The merchant dashboard, rep console and
 * admin live in this same app (see docs/engineering/web.md):
 *   src/app/(dashboard)/m/[merchantId]/...   merchant dashboard (merchant-dashboard.md uses /m/[merchantId])
 *   src/app/(rep)/rep/...                    rep console
 *   src/app/(admin)/admin/...                admin
 */
export const routes = {
  home: "/",
  login: "/login",
  signup: "/signup",
  wallet: "/me",
  map: "/map",
  shop: (slug: string) => `/shops/${encodeURIComponent(slug)}`,
  join: (code: string) => `/j/${encodeURIComponent(code)}`,
  neighbourhood: (slug: string) => `/neighbourhoods/${encodeURIComponent(slug)}`,
  /** Owned by the dashboard engineer. */
  dashboard: (merchantId?: string) => (merchantId ? `/m/${encodeURIComponent(merchantId)}` : "/m"),
  rep: "/rep",
  admin: "/admin",
} as const;

/** Only allow same-site relative return paths (no open redirects). */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
