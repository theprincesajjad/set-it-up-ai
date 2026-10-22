/**
 * Expo web version of network.ts: the browser's online/offline events.
 * (NetInfo's web reachability probe stays "unreachable" after a reconnect until its long timeout.)
 */
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const now = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

function subscribe(cb: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", off);
  };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(now);
  useEffect(() => subscribe(setOnline), []);
  return online;
}

export function wireQueryOnlineManager(): void {
  onlineManager.setEventListener((setOnline) => subscribe(setOnline));
}
