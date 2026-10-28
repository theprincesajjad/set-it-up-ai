#!/usr/bin/env node
/**
 * Proves the kit.tsx split (workstream A) was moves only.
 *
 *   node scripts/check-kit-exports.mjs            compare the barrel to scripts/kit-exports.snapshot.json (CI: pnpm check:kit)
 *   node scripts/check-kit-exports.mjs --write F  (re)write the snapshot from the single-file kit F (the pre-split kit.tsx)
 *   node scripts/check-kit-exports.mjs --write    refresh the snapshot from the split as it stands now (barrel + kit/*.tsx). Refuses when the
 *                                                 exported names differ from the current snapshot: the names are the contract, the body
 *                                                 lines are expected to change as the kit is migrated.
 *
 * Two checks:
 *  1. Exported names: every export of `src/components/dashboard/kit` (value or type, through `export *`) must equal the snapshot.
 *  2. Body lines: the multiset of code lines in kit.tsx + kit/*.tsx, ignoring imports, "use client", comment-only header
 *     blocks, section dividers and blank lines, must equal the snapshot's digest, i.e. nothing was edited, added or dropped.
 *     (Workstreams B, C, D change kit/*.tsx on purpose later: they update the snapshot in the same PR with --write on the new
 *     content, or delete this check once the kit is migrated.)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const kitDir = join(webRoot, "src/components/dashboard");
const snapshotPath = join(webRoot, "scripts/kit-exports.snapshot.json");

function exportedNames(entry) {
  const cfgPath = join(webRoot, "tsconfig.json");
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, webRoot);
  const program = ts.createProgram([entry], { ...parsed.options, noEmit: true, incremental: false });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entry);
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) throw new Error(`no module symbol for ${entry}`);
  return checker
    .getExportsOfModule(mod)
    .map((s) => {
      const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
      const isValue = (target.flags & ts.SymbolFlags.Value) !== 0;
      return `${s.getName()}:${isValue ? "value" : "type"}`;
    })
    .sort();
}

const isDivider = (l) => /^\/\* -{5,}/.test(l);
function codeLines(text) {
  const out = [];
  let inHeader = true;
  let inImport = false;
  for (const raw of text.split("\n")) {
    const l = raw.trimEnd();
    if (inHeader) {
      // file header: "use client", the opening doc comment, imports
      if (l === "" || l === '"use client";' || l.startsWith("/**") || l.startsWith(" *") || l.startsWith("//")) {
        if (!(l.startsWith("/**") && l.includes("*/") && !l.endsWith("/**") && out.length)) continue;
      }
    }
    if (inImport) {
      if (/;\s*$/.test(l)) inImport = false;
      continue;
    }
    if (/^import\s/.test(l)) {
      inHeader = false;
      if (!/;\s*$/.test(l)) inImport = true;
      continue;
    }
    if (l === "" || isDivider(l) || /^export \* from /.test(l)) continue;
    inHeader = false;
    out.push(l);
  }
  return out;
}

function bodyDigest() {
  const files = [join(kitDir, "kit.tsx"), ...readdirSync(join(kitDir, "kit")).filter((f) => /\.tsx?$/.test(f)).sort().map((f) => join(kitDir, "kit", f))];
  // Whole-file comment headers of the split files describe the split itself, so drop a leading comment block in kit/*.
  const lines = files.flatMap((f) => codeLines(readFileSync(f, "utf8")));
  return digest(lines);
}
function digest(lines) {
  const sorted = [...lines].sort();
  return { count: sorted.length, sha256: createHash("sha256").update(sorted.join("\n")).digest("hex") };
}

const wIdx = process.argv.indexOf("--write");
if (wIdx !== -1) {
  const orig = process.argv[wIdx + 1];
  if (!orig || orig.startsWith("--")) {
    const old = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const now = exportedNames(join(kitDir, "kit.tsx"));
    const missing = old.exports.filter((n) => !now.includes(n));
    const extra = now.filter((n) => !old.exports.includes(n));
    if (missing.length || extra.length) {
      console.error(`export names changed, not refreshing. missing: [${missing.join(", ")}] extra: [${extra.join(", ")}]`);
      process.exit(1);
    }
    const body = bodyDigest();
    writeFileSync(snapshotPath, JSON.stringify({ source: "dashboard/kit.tsx barrel + kit/*.tsx, refreshed in the v3 final sweep (export names verified unchanged)", exports: now, body }, null, 2) + "\n");
    console.log(`snapshot refreshed: ${now.length} exports unchanged, ${body.count} body lines`);
    process.exit(0);
  }
  if (!existsSync(orig)) throw new Error("--write needs the path of the single-file kit.tsx, or no path to refresh from the split");
  // The exports are read from a program whose entry is the original file placed next to the real kit dir.
  const tmp = join(kitDir, "__kit_orig.tsx");
  writeFileSync(tmp, readFileSync(orig, "utf8"));
  try {
    const exports = exportedNames(tmp);
    const body = digest(codeLines(readFileSync(orig, "utf8")));
    writeFileSync(snapshotPath, JSON.stringify({ source: "single-file dashboard/kit.tsx before the A split", exports, body }, null, 2) + "\n");
    console.log(`snapshot written: ${exports.length} exports, ${body.count} body lines`);
  } finally {
    rmSync(tmp, { force: true });
  }
} else {
  const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const now = exportedNames(join(kitDir, "kit.tsx"));
  const missing = snap.exports.filter((n) => !now.includes(n));
  const extra = now.filter((n) => !snap.exports.includes(n));
  const body = bodyDigest();
  let ok = true;
  if (missing.length || extra.length) {
    ok = false;
    console.error(`kit exports differ. missing: [${missing.join(", ")}] extra: [${extra.join(", ")}]`);
  } else console.log(`exports identical: ${now.length} names (${now.filter((n) => n.endsWith(":value")).length} values, ${now.filter((n) => n.endsWith(":type")).length} types)`);
  if (body.sha256 !== snap.body.sha256) {
    ok = false;
    console.error(`kit body lines differ from the snapshot (snapshot ${snap.body.count}, now ${body.count}): the split is not moves only`);
  } else console.log(`body lines identical: ${body.count} code lines moved, none edited`);
  process.exit(ok ? 0 : 1);
}
