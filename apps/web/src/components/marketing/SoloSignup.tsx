"use client";
import { useEffect } from "react";
import { SignupWizard } from "@/components/auth/SignupWizard";

/**
 * The sign-up form inline on a landing page, with the trade preset (`vertical`) and where the owner came from (`src`).
 * `src` is kept for 30 days in the `ll_src` cookie; SignupWizard reads it and the API stores it on the `signed_up` milestone.
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
