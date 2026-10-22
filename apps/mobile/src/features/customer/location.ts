import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

export type LocState = { status: "unknown" | "denied" | "granted"; coords: { lat: number; lng: number } | null };

/** Foreground location, only after the user opted in from a pre-permission prompt. */
export function useDeviceLocation(enabled: boolean) {
  const [state, setState] = useState<LocState>({ status: "unknown", coords: null });

  const read = useCallback(async () => {
    try {
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setState({ status: "granted", coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
    } catch {
      setState((s) => ({ ...s, status: "granted" }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void Location.getForegroundPermissionsAsync().then((p) => {
      if (p.granted) void read();
      else setState({ status: p.canAskAgain ? "unknown" : "denied", coords: null });
    });
  }, [enabled, read]);

  const request = useCallback(async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.granted) await read();
    else setState({ status: "denied", coords: null });
    return p.granted;
  }, [read]);

  return { ...state, request, refresh: read };
}
