#!/usr/bin/env node
/**
 * Customer-facing strings must go through t() (packages/shared/src/i18n) so they exist in en/hi/ur/pa.
 * This scans the customer-facing source for user-visible string literals that do not, using the TypeScript parser:
 *
 *   - JSX text, and JSX attributes a person reads or hears (label, title, placeholder, aria-label, accessibilityLabel ...)
 *   - strings inside `{...}` JSX children (ternaries, &&, ||, ??, template literals)
 *   - object properties a UI reads (label, title, message, subtitle, hint, description, body ...)
 *   - any other string literal that reads like an English sentence (capitalised, two or more words)
 *   - imports of the English-only copy libraries (apps/*\/src/copy/en-CA) in screens
 *
 * Run: `node scripts/l10n-scan.mjs` (or `pnpm l10n:scan`). Exit 1 and a file:line list when something is found.
 * Allow a line with a trailing `// l10n-ok: <why>` (a proper name, a debug label, a value that is not shown).
 * Brand names and symbols are allowed anywhere (BRAND_WORDS below).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories and files (relative to the repo root) that a customer can see. A directory is scanned recursively. */
export const SCAN_TARGETS = [
  // Mobile: customer screens, sheets and the shared UI pieces they use
  "apps/mobile/src/app/(tabs)",
  "apps/mobile/src/app/book",
  "apps/mobile/src/app/dropoff",
  "apps/mobile/src/app/tiffin",
  "apps/mobile/src/app/events",
  "apps/mobile/src/app/catering",
  "apps/mobile/src/app/banquet",
  "apps/mobile/src/app/quote",
  "apps/mobile/src/app/order-ahead",
  "apps/mobile/src/app/shop",
  "apps/mobile/src/app/appointments",
  "apps/mobile/src/app/campaigns",
  "apps/mobile/src/app/orders",
  "apps/mobile/src/app/tickets",
  "apps/mobile/src/app/e",
  "apps/mobile/src/app/j",
  "apps/mobile/src/app/q",
  "apps/mobile/src/app/s",
  "apps/mobile/src/app/(auth)",
  "apps/mobile/src/app/card.tsx",
  "apps/mobile/src/app/discount.tsx",
  "apps/mobile/src/app/history.tsx",
  "apps/mobile/src/app/home.tsx",
  "apps/mobile/src/app/notifications.tsx",
  "apps/mobile/src/app/qr.tsx",
  "apps/mobile/src/app/redeem.tsx",
  "apps/mobile/src/app/referrals.tsx",
  "apps/mobile/src/app/rewards.tsx",
  "apps/mobile/src/app/settings",
  "apps/mobile/src/features/customer",
  "apps/mobile/src/features/restaurant",
  "apps/mobile/src/features/SessionExpiredSheet.tsx",
  "apps/mobile/src/ui",
  // Web: the public (pass) pages and their components
  "apps/web/src/app/(pass)",
  "apps/web/src/components/pass",
  "apps/web/src/components/restaurant",
  // Web UI pieces a customer sees (the rest of components/ui is shared with the shop dashboard)
  "apps/web/src/components/ui/StampCard.tsx",
  "apps/web/src/components/ui/PointsRing.tsx",
  "apps/web/src/components/ui/MemberQr.tsx",
  "apps/web/src/components/ui/QrCode.tsx",
  "apps/web/src/components/ui/OrderTracker.tsx",
  "apps/web/src/components/ui/PromoCard.tsx",
  "apps/web/src/components/ui/RedeemCode.tsx",
  "apps/web/src/components/ui/RewardCard.tsx",
  "apps/web/src/components/ui/ShopTile.tsx",
  "apps/web/src/components/ui/TextField.tsx",
  "apps/web/src/components/ui/Timeline.tsx",
  "apps/web/src/components/ui/Keypad.tsx",
  "apps/web/src/components/ui/DiscountCard.tsx",
  "apps/web/src/components/ui/Badge.tsx",
  "apps/web/src/components/ui/Link.tsx",
  "apps/web/src/components/ui/Modal.tsx",
  "apps/web/src/components/ui/EmptyState.tsx",
];

/** Staff-only screens that live inside a customer directory (the counter has its own staff-language setting). */
export const EXCLUDE = new Set(["apps/mobile/src/app/(auth)/staff-sign-in.tsx"]);

