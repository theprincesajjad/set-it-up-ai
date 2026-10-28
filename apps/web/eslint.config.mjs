import { plugin as shadcn } from "@shadcn/lint";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Raw palette / Tailwind default colours are for marketing + illustration only
// (docs/design/system.md §0). Enforced in the shared component library.
const rawColour =
  "/\\b(bg|text|border|fill|stroke|ring|outline|from|to|via)-((gray|slate|zinc|neutral|red|green|blue|yellow|pine|marigold|brick|stone|leaf|ochre|cherry|lake)-\\d{2,4}|white|black)\\b/";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=${rawColour}]`,
          message: "Use semantic token utilities (bg-surface, text-fg, bg-brand...) in components/ui, not raw palette or Tailwind default colours.",
        },
      ],
    },
  },
  // v3 guardrails (docs/design/v3-strategy.md 8.2 A step 4). The final sweep made no-raw-colors an error (the tree is clean); the other two stay warnings.
  // The generated shadcn primitives are exempt: they are copy-and-own output (components.json aliases.ui) and use arbitrary values.
  // themeImports makes the tokens in @ll/design-tokens/theme.css (bg-background, text-points-text, rounded-card ...) count as ours.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/primitives/**"],
    plugins: { shadcn },
    settings: { shadcn: { themeImports: ["^@ll/design-tokens/"], note: "Tokens: docs/design/v3-strategy.md s5" } },
    rules: {
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "warn",
      "shadcn/no-inline-styles": "warn",
    },
  },
  globalIgnores([".next/**", ".next-*/**", "out/**", "build/**", "next-env.d.ts", "e2e/screenshots/**", "playwright-report/**", "test-results/**"]),
]);
