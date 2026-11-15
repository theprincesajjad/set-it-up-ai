"use client";
import { useEffect } from "react";

/**
 * The browser tab and history read "<page heading> · <suffix>", taken from the page's own h1 (client pages cannot export metadata). A detail page's
 * h1 (a customer's name, a message's subject) only exists once its data has loaded, which can be well after the first paint: watch <main> until
 * the heading shows up and follow it when it changes. The route's own metadata title lands after a client navigation, so <head> is watched too and
 * the page's name is put back over it. `deps` re-arms the watcher (the route, the shop).
 */
export function useHeadingTitle(suffix: string, deps: readonly unknown[]): void {
  useEffect(() => {
    let frame = 0;
    const set = () => {
      frame = 0;
      const h = document.querySelector("main h1")?.textContent?.trim();
      if (h) {
        const next = `${h} · ${suffix}`;
        if (document.title !== next) document.title = next;
      }
    };
    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(set);
    };
    set();
    const main = document.querySelector("main");
    const observer = main ? new MutationObserver(queue) : null;
    if (main) observer?.observe(main, { childList: true, subtree: true, characterData: true });
    const head = new MutationObserver(queue);
    head.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer?.disconnect();
      head.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suffix, ...deps]);
}