/** Words that are brand names or fixed tokens, never translated (case-sensitive). */
export const BRAND_WORDS = new Set([
  "Stripe", "WhatsApp", "Google", "Apple", "Maps", "Wallet", "Local", "Loyalty", "Interac", "Visa", "Mastercard", "Amex", "Discover",
  "QR", "STOP", "HST", "GST", "PIN", "OTP", "SMS", "ID", "PDF", "CSV", "OK", "AM", "PM", "Instagram", "Facebook", "TikTok", "MapLibre",
  "OpenStreetMap", "CARTO", "OpenFreeMap", "MapTiler", "iOS", "Android", "Expo", "URL", "FAQ", "KB", "MB", "UTC", "ET",
]);

const UI_ATTRS = new Set([
  "aria-label", "aria-description", "aria-placeholder", "aria-roledescription", "accessibilityLabel", "accessibilityHint", "accessibilityValue",
  "placeholder", "title", "alt", "label", "helper", "hint", "error", "message", "subtitle", "caption", "description", "heading", "eyebrow",
  "cta", "ctaLabel", "actionLabel", "emptyTitle", "emptyBody", "body", "text", "tooltip", "headline", "kicker", "sub", "name",
]);
/** Props where a string is data, never copy. */
const NON_UI_ATTRS = new Set([
  "className", "style", "id", "key", "href", "src", "type", "role", "testID", "data-testid", "name", "htmlFor", "value", "defaultValue", "autoComplete",
  "autoCapitalize", "keyboardType", "inputMode", "variant", "tone", "size", "color", "icon", "route", "pathname", "target", "rel", "method",
  "accessibilityRole", "returnKeyType", "textContentType", "resizeMode", "contentFit", "mode", "kind", "to", "as", "lang", "dir", "locale", "dataSet",
]);
// "name" is a UI prop on some components (Avatar) and data on inputs; treat it as data.
UI_ATTRS.delete("name");

const UI_KEYS = new Set([
  "label", "title", "message", "subtitle", "hint", "placeholder", "description", "body", "caption", "heading", "headline", "eyebrow", "cta", "text",
  "accessibilityLabel", "accessibilityHint", "ariaLabel", "tooltip", "emptyTitle", "emptyBody", "helper", "sub", "blurb", "cta",
]);

/** Multi-word brand names, removed before the word check. */
export const BRAND_PHRASES = ["App Store", "Google Play", "Apple Wallet", "Google Wallet", "Apple Pay", "Google Pay", "Diners Club", "Local Loyalty", "Google Maps", "Apple Maps"];

const BRAND_LOWER = new Set([...BRAND_WORDS].map((w) => w.toLowerCase()));

function hasLetters(s) {
  // A catalog key ("ui.order.stepSent") is the opposite of hard-coded text.
  if (/^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(s.trim())) return false;
  const stripped = s
    .replace(/\{[^}]*\}/g, " ") // {placeholders}
    .replace(/\$\{[^}]*\}/g, " ")
    .replace(/https?:\/\/\S*/g, " ") // URLs are not copy
    .replace(new RegExp(BRAND_PHRASES.join("|"), "gi"), " ");
  const words = stripped.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  return words.some((w) => w.length >= 2 && !BRAND_LOWER.has(w.toLowerCase()));
}

/** A string that reads like English prose: starts with a capital, two or more words, mostly letters. */
function looksLikeProse(s) {
  const t = s.trim();
  if (t.length < 6 || !/^[A-Z]/.test(t)) return false;
  if (/^[A-Z0-9_ .:/-]+$/.test(t)) return false; // CONSTANT_CASE ids
  if (/[<>{}=\\]|https?:|\.(png|jpg|svg|json|ts|tsx)\b/.test(t)) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
  return words.length >= 2 && hasLetters(t);
}

/**
 * Display helpers that only know English ("120 pts", "3:30 pm", "Open now"). Customer code uses the *L versions
 * (formatL.ts) that take the language; importing the English one is flagged. English branches (`locale === "en"`) keep a
 * `// l10n-ok: English branch` on the import.
 */
export const ENGLISH_HELPERS = new Set([
  "formatPts", "formatShortDate", "formatDate", "formatDayTime", "formatTime", "lockedRewardCopy", "unitLabel", "termWord", "relativeTime",
  "dayGroupLabel", "formatDistance", "hoursRows", "openStatus", "rewardInSentence", "stampsLeft", "expiryLine", "promoEnds", "activityTitle",
  "groupByDay", "pinSubtitle", "heroCopy", "perkHeadline", "shopSubtitle", "formatPoints", "weekRows", "formatHhmm",
]);
const ENGLISH_HELPER_MODULES = /(^|\/)(lib\/)?(award|format|hours|activity|discover|explore|perks|hero|walletRow)$/;

