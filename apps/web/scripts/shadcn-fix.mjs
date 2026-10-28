#!/usr/bin/env node
/**
 * Run after every `shadcn add` / `reui add` (pnpm --filter @ll/web shadcn:fix). Idempotent.
 *
 *  1. `import { cn } from "cn"` -> `from "@/lib/utils"`: the CLI imports the stock `cn` package, which does not know our token
 *     names (`text-meta text-fg` would drop `text-meta`). `@/lib/utils` is the same package configured with them.
 *  2. `bg-accent`, `text-accent-foreground` (shadcn's hover surface) -> `bg-hover`, `text-hover-foreground`. In this repo the
 *     Tailwind name `accent` is still the v2 orange until the final sweep (see packages/design-tokens/src/css.ts, COMPAT).
 *     `sidebar-accent` is untouched. The sweep flips this: delete step 2 and rename `hover` back to `accent`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "primitives");
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(n)) files.push(p);
  }
};
walk(root);

let changed = 0;
for (const f of files) {
  const before = readFileSync(f, "utf8");
  const after = before
    .replace(/from "cn"/g, 'from "@/lib/utils"')
    .replace(/(?<![\w-])(bg|text|border|ring|fill|stroke|outline)-accent(-foreground)?(?![\w-])/g, (_m, p, fg) => `${p}-hover${fg ?? ""}`);
  if (after !== before) {
    writeFileSync(f, after);
    changed++;
  }
}
console.log(`shadcn-fix: ${changed} of ${files.length} files updated`);
