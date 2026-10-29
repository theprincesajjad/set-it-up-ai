"use client";
/**
 * Web push on the web pass (phase solo, workstream D): the second rung of the reminder ladder. Registers /sw.js, asks for
 * permission, subscribes with the API's VAPID key and stores the subscription (POST /v1/me/web-push).
 *
 * iPhone and iPad only allow web push for a page added to the home screen (iOS 16.4+), so there the prompt asks for that first.
 */
import { browserApi } from "@/lib/api/browser";

export type WebPushSupport = "supported" | "ios_install" | "unsupported";

export function webPushSupport(): WebPushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios_install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "supported";
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** This browser's current subscription, if any (no prompt). */
export async function currentWebPush(): Promise<PushSubscription | null> {
  if (webPushSupport() !== "supported") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask, subscribe and save. Resolves "on", "denied" or "failed". */
export async function turnOnWebPush(): Promise<"on" | "denied" | "failed"> {
  try {
    if (webPushSupport() !== "supported") return "failed";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const { publicKey } = await browserApi.me.webPushKey();
    if (!publicKey) return "failed";
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.keys?.p256dh || !json.keys.auth) return "failed";
    await browserApi.me.webPushSubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: navigator.userAgent.slice(0, 300) });
    return "on";
  } catch {
    return "failed";
  }
}

export async function turnOffWebPush(): Promise<void> {
  const sub = await currentWebPush();
  if (!sub) return;
  await browserApi.me.webPushUnsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
