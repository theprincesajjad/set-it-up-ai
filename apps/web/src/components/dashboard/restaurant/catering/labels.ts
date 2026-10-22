import type { restaurantApi } from "@ll/shared";

export const EVENT_TYPE_LABEL: Record<restaurantApi.CateringEventType, string> = {
  wedding: "Wedding",
  walima: "Walima",
  mehndi: "Mehndi",
  engagement: "Engagement",
  birthday: "Birthday",
  aqiqah: "Aqiqah",
  corporate: "Office or corporate",
  religious: "Religious gathering",
  other: "Other event",
};
export const EVENT_TYPE_OPTIONS = (Object.keys(EVENT_TYPE_LABEL) as restaurantApi.CateringEventType[]).map((v) => ({ value: v, label: EVENT_TYPE_LABEL[v] }));

export const SERVICE_LABEL: Record<restaurantApi.CateringService, string> = {
  delivery: "We deliver",
  pickup: "They pick up",
  onsite: "We cook on site",
  banquet: "At a banquet hall",
};
export const SERVICE_OPTIONS = (Object.keys(SERVICE_LABEL) as restaurantApi.CateringService[]).map((v) => ({ value: v, label: SERVICE_LABEL[v] }));

export const STATUS_LABEL: Record<restaurantApi.CateringStatus, string> = {
  inquiry: "Inquiry",
  tasting: "Tasting",
  quoted: "Quoted",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const STATUS_ORDER: restaurantApi.CateringStatus[] = ["inquiry", "tasting", "quoted", "confirmed", "completed", "cancelled"];
export const STATUS_HINT: Record<restaurantApi.CateringStatus, string> = {
  inquiry: "Call back and build a menu",
  tasting: "Tasting booked",
  quoted: "Waiting on the customer",
  confirmed: "Deposit in, event on the books",
  completed: "Done",
  cancelled: "Cancelled",
};
