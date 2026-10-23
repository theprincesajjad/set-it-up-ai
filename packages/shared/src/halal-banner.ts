/**
 * Shared by web and mobile. What a customer page may say about a shop's halal certificate: only what the owner stated, in the guest's language.
 * We never badge a shop ourselves, never print a certifier that is not in the owner's record, and never print one past its date.
 */
import type { PublicHalalCertification } from "./api/restaurant-web.js";
import type { MessageKey } from "./i18n/messages/en.js";

type T = (key: MessageKey, vars?: Record<string, string | number | null | undefined>) => string;
type Cert = PublicHalalCertification;

const TITLES: Record<Cert["scope"], Record<Cert["slaughter"], MessageKey>> = {
  all_meat: { zabihah: "halal.title.allMeatZabihah", machine: "halal.title.allMeatMachine", unspecified: "halal.title.allMeatHalal" },
  some_dishes: { zabihah: "halal.title.someZabihah", machine: "halal.title.someMachine", unspecified: "halal.title.someHalal" },
};

export interface HalalBanner {
  title: string;
  /** "Certified by X · valid to Mar 2027"; null when there is nothing more to say. */
  sub: string | null;
  /** Third line for "some dishes" shops: where the claim applies. */
  note: string | null;
  expired: boolean;
  fileUrl: string | null;
}

/** `month` formats the expiry ("Mar 2027") in the guest's language. */
export function halalBanner(cert: Cert, t: T, month: (isoDate: string) => string): HalalBanner {
  if (cert.expired || !cert.certifier) {
    return { title: t("halal.expired"), sub: t("halal.expiredSub"), note: null, expired: true, fileUrl: null };
  }
  const parts = [t("diet.certifiedBy", { certifier: cert.certifier }), cert.validUntil ? t("halal.sub.validTo", { date: month(cert.validUntil) }) : null].filter(Boolean);
  return {
    title: t(TITLES[cert.scope][cert.slaughter]),
    sub: parts.join(" · "),
    note: cert.scope === "some_dishes" ? t("halal.sub.someNote") : null,
    expired: false,
    fileUrl: cert.fileUrl,
  };
}

/** The shop says every meat dish is halal: the per-dish halal tag and the "Halal only" filter would say nothing new. */
export const allMeatHalal = (cert: Cert | null | undefined) => !!cert && !cert.expired && cert.scope === "all_meat";
