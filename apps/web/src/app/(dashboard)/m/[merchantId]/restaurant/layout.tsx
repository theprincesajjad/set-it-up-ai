import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RestaurantSection } from "@/components/dashboard/RestaurantSection";

export const metadata: Metadata = { title: "Restaurant" };

/** Shared frame for every restaurant pack page: feature gate + section tab strip (see RestaurantSection). */
export default function RestaurantLayout({ children }: { children: ReactNode }) {
  return <RestaurantSection>{children}</RestaurantSection>;
}
