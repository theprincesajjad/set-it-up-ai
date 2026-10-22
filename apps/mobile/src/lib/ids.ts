import { randomUUID } from "expo-crypto";

/** One idempotency key per tap, reused for every retry and the offline /sync replay. */
export function newIdempotencyKey(): string {
  return randomUUID();
}
