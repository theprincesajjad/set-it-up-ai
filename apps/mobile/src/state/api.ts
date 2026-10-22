/** App-wide API singletons: client (secure-store tokens), endpoints and the staff PIN token holder. */
import { Platform } from "react-native";
import { createApiClient, type StoredTokens } from "../api/client";
import { createEndpoints } from "../api/endpoints";
import { API_URL } from "../config";
import { secureTokenStore } from "./storage";

type Listener = () => void;
const expiredListeners = new Set<Listener>();
const staffExpiredListeners = new Set<Listener>();

/** Staff PIN token (memory only: the device asks for the PIN again after a restart or 15 min idle). */
let staffToken: { accessToken: string; accessTokenExpiresAt: string } | null = null;

export const staffTokenHolder = {
  get() {
    if (staffToken && new Date(staffToken.accessTokenExpiresAt).getTime() <= Date.now()) staffToken = null;
    return staffToken;
  },
  set(t: { accessToken: string; accessTokenExpiresAt: string } | null) {
    staffToken = t;
  },
  clear() {
    staffToken = null;
  },
};

export const apiClient = createApiClient({
  baseUrl: API_URL,
  tokenStore: secureTokenStore,
  staffToken: staffTokenHolder,
  onSessionExpired: () => expiredListeners.forEach((l) => l()),
  onStaffTokenExpired: () => staffExpiredListeners.forEach((l) => l()),
  userAgent: `ll-mobile/${Platform.OS}`,
});

export const api = createEndpoints(apiClient);

export function onSessionExpired(l: Listener): () => void {
  expiredListeners.add(l);
  return () => expiredListeners.delete(l);
}

export function onStaffTokenExpired(l: Listener): () => void {
  staffExpiredListeners.add(l);
  return () => staffExpiredListeners.delete(l);
}

export type { StoredTokens };
