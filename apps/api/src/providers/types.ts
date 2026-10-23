/**
 * Outbound providers. Each has a console implementation used in dev/test so
 * the whole product runs with zero third-party accounts. Real implementations
 * live next to these (twilio.ts, resend.ts, expo-push.ts, stripe.ts).
 */
export interface SmsProvider {
  name: string;
  send(to: string, body: string): Promise<{ id: string }>;
}

export interface EmailProvider {
  name: string;
  send(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ id: string }>;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android notification channel ("points" | "orders" | "offers"; the app creates them). */
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

/** Per-message push ticket (same order as the messages sent). */
export interface PushTicket {
  token: string;
  status: "ok" | "error";
  /** Receipt id to check later (Expo). */
  id?: string;
  error?: string;
}

export interface PushReceipt {
  status: "ok" | "error";
  message?: string;
  /** e.g. "DeviceNotRegistered", "MessageTooBig", "MessageRateExceeded", "InvalidCredentials" */
  error?: string;
}

export interface PushProvider {
  name: string;
  send(msgs: PushMessage[]): Promise<{ ok: number; failed: number; tickets?: PushTicket[] }>;
  /** Look up delivery receipts by ticket id (Expo). Optional: console providers report everything ok. */
  receipts?(ids: string[]): Promise<Record<string, PushReceipt>>;
}

/** Recorded outbound messages (console providers) so tests and dev tools can inspect them. */
export interface Outbox {
  sms: { to: string; body: string; at: Date }[];
  email: { to: string; subject: string; text: string; at: Date }[];
  push: { token: string; title: string; body: string; at: Date; data?: Record<string, unknown>; channelId?: string }[];
}

export interface Providers {
  sms: SmsProvider;
  email: EmailProvider;
  push: PushProvider;
  outbox: Outbox;
  /** Payments (Stripe Connect + Billing). Optional: use getPayments(ctx) from ./payments.js, which falls back to FakePayments. */
  payments?: import("./payments.js").PaymentsProvider;
  /** WhatsApp Cloud API. Optional: use getWhatsApp(ctx) from ./whatsapp.js, which falls back to the fake. */
  whatsapp?: import("./whatsapp.js").WhatsAppProvider;
  /** Object storage for uploads (ticket photos). Optional: use getStorage(ctx) from ./storage.js, which falls back to memory (tests) or disk. */
  storage?: import("./storage.js").StorageProvider;
}
