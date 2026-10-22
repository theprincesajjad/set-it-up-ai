import { authApi } from "@ll/shared";

/** Client-side email check using the contract schema (same rule the API applies). */
export function emailOtpStartBodySafe(email: string): boolean {
  return authApi.emailOtpStartBody.safeParse({ email: email.trim() }).success;
}
