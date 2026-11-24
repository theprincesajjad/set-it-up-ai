"use client";
import { useLayoutEffect, useRef } from "react";

/**
 * The sliding indicator of Tabs and SegmentedControl. The indicator is a span inside the selected item, so the server render and a resize
 * are always right with no measuring. When the selection moves, the new span plays one transform from where the old one sat (FLIP,
 * transform only, 240 ms on the kit's ease-out). Positions are read after layout from the previous item, so a scroll in between is safe.
 * Reduced motion: no slide, the indicator is simply on the new item.
 */
export function useSlideIndicator<T extends HTMLElement = HTMLSpanElement>(activeKey: string) {
  const ref = useRef<T | null>(null);
  const lastParent = useRef<HTMLElement | null>(null);
  const lastKey = useRef(activeKey);
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement ?? null;
    const from = lastParent.current;
    const moved = lastKey.current !== activeKey;
    lastParent.current = parent;
    lastKey.current = activeKey;
    if (!el || !parent || !from || !moved || from === parent || !from.isConnected) return;
    if (typeof el.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const next = el.getBoundingClientRect();
    const host = parent.getBoundingClientRect();
    const prev = from.getBoundingClientRect();
    if (!next.width || !next.height || !prev.width) return;
    // Where the indicator would sit in the previous item: the same insets it has in this one.
    const width = Math.max(1, prev.width - (host.width - next.width));
    const left = host.right - next.right === next.left - host.left ? prev.left + (prev.width - width) / 2 : prev.left + (next.left - host.left);
    const top = prev.top + (next.top - host.top);
    const height = Math.max(1, prev.height - (host.height - next.height));
    el.animate(
      [{ transformOrigin: "0 0", transform: `translate(${left - next.left}px, ${top - next.top}px) scale(${width / next.width}, ${height / next.height})` }, { transformOrigin: "0 0", transform: "none" }],
      { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [activeKey]);
  return ref;
}
