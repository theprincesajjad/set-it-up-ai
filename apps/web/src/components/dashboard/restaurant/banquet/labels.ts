import type { restaurantApi } from "@ll/shared";

export const BOOKING_LABEL: Record<restaurantApi.HallBookingStatus, string> = { hold: "On hold", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed" };
export const BOOKING_ORDER: restaurantApi.HallBookingStatus[] = ["hold", "confirmed", "completed", "cancelled"];
