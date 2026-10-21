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

export interface PushProvider {
  name: string;
  send(msgs: { token: string; title: string; body: string; data?: Record<string, unknown> }[]): Promise<{ ok: number; failed: number }>;
}

/** Recorded outbound messages (console providers) so tests and dev tools can inspect them. */
export interface Outbox {
  sms: { to: string; body: string; at: Date }[];
  email: { to: string; subject: string; text: string; at: Date }[];
  push: { token: string; title: string; body: string; at: Date }[];
}

export interface Providers {
  sms: SmsProvider;
  email: EmailProvider;
  push: PushProvider;
  outbox: Outbox;
}
