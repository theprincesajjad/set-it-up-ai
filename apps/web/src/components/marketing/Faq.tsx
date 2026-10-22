import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** Accordion on <details> (works without JS). */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-border rounded-lg bg-surface shadow-sm">
      {items.map((i) => (
        <details key={i.q} className="group px-5">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-title text-fg focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
            {i.q}
            <ChevronDown aria-hidden className="size-5 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-5 text-body text-fg-muted">{i.a}</div>
        </details>
      ))}
    </div>
  );
}
