import { Plus } from "lucide-react";
import type { ReactNode } from "react";

/** Accordion on <details> (works without JS): hairline rows, a plus that turns into a cross. */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((i) => (
        <details key={i.q} className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 text-headline text-foreground focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
            {i.q}
            <Plus aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-45" strokeWidth={1.75} />
          </summary>
          <div className="max-w-2xl pb-6 text-body leading-relaxed text-muted-foreground">{i.a}</div>
        </details>
      ))}
    </div>
  );
}
