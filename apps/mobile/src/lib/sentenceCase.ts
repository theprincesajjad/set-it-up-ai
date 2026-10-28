import type { ReactNode } from "react";

/** Uppercase the first letter of a plain string (the shared messages are lowercase; the warm voice is sentence case). */
export function capFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
}

/** Sentence-case a Text's children when they are one plain string (or the first of an array); anything else passes through. */
export function sentenceCase(children: ReactNode): ReactNode {
  if (typeof children === "string") return capFirst(children);
  if (Array.isArray(children) && typeof children[0] === "string") return [capFirst(children[0]), ...children.slice(1)];
  return children;
}
