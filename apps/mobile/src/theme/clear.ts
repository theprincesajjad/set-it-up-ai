/**
 * Clear theme tokens for native (docs/design/v3.2-clear.md rev 5, layout from v3.2-clear-audit.md section 2).
 *
 * Values come from `@ll/design-tokens` (src/clear.ts, the foundation team's export, same numbers as the web CSS); this module only
 * adapts them to what native needs: the v2 role names, opaque chip fills, the glass with its Reduce Transparency set and the
 * expo-blur tint, and the phone sizes.
 *
 * Pure module (no react-native import) so it is unit-tested in Node (`clear.test.ts`).
 */
import {
  clearExtra as pkgExtra,
  clearExtraSolid as pkgExtraSolid,
  clearGlass as pkgGlass,
  clearGlassSolid as pkgGlassSolid,
  clearLayout as pkgLayout,
  clearRoles as pkgRoles,
  clearTradeColors as pkgTradeColors,
  colors,
  type ColorRoles,
  type RolesV3,
  type TradeColors,
  type TradeFamily,
} from "@ll/design-tokens";

export type SchemeName = "light" | "dark";

/** Clear-only roles that RolesV3 has no name for (spec 2.2, 2.5 and the rev 5 mock `:root`), as native needs them. */
export interface ClearExtras {
  /** Apple link blue: links, the active tab label, selected-row text. */
  link: string;
  borderStrong: string;
  /** Opaque on native (no compositing surprises over glass). */
  successSoft: string;
  warningSoft: string;
  destructiveSoft: string;
  destructiveText: string;
  /** Neutral icon tile (rows with no trade). */
  tile: string;
  tileForeground: string;
  chartMuted: string;
  /** The current bar: the trade colour. */
  chartHi: string;
  scrim: string;
  toastBg: string;
  toastFg: string;
  /** Card elevation (CSS box-shadow, also valid for RN `boxShadow`). The hairline is drawn as an inset ring, so it takes no layout. */
  shadowCard: string;
}

/** Every v3 role in Clear (light, graphite dark), from @ll/design-tokens. */
export const clearRoles: Record<SchemeName, RolesV3> = pkgRoles;

const extras = (s: SchemeName): ClearExtras => ({
  link: pkgExtra[s].link,
  borderStrong: pkgExtra[s].borderStrong,
  successSoft: pkgExtraSolid[s].successSoft,
  warningSoft: pkgExtraSolid[s].warningSoft,
  destructiveSoft: pkgExtraSolid[s].destructiveSoft,
  destructiveText: pkgExtra[s].destructiveText,
  tile: pkgExtra[s].tile,
  tileForeground: pkgRoles[s].tilePeachForeground,
  chartMuted: pkgExtra[s].chartMuted,
  chartHi: pkgExtra[s].chartHi,
  scrim: pkgExtra[s].scrim,
  toastBg: pkgExtra[s].toastBg,
  toastFg: pkgExtra[s].toastFg,
  shadowCard: pkgGlass[s].shadowCard,
});

export const clearExtras: Record<SchemeName, ClearExtras> = { light: extras("light"), dark: extras("dark") };

/**
 * The trade family in Clear as the `TradeColors` shape the app already reads: one accent, no gradient (`passFrom` = `passTo`), and
 * `soft` the accent at 14% over the card for the icon tiles.
 */
export function clearTradeColors(family: TradeFamily, scheme: SchemeName): TradeColors {
  const t = pkgTradeColors(family, scheme);
  return { accent: t.accent, foreground: t.foreground, alt: t.alt, soft: t.soft, deep: t.deep, passFrom: t.passFrom, passMid: t.passFrom, passTo: t.passTo, passText: t.passText };
}

/** Liquid Glass roles (spec 2.8), plus what native needs to draw them, and the opaque set used under Reduce Transparency. */
export interface ClearGlass {
  fill: string;
  fillStrong: string;
  lift: string;
  edge: string;
  inner: string;
  rimA: string;
  rimB: string;
  rimC: string;
  segTrack: string;
  /** CSS box-shadow lists (also valid RN `boxShadow` on the new architecture and react-native-web). */
  shadow: string;
  shadowLg: string;
  blur: number;
  blurStrong: number;
  saturate: number;
  /** expo-blur tint for the material behind the fill. */
  tint: "systemChromeMaterialLight" | "systemChromeMaterialDark";
  /** expo-blur intensity (0 to 100) that matches `blur` px on iOS. */
  intensity: number;
  /** True when the set is the opaque Reduce Transparency fallback (no blur, no rim). */
  solid: boolean;
}

export function clearGlass(scheme: SchemeName, reduceTransparency = false): ClearGlass {
  const g = pkgGlass[scheme];
  const base: ClearGlass = {
    fill: g.fill,
    fillStrong: g.fillStrong,
    lift: g.lift,
    edge: g.edge,
    inner: g.inner,
    rimA: g.rimA,
    rimB: g.rimB,
    rimC: g.rimC,
    segTrack: g.segTrack,
    shadow: g.shadow,
    shadowLg: g.shadowLg,
    blur: g.blur,
    blurStrong: g.blurStrong,
    saturate: g.sat,
    tint: scheme === "light" ? "systemChromeMaterialLight" : "systemChromeMaterialDark",
    intensity: 70,
    solid: false,
  };
  if (!reduceTransparency) return base;
  const o = pkgGlassSolid[scheme];
  return {
    ...base,
    fill: String(o.fill ?? base.fill),
    fillStrong: String(o.fillStrong ?? base.fillStrong),
    lift: String(o.lift ?? base.lift),
    inner: "transparent",
    rimA: "transparent",
    rimB: "transparent",
    rimC: "transparent",
    blur: 0,
    blurStrong: 0,
    saturate: 1,
    intensity: 0,
    solid: true,
  };
}

