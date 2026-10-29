"use client";
/** Show, hide and reorder the preset's sections. The top section stays first; required ones cannot be hidden. */
import { ArrowDown, ArrowUp } from "lucide-react";
import { SITE_PRESET_DEFS, type SiteContent, type SiteSection } from "@ll/shared";
import { SwitchControl } from "@/components/ui/Switch";
import { copy } from "@/copy/en-CA";

export function SectionsEditor({ content, onChange }: { content: SiteContent; onChange: (next: { order: SiteSection[]; hidden: SiteSection[] }) => void }) {
  const c = copy.siteBuilder;
  const def = SITE_PRESET_DEFS[content.preset];
  const order = content.order;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 1 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ order: next, hidden: content.hidden });
  };
  const toggle = (s: SiteSection, show: boolean) => onChange({ order, hidden: show ? content.hidden.filter((h) => h !== s) : [...content.hidden, s] });
  const iconBtn = "inline-flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:focus-ring disabled:text-muted-foreground disabled:hover:bg-transparent";
  return (
    <ul className="divide-overlay">
      {order.map((s, i) => {
        const required = def.required.includes(s);
        const name = c.sectionNames[s];
        return (
          <li key={s} className="relative flex min-h-14 items-center gap-2 px-4 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-body-strong text-foreground">{name}</p>
              {required ? <p className="text-meta text-muted-foreground">{c.required}</p> : null}
            </div>
            {s !== "hero" ? (
              <>
                <button type="button" className={iconBtn} aria-label={c.moveUp(name)} disabled={i <= 1} onClick={() => move(i, -1)}>
                  <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button type="button" className={iconBtn} aria-label={c.moveDown(name)} disabled={i >= order.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </>
            ) : null}
            <SwitchControl checked={!content.hidden.includes(s)} disabled={required} onChange={(v) => toggle(s, v)} ariaLabel={c.show(name)} />
          </li>
        );
      })}
    </ul>
  );
}
