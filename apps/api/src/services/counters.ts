import { sql } from "drizzle-orm";
import { merchantCounters, type DbOrTx } from "@ll/db";

export type CounterName = "order" | "ticket" | "invoice" | "catering" | "reference";

/**
 * Next human-friendly number for a merchant ("order #12"). Atomic: a single
 * upsert-increment, safe under concurrent requests.
 */
export async function nextNumber(db: DbOrTx, merchantId: string, name: CounterName): Promise<number> {
  const [row] = await db
    .insert(merchantCounters)
    .values({ merchantId, name, value: 1 })
    .onConflictDoUpdate({ target: [merchantCounters.merchantId, merchantCounters.name], set: { value: sql`${merchantCounters.value} + 1` } })
    .returning({ value: merchantCounters.value });
  return row!.value;
}
