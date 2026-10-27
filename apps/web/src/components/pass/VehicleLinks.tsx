"use client";
import Link from "next/link";
import { useFmt } from "@/components/restaurant/ui";

/** Link from the card to My vehicles, shown only to people who have a car on file (a garage or wash adds it at the counter). */
export function VehicleLinks({ vehicles }: { vehicles: number }) {
  const { t } = useFmt();
  if (!vehicles) return null;
  return (
    <nav aria-label={t("auto.my.title")} className="mt-4 flex flex-col divide-y divide-line rounded-card border border-line px-4">
      <Link href="/me/vehicles" className="flex items-center justify-between py-3.5 text-body-strong text-fg">{t("auto.my.title")}<span aria-hidden className="text-fg-muted">{vehicles}</span></Link>
    </nav>
  );
}
