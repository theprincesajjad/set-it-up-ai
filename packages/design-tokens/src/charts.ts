import { dark, light } from "./colors.js";
import { palette as p } from "./palette.js";

/**
 * Chart colours (v2): charts are `fg` (thin black line / black bars) with
 * `accent` ONLY for the highlighted series. Light grid, no legends unless two
 * series. Every mark colour is >= 3:1 on `bg` in its theme (tested).
 *
 * - categorical: at most 3 series [fg, accent, fgMuted]. More than 3 → group into "Other".
 * - sequential: neutral ramp for heatmaps (visits by hour/day), light → dark.
 * - you / network: "you" is fg, the network comparison is fgSubtle-ish grey.
 * - status: density gauges / activation progress (dot + word, never a filled card).
 */
export const chartColors = {
  light: {
    categorical: [light.fg, light.accent, light.fgMuted],
    sequential: [p.gray[50], p.gray[100], p.gray[150], "#D4D4D6", p.gray[400], p.gray[600], "#3A3A3F", p.gray[950]],
    line: light.fg,
    highlight: light.accent,
    you: light.fg,
    network: p.gray[450],
    grid: light.line,
    axis: light.fgMuted,
    status: { low: light.negative, building: light.fgMuted, healthy: light.positive },
  },
  dark: {
    categorical: [dark.fg, dark.accent, dark.fgMuted],
    sequential: [p.gray[900], p.gray[850], p.gray[800], "#3A3A3F", p.gray[550], p.gray[650], "#D4D4D6", p.gray[50]],
    line: dark.fg,
    highlight: dark.accent,
    you: dark.fg,
    network: p.gray[500],
    grid: dark.line,
    axis: dark.fgMuted,
    status: { low: dark.negative, building: dark.fgMuted, healthy: dark.positive },
  },
} as const;
