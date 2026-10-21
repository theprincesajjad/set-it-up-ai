import { createHmac } from "node:crypto";
import { safeEqual } from "../lib/crypto.js";
import type { Fetch, PurchaseLineEvent } from "./types.js";

export class ConnectorHttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: unknown,
  ) {
    super(`HTTP ${status} from ${url.replace(/\?.*$/, "")}`);
  }
}

/** JSON request helper: throws ConnectorHttpError on non-2xx. */
export async function requestJson<T = any>(
  fetchImpl: Fetch,
  url: string,
  init: { method?: string; headers?: Record<string, string>; json?: unknown; form?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", ...init.headers };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  }
  const res = await fetchImpl(url, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* keep text */
  }
  if (!res.ok) throw new ConnectorHttpError(res.status, url, parsed);
  return parsed as T;
}

export function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function hmacBase64(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64");
}

export function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

export function verifyHmac(expected: string, given: string | undefined): boolean {
  return !!given && safeEqual(expected, given.trim());
}

/** "12.34" | 12.34 → 1234 (decimal dollars to integer cents). */
export function toCents(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function isoFrom(v: unknown, fallback: Date): string {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  if (typeof v === "string" && v) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback.toISOString();
}

/**
 * Scale line amounts so they sum to `targetCents` (e.g. order-level discounts
 * that the POS doesn't allocate to lines). Keeps integer cents exact.
 */
export function scaleLines(lines: PurchaseLineEvent[], targetCents: number): PurchaseLineEvent[] {
  const sum = lines.reduce((s, l) => s + Math.max(0, l.amountCents), 0);
  if (sum <= 0 || targetCents >= sum || targetCents < 0) return lines;
  let remaining = targetCents;
  return lines.map((l, i) => {
    const amt = i === lines.length - 1 ? remaining : Math.floor((Math.max(0, l.amountCents) * targetCents) / sum);
    remaining -= amt;
    return { ...l, amountCents: amt };
  });
}

export function expiresAtFrom(now: Date, seconds?: number | null): string | null {
  return seconds && seconds > 0 ? new Date(now.getTime() + seconds * 1000).toISOString() : null;
}

export const fullName = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(" ").trim() || null;
