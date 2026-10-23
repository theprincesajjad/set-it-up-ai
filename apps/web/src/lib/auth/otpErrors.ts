import type { Locale, MessageKey, Vars } from "@ll/shared";
import { isApiError } from "@/lib/api/errors";

type T = (key: MessageKey, vars?: Vars) => string;

/** Localized message for a failed OTP send or verify. API error text is English, so other languages map known cases to catalog keys. */
export function otpErrorMessage(err: unknown, t: T, locale: Locale): string {
  if (isApiError(err)) {
    if (err.isNetwork) return t("auth.err.network");
    if (err.status === 429) return t("auth.err.tooMany");
    if (err.status >= 500) return t("auth.err.server");
    if (err.code === "invalid_code") {
      if (/expire|used/i.test(err.message)) return t("auth.err.expired");
      const left = (err.details as { attemptsLeft?: number } | undefined)?.attemptsLeft;
      return left !== undefined ? `${t("auth.err.wrong")} ${t("auth.err.triesLeft", { n: left })}` : t("auth.err.wrong");
    }
    return locale === "en" ? err.message : t("auth.err.generic");
  }
  return t("auth.err.server");
}
