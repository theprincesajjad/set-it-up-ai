import { createCn } from "cn/config";

/**
 * `cn` for components/primitives and new code: joins like clsx AND resolves Tailwind conflicts (the shadcn
 * `cn` package, configured with our token names so `text-meta text-fg` keeps both and `bg-fg bg-points` keeps the later one).
 *
 * The legacy `cn` in `@/lib/cn` only joins (no conflict resolution) and is what the ~300 existing call sites use, so
 * their rendering cannot change. Use this one in primitives and in wrappers that override primitive classes.
 * `apps/web/test/cn-config.test.ts` fails when a token is added to theme.css and not listed here.
 */
const colors = [
    "background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary",
    "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "destructive", "border",
    "input", "ring", "subtle-foreground", "sidebar", "sidebar-foreground", "sidebar-primary",
    "sidebar-primary-foreground", "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
    "points", "points-text", "points-soft", "points-foreground", "success", "success-text", "info", "info-text",
    "info-soft", "warning", "warning-text", "paper", "hover", "hover-foreground", "accent-foreground", "bg",
    "bg-subtle", "bg-muted", "fg", "fg-muted", "fg-subtle", "line", "line-strong", "accent", "accent-text",
    "accent-soft", "on-accent", "positive", "negative", "location", "qr-fg", "qr-bg", "positive-text", "chrome",
    "overlay", "canvas", "canvas-subtle", "surface", "surface-raised", "surface-sunken", "surface-inverse",
    "fg-inverse", "fg-link", "fg-disabled", "border-strong", "focus-ring", "brand", "brand-hover", "brand-pressed",
    "on-brand", "brand-subtle", "on-brand-subtle", "fg-brand", "accent-hover", "accent-subtle", "on-accent-subtle",
    "neutral-subtle", "on-neutral-subtle", "on-success", "success-subtle", "on-success-subtle", "on-warning",
    "warning-subtle", "on-warning-subtle", "danger", "danger-hover", "on-danger", "danger-subtle", "on-danger-subtle",
    "on-info", "info-subtle", "on-info-subtle", "disabled-bg", "on-disabled", "skeleton", "skeleton-highlight",
    "stamp-empty", "ring-track", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-seq-1", "chart-seq-2",
    "chart-seq-3", "chart-seq-4", "chart-seq-5", "chart-seq-6", "chart-seq-7", "chart-seq-8", "chart-line",
    "chart-highlight", "chart-you", "chart-network", "chart-grid", "chart-axis", "chart-status-low",
    "chart-status-building", "chart-status-healthy",
] as const;

const textSizes = [
    "caption", "meta", "meta-strong", "body", "body-strong", "headline", "title", "large-title", "display-number",
    "place-name", "place-subtitle", "map-label", "category-label", "hero", "display", "h1", "h2", "h3", "body-lg",
    "body-sm", "label", "overline", "points", "counter-hero", "keypad", "stat", "code",
] as const;

export const cn = createCn({
  extend: {
    theme: {
      // Palette colours (`bg-ll-gray-950`) and the deprecated vertical tints are matched by prefix.
      color: [...colors, (v: string) => v.startsWith("ll-") || v.startsWith("vertical-")],
      text: [...textSizes],
      radius: ["input", "card", "sheet"],
      shadow: ["float", "sheet"],
    },
  },
});

export { colors as tokenColors, textSizes as tokenTextSizes };
