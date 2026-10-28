"use client";
import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { optionPriceLabel, type Item, type Option, type OptionGroup } from "@/lib/restaurant/order";
import { Chip } from "@/components/ui/Chip";
import { useFmt } from "./ui";

/** Size, spice and add-on groups for one dish (frame 12a). Single groups are radios (or chips when every choice is free), multi groups are checkboxes. */
export function OptionGroups({ item, value, onChange, idPrefix = "og" }: { item: Pick<Item, "priceCents" | "options">; value: string[]; onChange: (next: string[]) => void; idPrefix?: string }) {
  const groups = item.options?.groups ?? [];
  const pick = (g: OptionGroup, o: Option) => {
    if (g.type === "single") {
      // A required group can't be cleared; an optional one toggles off when tapped again.
      const others = value.filter((id) => !g.options.some((x) => x.id === id));
      onChange(value.includes(o.id) && !g.required ? others : [...others, o.id]);
      return;
    }
    onChange(value.includes(o.id) ? value.filter((id) => id !== o.id) : [...value, o.id]);
  };
  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <Group key={g.id} g={g} value={value} onPick={(o) => pick(g, o)} idPrefix={idPrefix} />
      ))}
    </div>
  );
}

function Group({ g, value, onPick, idPrefix }: { g: OptionGroup; value: string[]; onPick: (o: Option) => void; idPrefix: string }) {
  const { t, money, number, pick: tr, locale } = useFmt();
  const name = useId();
  const free = g.type === "single" && g.priceMode === "delta" && g.options.every((o) => o.priceCents === 0) && g.options.length <= 4;
  const selected = (o: Option) => value.includes(o.id);
  const heading = tr({ name: g.name }).name;
  return (
    <fieldset className="flex flex-col gap-1 border-t border-line py-4 first:border-t-0 first:pt-0">
      <legend className={cn("mb-2 flex w-full items-baseline justify-between gap-3 text-headline text-fg", locale === "en" ? "display lowercase" : "font-bold")}>
        <span className="min-w-0">{heading}</span>
        {g.required ? <span className="text-caption font-normal text-fg-muted">{t("rs.required")}</span> : null}
      </legend>
      {free ? (
        <div role={g.required ? "radiogroup" : "group"} aria-label={heading} className="flex flex-wrap gap-2">
          {g.options.map((o) => (
            <Chip key={o.id} selected={selected(o)} onClick={() => onPick(o)}>
              {tr({ name: o.name }).name}
            </Chip>
          ))}
        </div>
      ) : (
        <ul>
          {g.options.map((o, i) => {
            const on = selected(o);
            const p = optionPriceLabel(g, o);
            const id = `${idPrefix}-${name}-${o.id}`;
            return (
              <li key={o.id} className={cn("border-line", i > 0 && "border-t")}>
                <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                  <input id={id} type={g.type === "single" ? "radio" : "checkbox"} name={name} checked={on} onChange={() => onPick(o)} className="peer sr-only" />
                  <span aria-hidden className={cn("flex size-[22px] shrink-0 items-center justify-center border-[1.5px] transition-colors peer-focus-visible:focus-ring", g.type === "single" ? "rounded-full" : "rounded-[6px]", on ? "border-trade bg-trade text-trade-foreground" : "border-line-strong/70 bg-bg")}>
                    {on ? g.type === "single" ? <span className="size-2 rounded-full bg-bg" /> : <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-body text-fg">{tr({ name: o.name }).name}</span>
                    {o.serves || o.note ? <span className="block text-meta text-fg-muted">{[o.serves ? t("menu.serves", { n: number(o.serves) }) : null, o.note].filter(Boolean).join(" · ")}</span> : null}
                  </span>
                  <span dir="ltr" className="shrink-0 text-body tabular-nums text-fg-muted">{p.cents === 0 && !p.plus && g.priceMode === "delta" ? "" : `${p.plus ? "+" : ""}${money(p.cents)}`}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
