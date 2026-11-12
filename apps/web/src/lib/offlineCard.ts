/**
 * The member number and QR the offline page shows when the pass cannot load (public/sw.js falls back to /offline).
 *
 * It lives in this browser's localStorage, never in a service-worker cache and never on the server: it is the signed-in customer's own
 * card, written when their wallet loads and removed when they sign out, so a shared phone never shows the last person's number to the
 * next one. /offline (app/offline/route.ts) reads the same key with a plain script, so keep the two in step.
 */
export const OFFLINE_CARD_KEY = "ll_offline_card";

export interface OfflineCard {
  code: string;
  /** Pre-rendered QR (the API's own SVG). Shown as an image, never inserted as markup. */
  qrSvg?: string;
}

export function saveOfflineCard(card: OfflineCard | null): void {
  try {
    if (!card?.code) localStorage.removeItem(OFFLINE_CARD_KEY);
    else localStorage.setItem(OFFLINE_CARD_KEY, JSON.stringify({ code: card.code, qrSvg: card.qrSvg }));
  } catch {
    /* storage blocked or full: the offline page just says the shop can look the customer up by phone */
  }
}

export function clearOfflineCard(): void {
  saveOfflineCard(null);
}
