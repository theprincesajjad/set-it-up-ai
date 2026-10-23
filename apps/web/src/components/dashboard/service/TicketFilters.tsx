import { Capsules } from "@/components/dashboard/kit";

export type BoardFilter = "all" | "mine" | "today" | "overdue" | "photos";

/** Filter chips: everyone, my tickets, due today, overdue, has photos. One at a time keeps the board easy to read. */
export function TicketFilters({ value, onChange, counts }: { value: BoardFilter; onChange: (v: BoardFilter) => void; counts?: Partial<Record<BoardFilter, number>> }) {
  return (
    <Capsules
      label="Filter tickets"
      value={value}
      onChange={onChange}
      options={[
        { value: "all", label: "All staff" },
        { value: "mine", label: "Assigned to me" },
        { value: "today", label: "Due today", count: counts?.today || null },
        { value: "overdue", label: "Overdue", count: counts?.overdue || null, tone: "negative" },
        { value: "photos", label: "Has photos" },
      ]}
    />
  );
}
