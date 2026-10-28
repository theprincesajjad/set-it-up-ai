"use client";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { useBiaOptional } from "./BiaContext";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * The street the BIA console shows: initials mark and name; a native select when the user manages more than one
 * neighbourhood (admins see them all), plain text otherwise. Reads BiaProvider, so it works in the sidebar and the phone top bar.
 */
export function BiaSwitcher({ compact }: { compact?: boolean }) {
  const bia = useBiaOptional();
  const id = useId();
  const items = bia?.managed.data?.items ?? [];
  const sel = bia?.selected ?? null;
  const name = sel?.biaName ?? sel?.name ?? "BIA";
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", compact ? "" : "h-10 px-2")}>
      <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-primary text-[11px] font-bold text-primary-foreground">
        {sel ? initials(name) : "BIA"}
      </span>
      {items.length > 1 && bia ? (
        <div className="relative min-w-0 flex-1">
          <label htmlFor={id} className="sr-only">
            Neighbourhood
          </label>
          <select
            id={id}
            value={sel?.id ?? ""}
            onChange={(e) => bia.select(e.target.value)}
            className="w-full min-w-0 cursor-pointer appearance-none truncate rounded-input bg-transparent py-1 pe-6 text-[14px] font-semibold leading-5 text-fg outline-none focus-visible:focus-ring"
          >
            {items.map((n) => (
              <option key={n.id} value={n.id}>
                {n.biaName ?? n.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute end-0.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" strokeWidth={2} />
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-fg">{name}</span>
      )}
    </div>
  );
}
