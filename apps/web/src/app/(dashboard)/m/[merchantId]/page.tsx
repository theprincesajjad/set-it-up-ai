"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TodayPage } from "@/components/dashboard/home/TodayPage";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PromoResultLine } from "@/components/dashboard/inbox/PromoResultLine";

/** Today: the same four cards for every trade (components/dashboard/home/TodayPage). An instructor has no Today; their day is the class list. */
export default function HomePage() {
  const { role, base } = useMerchant();
  const router = useRouter();
  const instructor = role === "instructor";
  useEffect(() => {
    if (instructor) router.replace(`${base}/classes`);
  }, [instructor, router, base]);
  if (instructor) return null;
  return (
    <>
      <TodayPage />
      {/* phase-solo D: the last promo's result (people-side.md gap 6). */}
      <PromoResultLine />
    </>
  );
}
