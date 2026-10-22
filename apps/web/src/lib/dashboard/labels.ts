import { formatPoints } from "@/lib/format";

const SOURCES: Record<string, string> = {
  counter: "Counter", staff_app: "Counter app", web_counter: "Web counter", kiosk: "Kiosk", dashboard: "Dashboard", import: "Import", pos: "POS", api: "API",
  square: "Square", clover: "Clover", shopify: "Shopify", lightspeed: "Lightspeed", toast: "Toast", order: "Order", invoice: "Invoice", network: "Network", system: "System", app: "App", web: "Web",
};
export function sourceLabel(s: string | null | undefined): string {
  if (!s) return "";
  return SOURCES[s] ?? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** "Earn", "Welcome bonus", "Reversal". */
export function typeLabel(t: string): string {
  return t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** "+2 stamps", "-1 stamp" (unit agrees with the absolute value). */
export function signedPoints(n: number, terminology?: string | null): string {
  return `${n >= 0 ? "+" : "\u2212"}${formatPoints(Math.abs(n), terminology)}`;
}
