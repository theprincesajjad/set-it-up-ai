#!/usr/bin/env node
/**
 * Run after every `shadcn add` / `reui add` (pnpm --filter @ll/web shadcn:fix). Idempotent.
 *
 *  `import { cn } from "cn"` -> `from "@/lib/utils"`: the CLI imports the stock `cn` package, which does not know our token names
 *  (`text-meta text-fg` would drop `text-meta`). `@/lib/utils` is the same package configured with them.
 *
 * There is no longer an `accent` -> `hover` step. Since the v3 sweep `--color-accent` IS shadcn's hover surface (design-tokens css.ts), so
 * `bg-accent` and `text-accent-foreground` from the registry mean what they mean everywhere else; the old orange is `bg-points`.
 * `hover` stays as an alias (`bg-hover`) for the call sites that already use it. It only warns when a registry file still carries the
 * v2 orange names, so a stale copy does not slip in.
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
  const after = before.replace(/from "cn"/g, 'from "@/lib/utils"');
  if (/(?<![\w-])(bg|text|border|ring)-(accent-text|accent-soft|on-accent)(?![\w-])/.test(after)) console.warn(`shadcn-fix: ${f} uses a v2 orange name (accent-text, accent-soft, on-accent); use points-text, points-soft, points-foreground`);
  if (after !== before) {
    writeFileSync(f, after);
    changed++;
  }
}
console.log(`shadcn-fix: ${changed} of ${files.length} files updated`);
