import { palette as p } from "./palette.js";

/**
 * Chart colours (merchant dashboard reports, admin gauges).
 *
 * - categorical: up to 6 series, in this order. Every colour is >= 3:1 against
 *   `surface` in its theme (tested). Beyond 6 series, group into "Other".
 *   Never rely on colour alone: direct-label lines, add legends with shapes.
 * - sequential: single-hue pine ramp for heatmaps (visits by hour/day).
 * - status: for density gauges and activation progress.
 * - "network" vs "you": comparisons always use brand (you) vs stone (network).
 */
export const chartColors = {
  light: {
    categorical: [p.pine[600], p.brick[500], p.lake[600], "#7A4FA3", p.ochre[600], p.stone[600]],
    sequential: [p.pine[50], p.pine[100], p.pine[200], p.pine[300], p.pine[400], p.pine[500], p.pine[600], p.pine[800]],
    you: p.pine[600],
    network: p.stone[500],
    grid: p.stone[200],
    axis: p.stone[600],
    status: { low: p.cherry[600], building: p.ochre[600], healthy: p.leaf[600] },
  },
  dark: {
    categorical: [p.pine[300], p.brick[300], p.lake[300], "#C2A3E0", p.ochre[300], p.stone[300]],
    sequential: [p.pine[950], p.pine[900], p.pine[800], p.pine[700], p.pine[600], p.pine[500], p.pine[400], p.pine[300]],
    you: p.pine[300],
    network: p.stone[500],
    grid: p.stone[800],
    axis: p.stone[400],
    status: { low: p.cherry[400], building: p.ochre[400], healthy: p.leaf[400] },
  },
} as const;
