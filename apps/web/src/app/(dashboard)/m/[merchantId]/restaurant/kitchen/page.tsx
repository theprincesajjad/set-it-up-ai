"use client";
import { RestaurantGate } from "@/components/dashboard/restaurant/shared";
import { KitchenBoard } from "./KitchenBoard";

/** Full-screen kitchen display (restaurant.kds). The board covers the dashboard chrome; Exit goes back. */
export default function KitchenPage() {
  return (
    <RestaurantGate featureKey="restaurant.kds" title="Kitchen display">
      <KitchenBoard />
    </RestaurantGate>
  );
}
