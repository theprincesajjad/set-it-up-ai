"use client";
import { useEffect } from "react";

/** Scrolls to an element on load, for `?for=restaurant` links that carry no #hash. Respects reduced motion. */
export function ScrollTo({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || window.location.hash) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [id]);
  return null;
}
