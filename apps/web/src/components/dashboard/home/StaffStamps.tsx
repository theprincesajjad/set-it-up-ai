"use client";
import type { reportsApi } from "@ll/shared";
import { formatNumber } from "@/lib/format";
import { staffLabel } from "@/lib/dashboard/home";
import { ListSection } from "./ListSection";

/** Stamps by staff today, plus undone stamps: spots a counter that skips the ask or stamps friends. */
export function StaffStamps({ staff, terminology, loading }: { staff: reportsApi.TodayReportDto["staff"] | null; terminology: string; loading?: boolean }) {
  const undone = (staff ?? []).filter((s) => s.undone > 0);
  const undoneTotal = undone.reduce((a, s) => a + s.undone, 0);
  const unit = terminology.replace(/s$/, "");
  return (
    <ListSection
      title="Stamps by staff today"
      right="Spot a counter that skips the ask"
      loading={loading && !staff}
      empty="Nobody has stamped yet today."
      rows={[
        ...(staff ?? []).map((s) => ({
          key: s.staffId,
          title: staffLabel(s),
          meta: `${formatNumber(s.stamps)} ${s.stamps === 1 ? unit : terminology} · ${formatNumber(s.visits)} ${s.visits === 1 ? "visit" : "visits"}`,
          trailing: <span className="text-fg">{formatNumber(s.stamps)}</span>,
        })),
        ...(undoneTotal > 0
          ? [
              {
                key: "undone",
                title: `Undone ${terminology}`,
                meta: `${undoneTotal} today · ${undone.map((s) => `${s.name.split(" ")[0]} ${s.undone}`).join(", ")}`,
                trailing: <span className="text-fg-muted">{undoneTotal}</span>,
              },
            ]
          : []),
      ]}
    />
  );
}
