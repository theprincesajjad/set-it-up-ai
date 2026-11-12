import { notFound } from "next/navigation";

/**
 * The /dev test pages (fake payment screens, onboarding kit) exist only on development and test stacks: a 404 on a production build.
 * A test stack runs a production build with OTP_AUTOFILL=1 (the same switch that fills sign-in codes) or KIT_SHOWCASE=1.
 */
export function devPagesOnly(): void {
  if (process.env.NODE_ENV === "production" && process.env.OTP_AUTOFILL !== "1" && process.env.KIT_SHOWCASE !== "1") notFound();
}
