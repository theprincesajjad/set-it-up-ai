"use client";
import { Check } from "lucide-react";
import type { appointmentsApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { duration, money } from "@/lib/dashboard/calendar";

type Service = appointmentsApi.ServiceDto;

/** Multi-select list of services grouped by category: name, minutes and price on each row. */
export function ServicePicker({ services, value, onChange, label = "Services" }: { services: Service[]; value: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const groups = new Map<string, Service[]>();
  for (const s of services) groups.set(s.categoryName ?? "Other", [...(groups.get(s.categoryName ?? "Other") ?? []), s]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-meta-strong text-fg">{label}</legend>
      {[...groups].map(([cat, list]) => (
        <div key={cat}>
          {groups.size > 1 ? <p className="mb-1 text-caption text-fg-muted">{cat}</p> : null}
          <ul className="divide-y divide-line rounded-input border border-line">
            {list.map((s) => {
              const on = value.includes(s.id);
              return (
                <li key={s.id}>
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s.id)} className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start hover:bg-bg-subtle focus-visible:focus-ring">
                    <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-line-strong")}>
                      {on ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-fg">{s.name}</span>
                      <span className="block truncate text-meta text-fg-muted">{duration(s.durationMin)}</span>
                    </span>
                    <span className="shrink-0 text-body tabular text-fg">
                      {s.priceFrom ? "from " : ""}
                      {money(s.priceCents)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}
