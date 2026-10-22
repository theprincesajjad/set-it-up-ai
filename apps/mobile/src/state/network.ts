import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { API_URL } from "../config";

/** Native. Expo web uses network.web.ts (browser online/offline events). */
function isOnline(s: NetInfoState): boolean {
  return s.isConnected !== false && s.isInternetReachable !== false;
}

/** Online when NetInfo says connected and the internet is reachable (null = unknown → assume online). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(isOnline(s));
      }),
    [],
  );
  return online;
}

/** Let TanStack Query pause/resume with the network. */
export function wireQueryOnlineManager(): void {
  // Where NetInfo probes reachability itself (native reachability off), ask our API rather than Google: "can I reach the server" is what the counter queue cares about.
  NetInfo.configure({ reachabilityUrl: `${API_URL}/health`, reachabilityTest: async (r) => r.status === 200, reachabilityRequestTimeout: 8000 });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) => {
      setOnline(isOnline(s));
    }),
  );
}
