import { Plus } from "lucide-react";
import type { ReactNode } from "react";

/** Accordion on <details> (works without JS): hairline rows, a plus that turns into a cross. */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <details key={i.q} className="group rounded-card bg-card shadow-card">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 px-5 py-4 text-headline text-foreground focus-visible:focus-ring rounded-card [&::-webkit-details-marker]:hidden">
            {i.q}
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tile-peach text-tile-peach-foreground"><Plus className="size-4 transition-transform duration-150 ease-out group-open:rotate-45" strokeWidth={2.25} /></span>
          </summary>
          <div className="max-w-2xl px-5 pb-5 text-body leading-relaxed text-muted-foreground">{i.a}</div>
        </details>
      ))}
    </div>
  );
}
