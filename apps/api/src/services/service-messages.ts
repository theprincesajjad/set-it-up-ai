/** Customer text messages for repair and drop-off work, in the customer's own language (users.locale: en, hi, ur, pa). */
import { eq } from "drizzle-orm";
import { users, type DbOrTx } from "@ll/db";
import { normalizeLocale, t, type Locale, type MessageKey, type Vars } from "@ll/shared";
import { money } from "./commerceShared.js";

export async function customerLocale(db: DbOrTx, userId: string): Promise<Locale> {
  const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return normalizeLocale(u?.locale) ?? "en";
}

/** Translate one message for a customer. Amounts are pre-formatted with money() so they stay Latin digits. */
export async function tFor(db: DbOrTx, userId: string, key: MessageKey, vars?: Vars): Promise<string> {
  return t(await customerLocale(db, userId), key, vars);
}

/** The link in a text opens in the customer's language (the web pages read ?lang=). English links stay clean. */
export function withLang(url: string, locale: Locale): string {
  return locale === "en" ? url : `${url}${url.includes("?") ? "&" : "?"}lang=${locale}`;
}

export { money };
