"use client";
import Link from "next/link";
import { isApiError } from "@/lib/api/errors";
import { useFmt } from "@/components/restaurant/ui";

/** True when the server refused a reminder switch because the customer has not agreed to texts from that shop (409 no_consent). */
export const isNoConsent = (e: unknown): boolean => isApiError(e) && e.code === "no_consent";

/**
 * A reminder switch the server refused for want of the shop's text consent is a dead end unless it says where consent is given
 * (docs/audits/pet-care.md P7). This names the shop and links to the per-shop "offers by text" switch in the pass settings.
 */
export function ConsentNeeded({ shop, className }: { shop: string; className?: string }) {
  const { t } = useFmt();
  return (
    <p role="alert" className={className ?? "text-meta font-medium text-negative"}>
      {t("pet.food.noConsent", { shop })}{" "}
      <Link href="/me#settings" className="underline underline-offset-4 focus-visible:focus-ring">
        {t("pet.food.noConsentLink")}
      </Link>
    </p>
  );
}
