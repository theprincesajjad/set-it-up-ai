/**
 * The v3 colour roles for native (docs/design/v3-strategy.md section 5.1), read from `@ll/design-tokens` so web and native
 * cannot drift. Names are the shadcn names the web CSS uses (`background`, `mutedForeground`, `points`, `pointsText`, `paper` ...);
 * `Theme.c` keeps the v2 names (aliases of these) until the final sweep. Pure module: no react-native import, so it is unit-tested
 * (`roles.test.ts` proves every value equals the generated web CSS).
 */
import { rolesV3, type RolesV3 } from "@ll/design-tokens";

export type SchemeName = "light" | "dark";
export type { RolesV3 };

/** v3 roles for a scheme. */
export function rolesFor(scheme: SchemeName): RolesV3 {
  return rolesV3[scheme];
}

/** camelCase role name to its CSS custom property: `pointsText` is `--points-text`. */
export function cssVarFor(role: keyof RolesV3): string {
  return `--${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}
