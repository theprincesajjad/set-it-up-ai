"use client";
/**
 * Kit (wave Q): a shop's brand colour. Swatches first (the trade palette from @ll/design-tokens, already AA-checked), then "Your own
 * colour" (the system colour picker plus a hex box). A live sample shows the colour as customers will see it, resolved by
 * `resolveShopColors` (the same helper the pass, join and booking pages use), and says so in plain words when it had to be deepened for
 * contrast. Lighter than a full HSV picker (the ReUI color-picker is ~100 kB of source; owners pick from swatches 9 times in 10).
 *
 *   <ColorField label="Card colour" value={brandColor} onChange={setBrandColor} />
 *
 * `value` is "#RRGGBB" or null (no brand colour: the trade colour is used). Swatches are 44px radio buttons in a radiogroup.
 */
import { Check, Pipette } from "lucide-react";
import { useId, useState } from "react";
import { normaliseBrandColor, resolveShopColors, tradeFamilies } from "@ll/design-tokens";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface ColorFieldProps {
  label: string;
  value: string | null;
  onChange: (hex: string | null) => void;
  /** The shop's vertical, for the fallback and the sample. */
  vertical?: string | null;
  /** Override the swatch list (hex strings). */
  swatches?: string[];
  className?: string;
}

/** A glyph sample for the contrast preview (aria-hidden, language-neutral). */
const SAMPLE = "Aa 10/10"; // l10n-ok: a glyph sample, aria-hidden

const DEFAULT_SWATCHES = Object.values(tradeFamilies).map((f) => f.accent);

export function ColorField({ label, value, onChange, vertical, swatches = DEFAULT_SWATCHES, className }: ColorFieldProps) {
  const { t } = useLocaleOrEnglish();
  const id = useId();
  const current = normaliseBrandColor(value);
  const [hex, setHex] = useState(current ?? "");
  const [bad, setBad] = useState(false);
  const resolved = resolveShopColors(current, vertical);
  const custom = !!current && !swatches.some((s) => s.toUpperCase() === current.toUpperCase());
  const pick = (c: string | null) => {
    setBad(false);
    setHex(c ?? "");
    onChange(c);
  };
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <span id={`${id}-label`} className="text-body font-[550] text-foreground">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {swatches.map((c) => {
          const on = current?.toUpperCase() === c.toUpperCase();
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c}
              onClick={() => pick(c)}
              className={cn("relative grid size-11 place-items-center rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:focus-ring", on && "ring-2 ring-foreground")}
              style={{ backgroundColor: c }}
            >
              {on ? <Check aria-hidden className="size-5" strokeWidth={3} style={{ color: resolveShopColors(c, vertical).light.foreground }} /> : null}
            </button>
          );
        })}
        <label className={cn("relative grid size-11 cursor-pointer place-items-center rounded-full border border-dashed border-border-strong bg-card text-foreground focus-within:focus-ring", custom && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} style={custom ? { backgroundColor: current! } : undefined}>
          <span className="sr-only">{t("kit.color.custom")}</span>
          <Pipette aria-hidden className="size-4.5" strokeWidth={1.8} style={custom ? { color: resolved.light.foreground } : undefined} />
          <input type="color" value={current ?? swatches[0]} onChange={(e) => pick(normaliseBrandColor(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-hex`} className="text-meta text-muted-foreground">
            {t("kit.color.hex")}
          </label>
          <input
            id={`${id}-hex`}
            dir="ltr"
            value={hex}
            placeholder="#RRGGBB" // l10n-ok: a format, not words
            maxLength={7}
            aria-invalid={bad || undefined}
            aria-describedby={bad ? `${id}-bad` : undefined}
            onChange={(e) => {
              const v = e.target.value.trim();
              setHex(v);
              const n = normaliseBrandColor(v);
              if (n && v.replace("#", "").length === 6) {
                setBad(false);
                onChange(n);
              }
            }}
            onBlur={() => setBad(!!hex && !normaliseBrandColor(hex))}
            className="h-11 w-32 rounded-r3 border border-border bg-card px-3 font-mono text-body uppercase text-foreground focus:border-foreground focus:ring-1 focus:ring-foreground aria-invalid:border-destructive"
          />
        </div>
        <span
          aria-hidden
          className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-body font-[650]"
          style={{ backgroundColor: resolved.light.accent, color: resolved.light.foreground }}
        >
          {SAMPLE}
        </span>
      </div>
      {bad ? (
        <p id={`${id}-bad`} className="text-meta font-medium text-destructive-text">
          {t("kit.color.invalid")}
        </p>
      ) : resolved.source === "brand" && resolved.light.adjusted ? (
        <p className="text-meta text-muted-foreground">{t("kit.color.adjusted")}</p>
      ) : null}
    </div>
  );
}
