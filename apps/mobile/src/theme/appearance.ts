/**
 * Which look the app wears (docs/design/v3.2-clear.md, "Product decisions"):
 * - Clear is the default for every shop and customer. It is light, and graphite dark is opt-in only: the OS setting never turns it on.
 * - Main Street Warm stays selectable and keeps its own behaviour (follows the OS unless a scheme is forced).
 * - The web keeps the choice per shop (counter, owner screens) and per user (customer); a choice made on this device wins over both.
 *
 * Pure module (no react-native import): `appearance.test.ts` covers the resolution and the parsing of server values.
 */
export type ThemeStyle = "clear" | "warm";
export type SchemeName = "light" | "dark";
/** "system" only means something for Warm; Clear treats it as light. */
export type SchemeChoice = "system" | SchemeName;

export interface AppearancePref {
  style?: ThemeStyle | null;
  scheme?: SchemeChoice | null;
}

export interface AppearanceInputs {
  /** Chosen on this device (Settings). */
  device?: AppearancePref | null;
  /** The signed-in user's setting from the API (customer app). */
  user?: AppearancePref | null;
  /** The shop's setting from the API (counter and owner screens). */
  shop?: AppearancePref | null;
  /** What the OS reports (only Warm listens to it). */
  os?: SchemeName | null;
}

export interface Appearance {
  style: ThemeStyle;
  scheme: SchemeName;
}

export const DEFAULT_STYLE: ThemeStyle = "clear";

/** Device beats user beats shop; nothing set means Clear. The scheme comes from the same layer as the style when it has one. */
export function resolveAppearance({ device, user, shop, os }: AppearanceInputs): Appearance {
  const layers = [device, user, shop].filter((l): l is AppearancePref => !!l);
  const style = layers.find((l) => l.style)?.style ?? DEFAULT_STYLE;
  const choice = layers.find((l) => l.scheme)?.scheme ?? "system";
  return { style, scheme: schemeFor(style, choice, os ?? null) };
}

/** Clear: dark only when chosen explicitly. Warm: a forced scheme, otherwise the OS. */
export function schemeFor(style: ThemeStyle, choice: SchemeChoice, os: SchemeName | null): SchemeName {
  if (choice === "dark" || choice === "light") return choice;
  if (style === "clear") return "light";
  return os === "dark" ? "dark" : "light";
}

export function parseStyle(v: unknown): ThemeStyle | null {
  return v === "clear" || v === "warm" ? v : null;
}

export function parseScheme(v: unknown): SchemeChoice | null {
  return v === "light" || v === "dark" || v === "system" ? v : null;
}

/**
 * Reads a theme setting off an API payload: the shop's `themeStyle` + `themeDark` (MerchantProfile, MerchantBriefDto) and, for a
 * user setting the API may add later, `themeStyle` / `theme_style` and `themeScheme` / `theme` / `colorScheme`, at the top level or
 * under `settings` or `merchant`.
 */
export function appearanceFromPayload(payload: unknown): AppearancePref | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const nested = [o, o.settings, o.merchant, o.preferences].filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  let style: ThemeStyle | null = null;
  let scheme: SchemeChoice | null = null;
  let darkFlag: boolean | null = null;
  for (const n of nested) {
    style ??= parseStyle(n.themeStyle) ?? parseStyle(n.theme_style);
    scheme ??= parseScheme(n.themeScheme) ?? parseScheme(n.theme_scheme) ?? parseScheme(n.colorScheme) ?? parseScheme(n.theme);
    if (darkFlag == null && typeof n.themeDark === "boolean") darkFlag = n.themeDark;
  }
  // The shop setting (merchants.theme_dark) is graphite dark for Clear only; Warm ignores it and follows the device.
  if (scheme == null && darkFlag != null && style !== "warm") scheme = darkFlag ? "dark" : "light";
  return style || scheme ? { style, scheme } : null;
}

/** The persisted device choice, tolerant of anything a previous build wrote. */
export function parseStoredPref(raw: unknown): AppearancePref {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return { style: parseStyle(o.style), scheme: parseScheme(o.scheme) };
}
