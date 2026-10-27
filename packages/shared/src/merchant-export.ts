/**
 * The owner's data export (merchant agreement 2.1 "Merchant Customer Data"): one CSV per kind of record, or all of
 * them in one ZIP. The API (apps/api/src/services/merchant-export.ts) builds exactly these files and the dashboard's
 * Settings > Privacy > "Your data" panel lists them, so the promise, the product and the panel read from one list.
 */
export interface MerchantExportDataset {
  key: string;
  /** Name in the panel. */
  label: string;
  /** One line: what is in the file. */
  description: string;
}

export const MERCHANT_EXPORTS = [
  { key: "members", label: "Members", description: "Every member with contact details, balance, visits, marketing consent and do-not-contact." },
  { key: "visits", label: "Visits", description: "Each visit recorded at your shop, with the amount and how it was recorded." },
  { key: "points-ledger", label: "Points and redemptions", description: "Every points transaction: earned, redeemed, adjusted and reversed." },
  { key: "orders", label: "Orders", description: "Online, WhatsApp and phone orders with totals, tips, payment status and allergy notes." },
  { key: "order-items", label: "Order items", description: "The items on each order with quantity, price, modifiers and kitchen notes." },
  { key: "appointments", label: "Appointments", description: "Bookings with services, times, status, deposits and notes." },
  { key: "classes", label: "Classes", description: "Every scheduled class with the instructor, room, capacity, how many booked, attended, waitlisted and no-shows, and whether it is women only." },
  { key: "class-bookings", label: "Class bookings", description: "Who booked each class, what they used (membership, pass, drop-in), check-in, late cancels and fees, with whether you may text them." },
  { key: "class-passes", label: "Class passes", description: "Packs and intro offers sold, with credits left, expiry and status." },
  { key: "class-memberships", label: "Class memberships", description: "Memberships with price, term, next payment, freezes, cancellation, the day the agreement was accepted and whether you may text the member." },
  { key: "class-charges", label: "Class payments", description: "Every membership period, pack, drop-in and late fee charged, with tax, status and how it was paid." },
  { key: "tiffin-subscriptions", label: "Tiffin subscriptions", description: "Subscribers with plan, servings, delivery address, dietary notes and status." },
  { key: "tiffin-deliveries", label: "Tiffin deliveries", description: "Each scheduled and completed delivery." },
  { key: "catering-events", label: "Catering events", description: "Catering quotes and events with headcount, menu, totals, deposits and approval." },
  { key: "hall-bookings", label: "Hall bookings", description: "Hall holds and bookings with dates, packages and deposits." },
  { key: "tickets", label: "Repair tickets", description: "Repair tickets with the item, issue, status and the photo files (photos are in the ZIP)." },
  { key: "quotes", label: "Quotes", description: "Quotes with lines, totals and how the customer responded." },
  { key: "invoices", label: "Invoices", description: "Invoices with lines, tax, deposits applied and payment status." },
  { key: "reviews", label: "Reviews", description: "Review requests with rating, private comment, your reply and whether you may follow up." },
  { key: "messages", label: "Messages sent", description: "Every campaign and automatic message you sent." },
  { key: "message-deliveries", label: "Message deliveries", description: "Each text or email sent to each customer, with its status." },
  { key: "whatsapp-messages", label: "WhatsApp messages", description: "WhatsApp conversations with your customers, in both directions." },
  { key: "phone-orders", label: "Phone orders", description: "Phone-assistant calls with the transcript and the order it drafted." },
] as const satisfies readonly MerchantExportDataset[];

export type MerchantExportKey = (typeof MERCHANT_EXPORTS)[number]["key"];
export const MERCHANT_EXPORT_KEYS: readonly MerchantExportKey[] = MERCHANT_EXPORTS.map((d) => d.key);
