"use client";
import { PageTitle } from "@/components/ui/ClearKit";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { PromoPicker } from "../PromoPicker";

/**
 * Promos to regulars, on every plan: a free shop sees the seasonal templates and the plan line (and cannot send); Café & Retail
 * sends 4 a month, the annual plan 48 a year (phase solo, workstream D). The Messages page carries the same picker for paid shops.
 */
export default function RegularsPromosPage() {
  const { t } = useLocaleOrEnglish();
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("promo.title")} subtitle={t("promo.subtitle")} />
      <PromoPicker />
    </div>
  );
}
