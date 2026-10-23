"use client";
import type { campaignsApi } from "@ll/shared";
import { Dot } from "@/components/dashboard";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

/** Activated shops read "Activated", the rest by their onboarding status. Status is a dot and a word, never colour alone. */
export function shopStatus(r: Pick<campaignsApi.NeighbourhoodShopRow, "activated" | "status">): { label: string; tone: "positive" | "neutral" } {
  if (r.activated) return { label: "Activated", tone: "positive" };
  // Not activated yet: still being set up with a rep, unless the shop paused itself.
  return { label: r.status === "paused" ? "Paused" : "Onboarding", tone: "neutral" };
}

/** Shops that still need a rep come first, then the busiest. */
export function sortShops(rows: campaignsApi.NeighbourhoodShopRow[], notActivatedFirst: boolean): campaignsApi.NeighbourhoodShopRow[] {
  return [...rows].sort((a, b) => (notActivatedFirst ? Number(a.activated) - Number(b.activated) : 0) || b.visits - a.visits || a.name.localeCompare(b.name));
}

/** Hairline table of shops with visits and new members in the period. Under 640px the Status column hides and names wrap. */
export function ShopsTable({ rows, limit, notActivatedFirst, label = "Shops on your street", dense }: { rows: campaignsApi.NeighbourhoodShopRow[]; limit?: number; notActivatedFirst?: boolean; label?: string; /** Tighter rows for the one-page print report. */ dense?: boolean }) {
  const sorted = sortShops(rows, !!notActivatedFirst);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  if (!shown.length) return <p className="py-6 text-meta text-fg-muted">No shops on this street yet. Your rep adds them as they sign up.</p>;
  return (
    <table className="w-full text-meta" data-testid="shops-table">
      <caption className="sr-only">{label}</caption>
      <thead className="text-fg-muted">
        <tr>
          <th scope="col" className="py-2 pe-3 text-start font-medium">Shop</th>
          <th scope="col" className="hidden py-2 pe-3 text-start font-medium sm:table-cell">Status</th>
          <th scope="col" className="py-2 ps-3 text-end font-medium">Visits</th>
          <th scope="col" className="py-2 ps-3 text-end font-medium">New</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => {
          const st = shopStatus(r);
          return (
            <tr key={r.id} className="border-t border-line">
              <th scope="row" className={cn("pe-3 text-start font-normal text-fg", dense ? "py-1 text-meta" : "py-3 text-body")}>
                {r.name}
                <span className="sr-only sm:hidden"> ({st.label})</span>
              </th>
              <td className={cn("hidden pe-3 sm:table-cell", dense ? "py-1" : "py-3")}>
                <Dot tone={st.tone}>{st.label}</Dot>
              </td>
              <td className={cn("ps-3 text-end tabular text-fg", dense ? "py-1" : "py-3")}>{formatNumber(r.visits)}</td>
              <td className={cn("ps-3 text-end tabular text-fg", dense ? "py-1" : "py-3")}>{formatNumber(r.newMembers)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

