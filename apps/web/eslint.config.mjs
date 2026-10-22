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
  globalIgnores([".next/**", ".next-*/**", "out/**", "build/**", "next-env.d.ts", "e2e/screenshots/**", "playwright-report/**", "test-results/**"]),
]);
