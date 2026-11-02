"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Ref } from "react";

type TextLike = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function assign<T>(ref: Ref<T> | undefined, el: T | null) {
  if (typeof ref === "function") ref(el);
  else if (ref) (ref as { current: T | null }).current = el;
}

const noSubscribe = () => () => {};

/**
 * Textareas need one more step. React's textarea hydration (initTextarea) writes the server-rendered text back into `value` before
 * any ref or effect runs, so by mount the typed text is gone and there is nothing left to adopt (inputs keep theirs). This module
 * loads before the components that import it hydrate, so it records what was typed into a not-yet-hydrated textarea (by id): the
 * ones already edited when it loads, and every later keystroke until React attaches. The mount effect puts that text back.
 */
const typedTextareas = new Map<string, string>();
const reactAttached = (node: Element) => Object.keys(node).some((k) => k.startsWith("__reactProps"));
if (typeof document !== "undefined") {
  for (const t of Array.from(document.querySelectorAll("textarea"))) if (t.id && t.value !== t.defaultValue && !reactAttached(t)) typedTextareas.set(t.id, t.value);
  document.addEventListener(
    "input",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement && t.id && !reactAttached(t)) typedTextareas.set(t.id, t.value);
    },
    true,
  );
}
/**
 * True only while this component is hydrating server-rendered HTML; false when it mounts later on the client (a dialog that
 * opens, a list that loads). Only then can the DOM hold input React never saw; on a later mount a mismatch just means the
 * options or value are not there yet (a <select> whose options load after it), and adopting it would wipe real state.
 */
function useIsHydrating(): boolean {
  return useSyncExternalStore(noSubscribe, () => false, () => true);
}

/**
 * Pre-hydration typing. Pages are server-rendered, so a field is live before React attaches its handlers; on a slow
 * phone someone can type a whole phone number into it first. React then hydrates a controlled input with an empty
 * state, never sees those keystrokes, and the raw text sits in the box unformatted while state (and so submit) is empty.
 *
 * Attach the returned ref to the <input>/<textarea>/<select>. On mount, if the DOM value is not what the state says,
 * `adopt(domValue, element)` is called once so the component can take the typed text into its state (formatting it).
 * Pass the component's own forwarded ref as `forwarded`; it is kept in sync.
 */
export function useHydratedValue<T extends TextLike>(current: string, adopt: (domValue: string, el: T) => void, forwarded?: Ref<T>) {
  const elRef = useRef<T | null>(null);
  const hydrating = useIsHydrating();
  // The first render's values are the ones the server-rendered HTML was hydrated against.
  const [first] = useState(() => ({ current, adopt, hydrating }));
  const ref = useCallback(
    (el: T | null) => {
      elRef.current = el;
      assign(forwarded, el);
    },
    [forwarded],
  );
  useEffect(() => {
    const el = elRef.current;
    if (!first.hydrating || !el) return;
    if (el instanceof HTMLTextAreaElement && typedTextareas.has(el.id)) {
      const typed = typedTextareas.get(el.id)!;
      typedTextareas.delete(el.id);
      if (typed !== el.value) el.value = typed;
    }
    if (el.value !== first.current) first.adopt(el.value, el);
  }, [first]);
  return ref;
}

/** Same for a controlled checkbox ticked before hydration (the consent box). */
export function useHydratedChecked(current: boolean, adopt: (checked: boolean) => void) {
  const elRef = useRef<HTMLInputElement | null>(null);
  const hydrating = useIsHydrating();
  // The first render's values are the ones the server-rendered HTML was hydrated against.
  const [first] = useState(() => ({ current, adopt, hydrating }));
  const ref = useCallback((el: HTMLInputElement | null) => {
    elRef.current = el;
  }, []);
  useEffect(() => {
    const el = elRef.current;
    if (first.hydrating && el && el.checked !== first.current) first.adopt(el.checked);
  }, [first]);
  return ref;
}

/** A synthetic change event carrying the element, for `onChange` handlers that only read `e.target.value`. */
export function adoptedChangeEvent<T extends TextLike>(el: T) {
  return { target: el, currentTarget: el, type: "change", bubbles: true } as unknown as import("react").ChangeEvent<T>;
}
