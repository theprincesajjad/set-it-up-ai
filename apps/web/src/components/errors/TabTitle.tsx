"use client";
import { useEffect } from "react";

/**
 * Names the browser tab for a screen that a layout renders in place of its page (a refusal). The layout's own metadata title ("Admin", "Dashboard")
 * lands in <head> after the page is up and a second <title> would lose to it, so the title is set on the document and put back if the metadata overwrites it.
 */
export function TabTitle({ title }: { title: string }) {
  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const head = new MutationObserver(apply);
    head.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => head.disconnect();
  }, [title]);
  return null;
}
