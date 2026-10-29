"use client";
/**
 * Every line of the site's words, grouped by section, each with plain typing and "Rewrite this" (the small model, capped).
 * Selecting a line in the preview focuses it here.
 */
import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { SITE_COPY_FIELDS, getCopyField, type SiteContent, type SiteCopyField, type SiteSection } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";

const GROUPS: { section: SiteSection | "seo"; fields: SiteCopyField[] }[] = [
  { section: "hero", fields: ["hero.headline", "hero.subhead", "hero.cta"] },
  { section: "about", fields: ["about.title", "about.body"] },
  { section: "services", fields: ["services.title", "services.intro"] },
  { section: "reviews", fields: ["reviews.title"] },
  { section: "loyalty", fields: ["loyalty.title", "loyalty.body"] },
  { section: "promos", fields: ["promos.title", "promos.intro"] },
  { section: "hours", fields: ["hours.title"] },
  { section: "map", fields: ["map.title", "map.note"] },
  { section: "contact", fields: ["contact.title", "contact.body"] },
  { section: "seo", fields: ["seo.title", "seo.description"] },
];

const LONG = new Set<SiteCopyField>(["about.body", "hero.subhead", "loyalty.body", "contact.body", "services.intro", "promos.intro", "map.note", "seo.description"]);

export function CopyEditor({
  content,
  onChange,
  activeField,
  onFocusField,
  aiAvailable,
  rewriting,
  onRewrite,
  editsLeft,
}: {
  content: SiteContent;
  onChange: (field: SiteCopyField, value: string) => void;
  activeField: SiteCopyField | null;
  onFocusField: (f: SiteCopyField) => void;
  aiAvailable: boolean;
  rewriting: SiteCopyField | null;
  onRewrite: (f: SiteCopyField) => void;
  editsLeft: number;
}) {
  const c = copy.siteBuilder;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeField) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-edit="${activeField}"] textarea, [data-edit="${activeField}"] input`);
    if (el && document.activeElement !== el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  }, [activeField]);
  const visible = new Set<string>([...content.order.filter((s) => !content.hidden.includes(s)), "seo"]);
  return (
    <div ref={root} className="flex flex-col gap-5 px-4 pb-4">
      {GROUPS.filter((g) => visible.has(g.section)).map((g) => (
        <fieldset key={g.section} className="flex flex-col gap-3">
          <legend className="mb-2 text-meta font-[550] text-muted-foreground">{g.section === "seo" ? c.seoGroup : c.sectionNames[g.section]}</legend>
          {g.fields.map((f) => {
            const value = getCopyField(content.copy, f);
            const max = SITE_COPY_FIELDS[f];
            return (
              <div key={f} data-edit={f} className={cn("flex flex-col gap-1.5 rounded-r3", activeField === f && "bg-row-sel p-2 -m-2")} onFocus={() => onFocusField(f)}>
                {LONG.has(f) ? (
                  <TextField type="textarea" label={c.fieldNames[f]} value={value} maxLength={max} rows={f === "about.body" ? 5 : 2} showCount onChange={(e) => onChange(f, e.target.value)} />
                ) : (
                  <TextField label={c.fieldNames[f]} value={value} maxLength={max} showCount onChange={(e) => onChange(f, e.target.value)} />
                )}
                {aiAvailable ? (
                  <div>
                    <Button variant="ghost" size="sm" iconStart={Sparkles} loading={rewriting === f} disabled={!!rewriting || editsLeft <= 0} onClick={() => onRewrite(f)} aria-label={c.rewriteLabel(c.fieldNames[f])}>
                      {rewriting === f ? c.rewriting : c.rewrite}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
