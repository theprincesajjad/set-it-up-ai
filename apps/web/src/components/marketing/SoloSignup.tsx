"use client";
import { useEffect } from "react";
import { SignupWizard } from "@/components/auth/SignupWizard";

/**
 * The sign-up form inline on a landing page, with the trade preset (`vertical`) and where the owner came from (`src`).
 * The wizard only takes the vertical today, so `src` is kept for 30 days in the `ll_src` cookie for the sign-up to read.
 * TODO(B): read `ll_src` (or a `src` prefill) when the shop is created.
 */
export function SoloSignup({ vertical, src }: { vertical: string; src: string }) {
  useEffect(() => {
    try {
      document.cookie = `ll_src=${encodeURIComponent(src)}; path=/; max-age=${30 * 86400}; samesite=lax`;
    } catch {
      /* cookies blocked: the link carries ?src= anyway */
    }
  }, [src]);
  return (
    <div data-src={src}>
      <SignupWizard prefill={{ vertical }} />
    </div>
  );
}
