import type { MessageKey } from "@ll/shared";

/** What kind of thing was being looked for, from the URL path. A 404 for a shop says "that shop"; for a text-message link, "this link". */
export type NotFoundContext = "page" | "shop" | "event" | "line" | "link" | "cut";

const LINK_PREFIX = /^\/(e|i|q|r|t|w|d|visit|pay)(\/|$)/;

export function notFoundContext(path: string | null | undefined, opts: { cut?: boolean } = {}): NotFoundContext {
  if (opts.cut) return "cut";
  const p = path ?? "";
  if (/^\/shops(\/|$)/.test(p) || /^\/s(\/|$)/.test(p)) return "shop";
  if (/^\/c(\/|$)/.test(p)) return "event";
  if (/^\/line(\/|$)/.test(p)) return "line";
  if (LINK_PREFIX.test(p)) return "link";
  return "page";
}

/** Catalogue keys for the title and body of each 404 context. */
export const NOT_FOUND_KEYS: Record<NotFoundContext, { title: MessageKey; body: MessageKey }> = {
  page: { title: "auth.notFound.title", body: "auth.notFound.body" },
  shop: { title: "err.nf.shop.title", body: "err.nf.shop.body" },
  event: { title: "err.nf.event.title", body: "err.nf.event.body" },
  line: { title: "err.nf.line.title", body: "err.nf.line.body" },
  link: { title: "err.nf.link.title", body: "err.nf.link.body" },
  cut: { title: "err.link.cut.title", body: "err.link.cut.body" },
};

/** Request header the proxy sets: the pathname the person asked for (layouts and not-found files cannot read it otherwise). */
export const PATH_HEADER = "x-ll-path";
/** Request header the proxy sets when the URL has a broken percent-escape (a link cut off by a text message or a chat app). */
export const CUT_LINK_HEADER = "x-ll-link-cut";
/** Request header the proxy sets: path plus query, for `/login?next=` (so a deep link survives sign-in). */
export const NEXT_HEADER = "x-ll-next";
