"use client";
import { useEffect, useRef } from "react";

const SRC = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * The only script on a solo landing page. It keeps where the visitor came from: `?src=` on the link when it carries one (the
 * PoweredBy line sends `?src=client`), the page's own source otherwise. The value goes into the start form and into the `ll_src`
 * cookie for 30 days, which SignupWizard reads when a visitor signs up later from another page.
 */
export function SourceField({ fallback }: { fallback: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let src = fallback;
    try {
      const q = new URLSearchParams(window.location.search).get("src");
      if (q && SRC.test(q)) src = q;
    } catch {
      /* no URL API: keep the page's source */
    }
    if (ref.current) ref.current.value = src;
    try {
      document.cookie = `ll_src=${encodeURIComponent(src)}; path=/; max-age=${30 * 86400}; samesite=lax`;
    } catch {
      /* cookies blocked: the form still carries src */
    }
  }, [fallback]);
  return <input ref={ref} type="hidden" name="src" defaultValue={fallback} />;
}