/** Words that mark a template string as a sentence even when it has a single word ("${a} of ${b}"). */
const FUNCTION_WORDS = new Set(["of", "to", "at", "for", "in", "and", "is", "are", "until", "from", "by", "with", "left", "more", "ready", "off"]);

function templateProse(node) {
  const pieces = [node.head.text, ...node.templateSpans.map((sp) => sp.literal.text)];
  const joined = pieces.join(" ");
  if (/https?:|[<>{}=]|\d|px\b/.test(joined)) return null;
  // A sentence: some literal piece holds two or more plain words, or one of the glue words ("of", "to", "ready", ...).
  const isWord = (w) => /^[A-Za-z][A-Za-z'’]+[,.:!?;]?$/.test(w) && !BRAND_LOWER.has(w.toLowerCase().replace(/[,.:!?;]$/, ""));
  for (const piece of pieces) {
    const words = piece.trim().split(/\s+/).filter(Boolean);
    if (!words.length || !words.every((w) => isWord(w) || /^[(),.:;!?-]+$/.test(w))) continue;
    const real = words.filter(isWord);
    if (real.length >= 2 || (real.length === 1 && FUNCTION_WORDS.has(real[0].toLowerCase().replace(/[,.:!?;]$/, "")))) return joined.replace(/\s+/g, " ").trim();
  }
  return null;
}

function isIgnoredLine(lines, line0) {
  return /l10n-ok/.test(lines[line0] ?? "") || /l10n-ok/.test(lines[line0 - 1] ?? "");
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(test|spec|d)\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
}

export function listFiles(root = ROOT, targets = SCAN_TARGETS) {
  const files = [];
  for (const t of targets) {
    const p = path.join(root, t);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files.filter((f) => !EXCLUDE.has(path.relative(root, f))).sort();
}

/** Literal strings reachable from an expression without calling anything: "a", `a`, c ? "a" : "b", x || "a", x && "a", x ?? "a". */
function literalsIn(node, out = []) {
  if (!node) return out;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression?.(node)) return literalsIn(node.expression, out);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push({ text: node.text, node });
  else if (ts.isTemplateExpression(node)) {
    const text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ");
    out.push({ text, node });
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements) literalsIn(el, out);
  } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["join", "filter", "toLowerCase", "toUpperCase", "trim", "concat"].includes(node.expression.name.text)) {
    literalsIn(node.expression.expression, out);
  } else if (ts.isConditionalExpression(node)) {
    literalsIn(node.whenTrue, out);
    literalsIn(node.whenFalse, out);
  } else if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.AmpersandAmpersandToken) {
      literalsIn(node.left, out);
      literalsIn(node.right, out);
    } else if (k === ts.SyntaxKind.PlusToken) {
      literalsIn(node.left, out);
      literalsIn(node.right, out);
    }
  }
  return out;
}

