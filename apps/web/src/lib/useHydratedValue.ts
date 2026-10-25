"use client";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";

type TextLike = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function assign<T>(ref: Ref<T> | undefined, el: T | null) {
  if (typeof ref === "function") ref(el);
  else if (ref) (ref as { current: T | null }).current = el;
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
  // The first render's values are the ones the server-rendered HTML was hydrated against.
  const [first] = useState(() => ({ current, adopt }));
  const ref = useCallback(
    (el: T | null) => {
      elRef.current = el;
      assign(forwarded, el);
    },
    [forwarded],
  );
  useEffect(() => {
    const el = elRef.current;
    if (el && el.value !== first.current) first.adopt(el.value, el);
  }, [first]);
  return ref;
}

/** Same for a controlled checkbox ticked before hydration (the consent box). */
export function useHydratedChecked(current: boolean, adopt: (checked: boolean) => void) {
  const elRef = useRef<HTMLInputElement | null>(null);
  // The first render's values are the ones the server-rendered HTML was hydrated against.
  const [first] = useState(() => ({ current, adopt }));
  const ref = useCallback((el: HTMLInputElement | null) => {
    elRef.current = el;
  }, []);
  useEffect(() => {
    const el = elRef.current;
    if (el && el.checked !== first.current) first.adopt(el.checked);
  }, [first]);
  return ref;
}

/** A synthetic change event carrying the element, for `onChange` handlers that only read `e.target.value`. */
export function adoptedChangeEvent<T extends TextLike>(el: T) {
  return { target: el, currentTarget: el, type: "change", bubbles: true } as unknown as import("react").ChangeEvent<T>;
}
