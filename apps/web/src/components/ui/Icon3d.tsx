import type { CSSProperties } from "react";
import "@ll/design-tokens/icons3d.css";
import { ICON3D_VIEWBOX, icon3dFamily, isIcon3dScene, type Icon3dName } from "@ll/design-tokens";
import { cn } from "@/lib/cn";

export interface Icon3dProps {
  name: Icon3dName;
  /** 40 (tiles, share rows), 64 (step cards), 96 (empty states), 120 (hero). Scenes: the width (160 x 120 ratio). */
  size?: number;
  /** A trade family ("rose") or a vertical ("salon"): the accent material takes that family's colour. `"inherit"` reads the surrounding `--trade`. Default: sky. */
  trade?: string | null;
  /** An explicit accent colour (wins over `trade`). */
  accent?: string;
  className?: string;
}

/**
 * A 3D object or spot scene from packages/design-tokens/assets/icons3d (docs/design/onboarding-v1.md section 6). Decorative: aria-hidden, no alt.
 * One sprite serves every trade colour: the accent is set through `--i3d-accent` and the lit, mid and shade tones are derived with color-mix in
 * icons3d.css; dark mode swaps the body tones. For 40 px and up only; 16 to 24 px glyphs stay Lucide.
 */
export function Icon3d({ name, size = 64, trade, accent, className }: Icon3dProps) {
  const scene = isIcon3dScene(name);
  const vb = scene ? ICON3D_VIEWBOX.scene : ICON3D_VIEWBOX.object;
  const height = scene ? Math.round((size * vb.h) / vb.w) : size;
  const inherit = trade === "inherit";
  const style: CSSProperties | undefined = accent
    ? ({ "--i3d-accent-l": accent, "--i3d-accent-d": accent } as CSSProperties)
    : inherit
      ? ({ "--i3d-accent-l": "var(--trade)", "--i3d-accent-d": "var(--trade)" } as CSSProperties)
      : undefined;
  return (
    <svg
      className={cn("i3d pointer-events-none select-none", className)}
      width={size}
      height={height}
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      aria-hidden="true"
      focusable="false"
      data-icon3d={name}
      data-fam={accent || inherit ? undefined : trade ? icon3dFamily(trade) : undefined}
      style={style}
    >
      <use href={`/icons3d/sprite.svg#${name}`} />
    </svg>
  );
}
