/**
 * Dashboard-only building blocks (foundations.md "Merchant dashboard"): calm, hairline,
 * monochrome. Shared by the merchant dashboard, rep console, admin and BIA tools.
 * Generic controls (buttons, fields, dialogs) come from @/components/ui.
 *
 * Barrel over kit/page.tsx (B), kit/data.tsx (C) and kit/forms.tsx (D). No "use client" here on purpose:
 * `export *` is not allowed inside a client boundary file; each kit/ file carries its own directive.
 * Import paths do not change. `pnpm --filter @ll/web check:kit` proves the exported names are identical to before the split.
 */
export * from "./kit/page";
export * from "./kit/data";
export * from "./kit/forms";
