import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/** Online when NetInfo says connected and the internet is reachable (null = unknown → assume online). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(s.isConnected !== false && s.isInternetReachable !== false);
      }),
    [],
  );
  return online;
}

/** Let TanStack Query pause/resume with the network. */
export function wireQueryOnlineManager(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) => {
      setOnline(s.isConnected !== false && s.isInternetReachable !== false);
    }),
  );
}