/**
 * v2 role names (`Theme.c`) for Clear, built from the Clear roles the same way colors.ts builds Warm's, so every screen that
 * still reads `c.brand`, `c.accentText` or `c.line` restyles with the theme.
 */
export function clearColorRoles(scheme: SchemeName): ColorRoles {
  const r = clearRoles[scheme];
  const x = clearExtras[scheme];
  const base = colors[scheme];
  return {
    ...base,
    bg: r.background,
    bgSubtle: r.muted,
    bgMuted: r.accent,
    fg: r.foreground,
    fgMuted: r.mutedForeground,
    fgSubtle: r.subtleForeground,
    line: r.border,
    lineStrong: r.input,
    accent: r.points,
    accentText: r.pointsText,
    accentSoft: r.pointsSoft,
    onAccent: r.pointsForeground,
    positive: r.success,
    positiveText: r.successText,
    negative: r.destructive,
    location: r.info,
    chrome: scheme === "light" ? "rgba(242,242,247,0.80)" : "rgba(0,0,0,0.80)",
    overlay: x.scrim,
    qrFg: r.qrFg,
    qrBg: r.qrBg,
    canvas: r.background,
    canvasSubtle: r.muted,
    surface: r.card,
    surfaceRaised: r.card,
    surfaceSunken: r.muted,
    surfaceInverse: r.foreground,
    fgInverse: r.background,
    fgLink: x.link,
    fgDisabled: r.subtleForeground,
    border: r.border,
    borderStrong: x.borderStrong,
    focusRing: r.ring,
    brand: r.primary,
    brandHover: scheme === "light" ? "#000000" : "#FFFFFF",
    brandPressed: scheme === "light" ? "#000000" : "#E5E5EA",
    onBrand: r.primaryForeground,
    brandSubtle: r.accent,
    onBrandSubtle: r.foreground,
    fgBrand: r.foreground,
    accentHover: r.points,
    accentSubtle: r.pointsSoft,
    onAccentSubtle: r.pointsText,
    neutralSubtle: r.accent,
    onNeutralSubtle: r.mutedForeground,
    success: r.success,
    onSuccess: scheme === "light" ? "#FFFFFF" : "#000000",
    successSubtle: x.successSoft,
    onSuccessSubtle: r.successText,
    warning: r.warning,
    onWarning: "#000000",
    warningSubtle: x.warningSoft,
    onWarningSubtle: r.warningText,
    danger: r.destructive,
    dangerHover: r.destructive,
    onDanger: "#FFFFFF",
    dangerSubtle: r.muted,
    onDangerSubtle: r.foreground,
    info: r.info,
    onInfo: "#FFFFFF",
    infoSubtle: r.infoSoft,
    onInfoSubtle: r.infoText,
    disabledBg: r.muted,
    onDisabled: r.mutedForeground,
    skeleton: r.accent,
    skeletonHighlight: r.muted,
    stampEmpty: x.borderStrong,
    ringTrack: r.muted,
  };
}

/** The shared layout scale (audit 2.2 to 2.4) from @ll/design-tokens. */
export const clearLayout = pkgLayout;

/**
 * Phone sizes the native screens use (audit 2.1 and 2.4 at 390): one 16 margin, 2 columns of 171 with a 16 gutter, and the
 * component boxes. Numbers only; components read them so a measurement drift is a one-line fix.
 */
export const clearPhone = {
  margin: pkgLayout.grid.phone.margin,
  gutter: pkgLayout.grid.phone.gutter,
  column: pkgLayout.grid.phone.column,
  /** Phone page top: capsule bottom 56 + 16. */
  bodyTop: 72,
  row: { two: pkgLayout.card.row, one: pkgLayout.card.rowSingle, needs: 92, tile: pkgLayout.statCard.phone.tile, tileRadius: pkgLayout.statCard.phone.tileRadius },
  statPhone: { height: pkgLayout.statCard.phone.height, padding: 16, tile: pkgLayout.statCard.phone.tile, tileRadius: pkgLayout.statCard.phone.tileRadius },
  tabBar: { height: pkgLayout.tabBar.height, radius: pkgLayout.tabBar.radius, inset: pkgLayout.tabBar.inset, insetInline: 5, tab: pkgLayout.tabBar.tab, tabRadius: pkgLayout.tabBar.tabRadius },
  capsule: { height: 44, radius: 22, mark: 32 },
  cta: { frame: 64, radius: 26, inset: 4, button: 56, buttonRadius: 22 },
  mapSheet: { height: 384, radius: 32 },
  pass: { radius: 30, padding: 20, stamp: 54, stampGap: 12, mark: 40 },
  counter: { bar: 64, dock: 96, key: 56, keyRadius: 12, dockButtonRadius: 16 },
} as const;
