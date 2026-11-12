/*
 * Local Loyalty service worker: (1) web push for reminders and shop messages on the web pass, with no app and no text (the API
 * encrypts each message for this browser, RFC 8291; the payload is { title, body, url, tag }); (2) the offline page.
 *
 * Offline: when a customer page cannot be reached, the browser shows /offline (a self-contained page with the member number and QR
 * this browser saved). The ONLY thing cached is that generic page, which holds nobody's data. Pages, API responses and anything
 * signed-in are never stored, so a shared phone can never show one customer's page to the next.
 */
const OFFLINE_CACHE = "ll-offline-v1";
const OFFLINE_URL = "/offline";
const DAY_MS = 24 * 60 * 60 * 1000;
// The customer-facing routes (app/(pass)): the wallet, join links, shop pages, and the token links shops send.
const PASS_PATH = /^\/(me|j|join|shops|map|discover|c|d|e|i|line|o|pay|q|r|t|visit|w)(\/|$)/;

async function cacheOfflinePage() {
  const cache = await caches.open(OFFLINE_CACHE);
  const res = await fetch(OFFLINE_URL, { cache: "reload", credentials: "omit" });
  if (res.ok) await cache.put(OFFLINE_URL, res);
}

self.addEventListener("install", (event) => {
  // A failed fetch here (installing while the network is down) must not block the worker: push still works, and the page is cached on the next visit.
  event.waitUntil(cacheOfflinePage().catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ll-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

// Refresh the offline page at most once a day, after a page loaded fine (so it follows copy changes without a new worker).
async function refreshOfflinePageIfOld() {
  const cache = await caches.open(OFFLINE_CACHE);
  const hit = await cache.match(OFFLINE_URL);
  const stamp = hit && Date.parse(hit.headers.get("date") || "");
  if (!hit || !stamp || Date.now() - stamp > DAY_MS) await cacheOfflinePage();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !PASS_PATH.test(url.pathname)) return;
  event.respondWith(
    fetch(req).then(
      (res) => {
        event.waitUntil(refreshOfflinePageIfOld().catch(() => undefined));
        return res;
      },
      // Only a network failure lands here (a 404 or 500 from the server is a response and passes through untouched).
      async () => (await caches.match(OFFLINE_URL)) || Response.error(),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Local Loyalty";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/me" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/me", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
