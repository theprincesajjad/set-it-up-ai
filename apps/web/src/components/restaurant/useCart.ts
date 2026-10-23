"use client";
import { useCallback, useEffect, useState } from "react";
import { addLine, loadCart, saveCart, setQty, type Cart } from "@/lib/restaurant/order";

/** The shop's pickup cart (localStorage, per shop). Empty on the server and first paint, then the saved cart; other tabs stay in sync. */
export function useCart(slug: string) {
  const [cart, setCart] = useState<Cart>({ lines: [] });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Saved carts only exist in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(loadCart(slug));
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === `ll.cart.${slug}`) setCart(loadCart(slug));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [slug]);
  const update = useCallback(
    (fn: (c: Cart) => Cart) =>
      setCart((c) => {
        const next = fn(c);
        saveCart(slug, next);
        return next;
      }),
    [slug],
  );
  return {
    cart,
    ready,
    add: (itemId: string, optionIds: string[] = [], qty = 1) => update((c) => addLine(c, itemId, optionIds, qty)),
    setQty: (key: string, qty: number) => update((c) => setQty(c, key, qty)),
    replace: (c: Cart) => update(() => c),
    clear: () => update(() => ({ lines: [] })),
  };
}
