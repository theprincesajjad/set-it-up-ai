/**
 * API contract for the people side (phase solo, workstream D): the inbox (/v1/merchants/:id/inbox), the client profile extras
 * (/v1/merchants/:id/customers/:memberId/people, /preferences), the appointment-led client list (/v1/merchants/:id/clients), the
 * Instagram connector (/v1/merchants/:id/instagram, read-only), web push (/v1/me/web-push) and the customer's own threads
 * (/v1/me/inbox). Endpoint docs: docs/engineering/api/inbox.md.
 */
import { z } from "zod";
import { CHANNEL_PREFS, type ChannelPref, type DeliveryChannel, type InboxChannel } from "../inbox.js";
import { uuidSchema } from "./common.js";

export { CHANNEL_PREFS, type ChannelPref, type DeliveryChannel, type InboxChannel };

/** Longest message a shop or a customer can send in a thread. */
export const INBOX_MAX_BODY = 1000;

// ---------------------------------------------------------------------------
// Shop side: threads
// ---------------------------------------------------------------------------
export const listInboxQuery = z.object({
  channel: z.enum(["all", "in_app", "sms", "email", "instagram"]).default("all"),
  unread: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListInboxQuery = z.infer<typeof listInboxQuery>;

export interface ConversationDto {
  id: string;
  channel: InboxChannel;
  /** The customer at this shop, when the thread belongs to one (Instagram threads may not). */
  memberId: string | null;
  userId: string | null;
  displayName: string;
  handle: string | null;
  lastMessage: { body: string; direction: "in" | "out"; at: string } | null;
  lastMessageAt: string | null;
  unread: number;
  /** Instagram: read-only, open the DM on Instagram to reply. */
  readOnly: boolean;
  /** Link to the conversation on Instagram. */
  externalUrl: string | null;
}

export interface InboxResponse {
  items: ConversationDto[];
  unreadTotal: number;
  instagram: InstagramStatus;
}

export interface ThreadMessageDto {
  id: string;
  direction: "in" | "out";
  body: string;
  kind: "text" | "system" | "booking";
  /** How it went out or came in. */
  channel: DeliveryChannel | null;
  sentByName: string | null;
  createdAt: string;
}

export interface ThreadResponse {
  conversation: ConversationDto;
  messages: ThreadMessageDto[];
  /** The customer's next booked visit at this shop, for the thread header. */
  nextVisit: { appointmentId: string; startsAt: string; services: string } | null;
  /** Where the next outgoing message would go ("push", "email", "sms", or null when only the in-app thread reaches them). */
  replyChannel: DeliveryChannel | null;
}

/** Open the thread with a customer: by their membership (profile) or their user id (calendar sheet). */
export const startConversationBody = z.union([z.object({ memberId: uuidSchema }), z.object({ userId: uuidSchema })]);
export const sendInboxMessageBody = z.object({ body: z.string().trim().min(1).max(INBOX_MAX_BODY) });
export type SendInboxMessageBody = z.infer<typeof sendInboxMessageBody>;

export interface SendInboxMessageResponse {
  message: ThreadMessageDto;
  /** The rung it went out on; "in_app" only = it waits in the thread for the next app open. */
  deliveredBy: DeliveryChannel[];
  /** True when a text was wanted but the month's texts are used up (it went by email or stayed in the app). */
  textCapReached: boolean;
}

/** GET /merchants/:id/inbox/:conversationId/booking-prefill: what "Create booking" puts in the new-appointment sheet. */
export interface BookingPrefill {
  conversationId: string;
  userId: string | null;
  customerName: string | null;
  handle: string | null;
  /** The latest message from the person, as the client note. */
  clientNote: string | null;
  /** A link back to the conversation (the dashboard thread, and Instagram's own for a DM). */
  threadPath: string;
  externalUrl: string | null;
  source: "instagram" | "staff";
}

// ---------------------------------------------------------------------------
// Instagram (read-only, behind INSTAGRAM_DM_ENABLED)
// ---------------------------------------------------------------------------
/** off = the connector is not switched on yet (the card says "coming"); stub = dev/test seeded threads; live = Meta OAuth. */
export type InstagramMode = "off" | "stub" | "live";
export interface InstagramStatus {
  mode: InstagramMode;
  connected: boolean;
  username: string | null;
  connectedAt: string | null;
}
export interface InstagramConnectResponse {
  /** live: send the owner here (Meta's consent screen). stub: null, the account is connected and seeded already. */
  authorizeUrl: string | null;
  status: InstagramStatus;
  imported: number;
}

// ---------------------------------------------------------------------------
// Client profile extras (appointment-led shops)
// ---------------------------------------------------------------------------
export type TimelineKind = "appointment" | "stamp" | "redemption";
export interface TimelineItem {
  kind: TimelineKind;
  id: string;
  at: string;
  /** appointment: "Classic fill, Brow tint"; stamp: "+1 stamp"; redemption: the reward name. */
  title: string;
  staffName: string | null;
  priceCents: number | null;
  depositCents: number | null;
  /** appointment status (booked, completed, no_show, cancelled ...). */
  status: string | null;
  visitNote: string | null;
  visitPhotoUrl: string | null;
  intakeAnswer: string | null;
  clientNote: string | null;
}

export interface ClientProfileResponse {
  memberId: string;
  userId: string;
  nextVisit: (TimelineItem & { endsAt: string }) | null;
  /** Newest first: appointments merged with stamps and redemptions. */
  timeline: TimelineItem[];
  /** "Book again": the last completed visit's services and staff, for the new-appointment sheet and the booking link. */
  bookAgain: { serviceIds: string[]; staffId: string | null; label: string; link: string } | null;
  channelPref: ChannelPref;
  /** Language for reminders and promos from this shop; null = the customer's own app language. */
  locale: string | null;
  /** Which rungs can reach them today. */
  reachable: { push: boolean; webPush: boolean; email: boolean; text: boolean };
  conversationId: string | null;
  unread: number;
  visits12m: number;
  noShows12m: number;
}

export const updateClientPreferencesBody = z
  .object({
    channelPref: z.enum(CHANNEL_PREFS),
    locale: z.enum(["en", "hi", "ur", "pa"]).nullable(),
  })
  .partial();
export type UpdateClientPreferencesBody = z.infer<typeof updateClientPreferencesBody>;

/** GET /merchants/:id/clients: the appointment-led Customers list (when booking.appointments is on). */
export const CLIENT_SEGMENTS = ["all", "upcoming", "due", "no_show_twice", "new"] as const;
export type ClientSegment = (typeof CLIENT_SEGMENTS)[number];
export const listClientsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  segment: z.enum(CLIENT_SEGMENTS).default("all"),
  /** A staff member's own clients (anyone they saw or have booked). Renters who see only their own clients always get theirs. */
  staffId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuery>;

export interface ClientRow {
  memberId: string;
  userId: string;
  name: string | null;
  /** Masked like the Customers list. */
  phone: string | null;
  lastVisit: { at: string; services: string; staffName: string | null } | null;
  nextVisit: { at: string; services: string; staffName: string | null } | null;
  visits12m: number;
  balance: number;
  noShows12m: number;
  dueForVisit: boolean;
}
export interface ListClientsResponse {
  items: ClientRow[];
  nextCursor: string | null;
  total: number;
  counts: Record<ClientSegment, number>;
  /** The staff filter the server applied (a renter's own id, forced). */
  staffId: string | null;
  staffLocked: boolean;
}

// ---------------------------------------------------------------------------
// Customer side
// ---------------------------------------------------------------------------
export const webPushSubscribeBody = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  userAgent: z.string().max(300).optional(),
});
export type WebPushSubscribeBody = z.infer<typeof webPushSubscribeBody>;
export const webPushUnsubscribeBody = z.object({ endpoint: z.url().max(2000) });
export interface WebPushKeyResponse {
  /** VAPID public key (base64url), or null when web push isn't configured. */
  publicKey: string | null;
}
export interface WebPushStatusResponse {
  subscribed: boolean;
  devices: number;
}

/** PUT /me/channel-pref: how every shop reaches me (sets each of my memberships). */
export const myChannelPrefBody = z.object({ channelPref: z.enum(CHANNEL_PREFS) });
export interface MyChannelPrefResponse {
  channelPref: ChannelPref;
}

export interface MyThreadDto {
  id: string;
  merchant: { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null };
  lastMessage: { body: string; direction: "in" | "out"; at: string } | null;
  /** Messages from the shop I have not read. */
  unread: number;
}
export interface MyThreadsResponse {
  items: MyThreadDto[];
  unreadTotal: number;
}
export interface MyThreadResponse {
  thread: MyThreadDto;
  /** direction is from the shop's side: "out" = the shop wrote, "in" = I wrote. */
  messages: ThreadMessageDto[];
}
