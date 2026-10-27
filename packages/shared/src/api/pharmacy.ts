import { z } from "zod";
import { phoneSchema } from "./common.js";

/** GET /merchants/:id/pharmacy/rules (any staff) */
export interface PharmacyRulesResponse {
  /** False for every shop that is not a pharmacy; the page and the rules do not apply. */
  pharmacy: boolean;
  rules: { id: string; text: string }[];
  lockedCategories: { id: string; name: string; earnEligible: boolean; discountEligible: boolean }[];
  confirmation: { confirmedAt: string; confirmedByName: string } | null;
  retention: { appointmentDays: number; messageDays: number };
}

/** POST /merchants/:id/pharmacy/confirm (owner) */
export const confirmBody = z.object({
  /** The pharmacist-owner or designated manager, typed in full. */
  name: z.string().trim().min(3).max(120),
  /** The tick box: "no prescriptions or pharmacy services earn points or discounts, and no health information is entered". */
  agree: z.literal(true),
});
export type ConfirmBody = z.infer<typeof confirmBody>;

/** POST /merchants/:id/pharmacy/pickup-ready (any staff) */
export const pickupReadyBody = z.object({
  phone: phoneSchema,
  /** The customer asked for a text when their order is ready (saved as consent for this one kind of text; not marketing). */
  customerAsked: z.literal(true),
});
export type PickupReadyBody = z.infer<typeof pickupReadyBody>;
export interface PickupReadyResponse {
  sent: boolean;
  /** "Sent to (416) 555 ••42" style label; never the text itself. */
  to: string;
}
