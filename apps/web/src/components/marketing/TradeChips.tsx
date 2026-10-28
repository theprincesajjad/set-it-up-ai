import { cn } from "@/lib/cn";

/** Trades shown as chips, each in its own colour (`data-trade` switches the accent family). */
export const TRADE_CHIPS: { vertical: string; label: string }[] = [
  { vertical: "cafe", label: "Café" },
  { vertical: "bakery", label: "Bakery" },
  { vertical: "salon", label: "Salon" },
  { vertical: "barber", label: "Barber" },
  { vertical: "restaurant", label: "Restaurant" },
  { vertical: "tiffin", label: "Tiffin" },
  { vertical: "grocery", label: "Grocer" },
  { vertical: "pharmacy", label: "Pharmacy" },
  { vertical: "fitness", label: "Studio" },
  { vertical: "pet", label: "Pet care" },
  { vertical: "repair_auto", label: "Auto care" },
  { vertical: "florist", label: "Florist" },
  { vertical: "bookstore", label: "Books" },
  { vertical: "repair_electronics", label: "Repair" },
];

/** One trade chip: a dot in the trade's accent, the label in ink, on a white pill. Decorative list item, not a control. */
export function TradeChip({ vertical, label, soft, className }: { vertical: string; label: string; /** Fill the pill with the trade's soft tint and deep text. */ soft?: boolean; className?: string }) {
  return (
    <span data-trade={vertical} className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-meta-strong", soft ? "border-transparent bg-trade-soft text-trade-deep" : "border-border bg-card text-foreground shadow-card", className)}>
      <span aria-hidden className="size-2.5 rounded-full bg-trade" />
      {label}
    </span>
  );
}

/** The "Made for" strip. */
export function TradeChips({ label, items = TRADE_CHIPS, soft, className }: { label?: string; items?: { vertical: string; label: string }[]; soft?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {label ? <span className="display me-2 text-title text-foreground">{label}</span> : null}
      <ul className="flex flex-wrap items-center gap-2.5">
        {items.map((t) => (
          <li key={t.vertical + t.label}>
            <TradeChip {...t} soft={soft} />
          </li>
        ))}
      </ul>
    </div>
  );
}
