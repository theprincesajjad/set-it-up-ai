import { eq } from "drizzle-orm";
import { pushTokens, type Db } from "@ll/db";
import type { Config } from "../config.js";
import { expoPush } from "./expo-push.js";
import { createProviders, type Providers } from "./index.js";
import { resendEmail } from "./resend.js";
import { twilioSms } from "./twilio.js";

export type Fetch = typeof fetch;

/**
 * Production providers. Each real provider activates when its env vars exist
 * (see src/config.ts); anything not configured falls back to the console
 * provider, so a partially configured environment still runs.
 *
 * Pass `db` to let the Expo provider prune tokens Expo reports as
 * DeviceNotRegistered.
 */
export function createRealProviders(config: Config, opts: { fetch?: Fetch; db?: Db } = {}): Providers {
  const f = opts.fetch ?? fetch;
  const overrides: Partial<Providers> = {};
  const { sms, email, push } = config;
  if (sms.provider === "twilio" && sms.twilioAccountSid && sms.twilioAuthToken && (sms.twilioMessagingServiceSid || sms.twilioFrom)) {
    overrides.sms = twilioSms(
      { accountSid: sms.twilioAccountSid, authToken: sms.twilioAuthToken, messagingServiceSid: sms.twilioMessagingServiceSid, from: sms.twilioFrom },
      f,
    );
  } else if (sms.provider === "twilio") {
    console.warn("[providers] TWILIO_ACCOUNT_SID set but TWILIO_AUTH_TOKEN / TWILIO_MESSAGING_SERVICE_SID|TWILIO_FROM missing; using console SMS");
  }
  if (email.provider === "resend" && email.resendApiKey) {
    overrides.email = resendEmail({ apiKey: email.resendApiKey, from: email.from }, f);
  }
  if (push.provider === "expo") {
    const db = opts.db;
    overrides.push = expoPush(
      {
        accessToken: push.expoAccessToken,
        onInvalidToken: db
          ? async (token) => {
              await db.delete(pushTokens).where(eq(pushTokens.token, token));
            }
          : undefined,
      },
      f,
    );
  }
  return createProviders(config, overrides);
}