export function scanSource(file, source) {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split("\n");
  const found = [];
  const seen = new Set();
  const add = (node, text, why) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    if (isIgnoredLine(lines, line)) return;
    const k = `${line}:${text}`;
    if (seen.has(k)) return;
    seen.add(k);
    found.push({ file, line: line + 1, text: text.replace(/\s+/g, " ").trim().slice(0, 80), why });
  };

  const visit = (node) => {
    // Imports of the English-only copy library
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /(^|\/)copy\/en-CA$|^@\/copy$/.test(node.moduleSpecifier.text)) {
      const names = [];
      const nb = node.importClause?.namedBindings;
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) names.push((el.propertyName ?? el.name).text);
      if (node.importClause?.name) names.push("default");
      // `copy.consent.<x>Version` is a record id sent with the opt-in, not copy: a file that uses `copy` only for those is fine.
      const onlyVersions = names.length === 1 && names[0] === "copy" && [...source.matchAll(/\bcopy\.[A-Za-z0-9_.]*/g)].every((m) => /^copy\.consent\.[A-Za-z]*Version$/.test(m[0]));
      const bad = onlyVersions ? [] : names.filter((n) => !["CONSENT_VERSIONS", "CopyKey"].includes(n));
      if (bad.length) add(node, `import { ${bad.join(", ")} } from "${node.moduleSpecifier.text}"`, "English-only copy library");
      return;
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && ENGLISH_HELPER_MODULES.test(node.moduleSpecifier.text)) {
      const nb = node.importClause?.namedBindings;
      const bad = nb && ts.isNamedImports(nb) ? nb.elements.filter((el) => ENGLISH_HELPERS.has((el.propertyName ?? el.name).text)).map((el) => (el.propertyName ?? el.name).text) : [];
      if (bad.length) add(node, `import { ${bad.join(", ")} } from "${node.moduleSpecifier.text}"`, "English-only helper (use the *L version)");
      return;
    }
    if (ts.isImportDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;

    if (ts.isJsxText(node)) {
      const text = node.getText(sf).replace(/\s+/g, " ").trim();
      if (text && hasLetters(text)) add(node, text, "JSX text");
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      const init = node.initializer;
      if (init && UI_ATTRS.has(name) && !NON_UI_ATTRS.has(name)) {
        const exprs = ts.isStringLiteral(init) ? [{ text: init.text, node: init }] : ts.isJsxExpression(init) ? literalsIn(init.expression) : [];
        for (const l of exprs) if (hasLetters(l.text)) add(l.node, l.text, `<... ${name}>`);
      }
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const l of literalsIn(node.expression)) if (hasLetters(l.text)) add(l.node, l.text, "JSX child");
    } else if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
      // `text: "bodyStrong"` is a type-style name, not copy: for `text` only a capital or a space marks real words.
      if (key && UI_KEYS.has(key)) for (const l of literalsIn(node.initializer)) if (hasLetters(l.text) && (key !== "text" || (/^[A-Z]|\s/.test(l.text) && !/[\[:-]/.test(l.text)))) add(l.node, l.text, `{ ${key}: ... }`);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (/^(Alert\.alert|alert|confirm|window\.confirm|window\.alert)$/.test(callee)) {
        for (const a of node.arguments) for (const l of literalsIn(a)) if (hasLetters(l.text)) add(l.node, l.text, callee);
      }
      // console.* and Error arguments are not user-visible
      if (/^console\./.test(callee)) return;
    } else if (ts.isThrowStatement(node)) {
      return;
    } else if (ts.isTemplateExpression(node)) {
      const p = node.parent;
      const callee = ts.isCallExpression(p) ? p.expression.getText(sf) : "";
      const attr = ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) ? p.parent.name.getText(sf) : "";
      const key = ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "";
      const skip =
        /^(Error|TypeError|console\.\w+|fetch|require|import|expect|it|test|describe|router\.\w+|Linking\.\w+|api\.\w+|qk\.\w+|track|log|push|replace|String|Number)$/.test(callee) ||
        ts.isTaggedTemplateExpression(p) ||
        (attr && !UI_ATTRS.has(attr)) ||
        /^(key|uri|url|href|id|testID|className|style|path|pathname|queryKey|name|type|kind|status|variant|source)$/.test(key);
      const text = skip ? null : templateProse(node);
      if (text) add(node, text, "English sentence (template)");
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeProse(node.text)) {
      const p = node.parent;
      const isKey = ts.isPropertyAssignment(p) && p.name === node;
      const inDiscouraged = ts.isNewExpression(p) || (ts.isCallExpression(p) && /^(Error|TypeError|console\.\w+|fetch|require|import|expect|it|test|describe)$/.test(p.expression.getText(sf)));
      const isElementAccess = ts.isElementAccessExpression(p);
      const isCompare = ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind);
      if (!isKey && !inDiscouraged && !isElementAccess && !isCompare) add(node, node.text, "English sentence");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export function scan(root = ROOT, targets = SCAN_TARGETS) {
  const out = [];
  for (const f of listFiles(root, targets)) out.push(...scanSource(path.relative(root, f), fs.readFileSync(f, "utf8")));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const only = process.argv.slice(2);
  const hits = scan(ROOT, only.length ? only : SCAN_TARGETS);
  const byFile = new Map();
  for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
  for (const h of hits) console.log(`${h.file}:${h.line}  [${h.why}]  ${h.text}`);
  console.log(`\n${hits.length} untranslated string(s) in ${byFile.size} file(s).`);
  process.exit(hits.length ? 1 : 0);
}
