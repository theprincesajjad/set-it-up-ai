"use client";
import { useEffect } from "react";

/**
 * Installs the service worker (public/sw.js) for customer pages, so a pass reopened with no signal shows the offline page with the
 * member number instead of the browser's error screen. The same worker carries web push; lib/webpush.ts reuses this registration.
 * Renders nothing. Registration waits for the page to finish loading so it never competes with it.
 */
export function OfflineSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
