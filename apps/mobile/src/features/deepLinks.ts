import { router } from "expo-router";

/** ll://shop/<slug> → /shop/<slug>, ll://card → /card, etc. */
export function openDeepLink(url: string): void {
  const path = url.replace(/^ll:\/\//, "/").replace(/^https?:\/\/[^/]+/, "");
  const map: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^\/shop\/([^/?#]+)/, (m) => `/shop/${m[1]}`],
    [/^\/s\/([^/?#]+)/, (m) => `/shop/${m[1]}`],
    [/^\/card/, () => "/card"],
    [/^\/rewards/, () => "/rewards"],
    [/^\/ticket\/([^/?#]+)/, (m) => `/tickets/${m[1]}`],
    [/^\/order\/([^/?#]+)/, (m) => `/orders/${m[1]}`],
    [/^\/campaign\/([^/?#]+)/, (m) => `/campaigns/${m[1]}`],
    [/^\/(?:q|quote)\/([^/?#]+)/, (m) => `/quote/${m[1]}`],
    [/^\/tiffin\/([^/?#]+)/, (m) => `/tiffin/${m[1]}`],
    [/^\/tiffin\/?$/, () => "/tiffin"],
    [/^\/e\/([^/?#]+)/, (m) => `/e/${m[1]}`],
    [/^\/events\/([^/?#]+)/, (m) => `/events/${m[1]}`],
  ];
  for (const [re, to] of map) {
    const m = path.match(re);
    if (m) {
      router.push(to(m) as never);
      return;
    }
  }
}
