import { localeDir, t, type Locale, type MessageKey } from "@ll/shared";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type UnsubscribeKind = "member" | "nudge";

const KEYS: Record<UnsubscribeKind, { confirmTitle: MessageKey; confirmBody: MessageKey; confirmButton: MessageKey; doneTitle: MessageKey; doneBody: MessageKey }> = {
  member: { confirmTitle: "unsub.confirmTitle", confirmBody: "unsub.confirmBody", confirmButton: "unsub.confirmButton", doneTitle: "unsub.doneTitle", doneBody: "unsub.doneBody" },
  nudge: { confirmTitle: "unsub.nudge.confirmTitle", confirmBody: "unsub.nudge.confirmBody", confirmButton: "unsub.nudge.confirmButton", doneTitle: "unsub.nudge.doneTitle", doneBody: "unsub.nudge.doneBody" },
};

function shell(locale: Locale, title: string, inner: string): string {
  return `<!doctype html><html lang="${locale}" dir="${localeDir(locale)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">${inner}</body></html>`;
}

/**
 * The page an unsubscribe LINK opens. Opening it changes nothing (mail scanners and link previews fetch every URL in a
 * message with GET): it asks, and the button POSTs the same token back.
 */
export function unsubscribeConfirmPage(locale: Locale, kind: UnsubscribeKind, shop: string, action: string, fields: Record<string, string>): string {
  const k = KEYS[kind];
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const title = t(locale, k.confirmTitle, { shop });
  return shell(
    locale,
    title,
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(t(locale, k.confirmBody, { shop }))}</p><form method="post" action="${escapeHtml(action)}">${inputs}<button type="submit" style="font:inherit;padding:.7rem 1.2rem;border-radius:.5rem;border:0;background:#1d1d20;color:#fff;cursor:pointer">${escapeHtml(t(locale, k.confirmButton))}</button></form><p style="color:#555;font-size:.9rem">${escapeHtml(t(locale, "unsub.leave"))}</p>`,
  );
}

/** What the confirm button's POST answers (a browser form post; the one-click POST from a mail app gets JSON instead). */
export function unsubscribeDonePage(locale: Locale, kind: UnsubscribeKind, shop: string): string {
  const k = KEYS[kind];
  const title = t(locale, k.doneTitle);
  return shell(locale, title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(t(locale, k.doneBody, { shop }))}</p>`);
}

/** Pages carrying a token in the URL: never cached, never indexed, no referrer, and the form may only post back to us. */
export const UNSUBSCRIBE_PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
} as const;
