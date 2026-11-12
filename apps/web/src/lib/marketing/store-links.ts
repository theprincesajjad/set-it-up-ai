/**
 * The app listing links for marketing pages. A link shows only when its URL is configured to a real listing
 * (NEXT_PUBLIC_APP_STORE_URL, NEXT_PUBLIC_PLAY_STORE_URL): the store's front page has nothing to install, so there is no generic default here.
 */
export interface StoreLinks {
  appStore: string | null;
  playStore: string | null;
}

/** A listing URL: https, on the store's host, and deeper than the store's home page. Anything else is treated as not configured. */
export function listingUrl(raw: string | undefined, host: string, home: RegExp): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.hostname !== host) return null;
    return home.test(u.pathname + u.search) ? null : u.toString();
  } catch {
    return null;
  }
}

export function storeLinks(source: { appStore?: string; playStore?: string } = { appStore: process.env.NEXT_PUBLIC_APP_STORE_URL, playStore: process.env.NEXT_PUBLIC_PLAY_STORE_URL }): StoreLinks {
  return {
    appStore: listingUrl(source.appStore, "apps.apple.com", /^\/?$/),
    playStore: listingUrl(source.playStore, "play.google.com", /^\/?(store\/?(apps\/?)?)?$/),
  };
}
