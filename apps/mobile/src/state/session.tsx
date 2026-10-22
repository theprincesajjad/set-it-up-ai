/**
 * Session: who is signed in, which mode the device is in (customer app or
 * staff counter mode), and small per-device preferences. Tokens live in
 * secure storage (state/storage.ts); the rest is cached so the app opens
 * offline (My card must render instantly).
 */
import type { authApi } from "@ll/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isApiError } from "../api/client";
import { api, apiClient, onSessionExpired, staffTokenHolder } from "./api";
import { queryClient } from "./query";
import { clearUserData, getJson, KEYS, secureTokenStore, setJson } from "./storage";

export type AppMode = "customer" | "counter";

export interface Prefs {
  user: authApi.AuthUserDto | null;
  merchants: authApi.MerchantMembershipDto[];
  mode: AppMode;
  lastPhone: string | null;
  lastEmail: string | null;
  /** Onboarding global consent choice: pre-fills (never pre-ticks for a new shop without the user's choice) per-shop consent. */
  globalConsent: boolean;
  platformConsent: boolean;
  pushPrompted: boolean;
  locationPrompted: boolean;
  notifications: { rewards: boolean; orders: boolean };
  neighbourhoodSlug: string | null;
  inWallet: { apple: boolean; google: boolean };
  notifyMe: string[];
}

const DEFAULT_PREFS: Prefs = {
  user: null,
  merchants: [],
  mode: "customer",
  lastPhone: null,
  lastEmail: null,
  globalConsent: false,
  platformConsent: false,
  pushPrompted: false,
  locationPrompted: false,
  notifications: { rewards: true, orders: true },
  neighbourhoodSlug: null,
  inWallet: { apple: false, google: false },
  notifyMe: [],
};

interface SessionValue {
  status: "loading" | "signedOut" | "signedIn";
  prefs: Prefs;
  user: authApi.AuthUserDto | null;
  merchants: authApi.MerchantMembershipDto[];
  mode: AppMode;
  /** Refresh failed: show "Sign in again" sheet. */
  expired: boolean;
  signIn: (res: authApi.AuthResponse, opts?: { mode?: AppMode; phone?: string; email?: string }) => Promise<void>;
  signOut: (opts?: { keepQueue?: boolean }) => Promise<void>;
  setMode: (mode: AppMode) => void;
  updatePrefs: (patch: Partial<Prefs>) => void;
  refreshMe: () => Promise<authApi.MeResponse | null>;
  dismissExpired: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue["status"]>("loading");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [expired, setExpired] = useState(false);

  const savePrefs = useCallback((next: Prefs) => {
    setPrefs(next);
    void setJson(KEYS.prefs, next);
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<Prefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        void setJson(KEYS.prefs, next);
        return next;
      });
    },
    [],
  );

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setPrefs((prev) => {
        const next = { ...prev, user: me.user, merchants: me.merchants };
        void setJson(KEYS.prefs, next);
        return next;
      });
      return me;
    } catch (e) {
      if (isApiError(e) && e.status === 401) setStatus("signedOut");
      return null;
    }
  }, []);

  // Boot: cached prefs first (instant, offline), then validate the session in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = { ...DEFAULT_PREFS, ...((await getJson<Partial<Prefs>>(KEYS.prefs)) ?? {}) };
      const tokens = await secureTokenStore.get();
      if (cancelled) return;
      setPrefs(cached);
      setStatus(tokens ? "signedIn" : "signedOut");
      if (tokens) void refreshMe();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  useEffect(
    () =>
      onSessionExpired(() => {
        setExpired(true);
        setStatus("signedOut");
      }),
    [],
  );

  const signIn = useCallback<SessionValue["signIn"]>(
    async (res, opts = {}) => {
      await apiClient.setSession(res);
      staffTokenHolder.clear();
      const next: Prefs = {
        ...prefs,
        user: res.user,
        mode: opts.mode ?? prefs.mode,
        lastPhone: opts.phone ?? prefs.lastPhone,
        lastEmail: opts.email ?? prefs.lastEmail,
      };
      savePrefs(next);
      setExpired(false);
      setStatus("signedIn");
      void refreshMe();
    },
    [prefs, refreshMe, savePrefs],
  );

  const signOut = useCallback<SessionValue["signOut"]>(
    async (opts = {}) => {
      const tokens = await secureTokenStore.get();
      const push = await getJson<{ token: string }>(KEYS.pushToken);
      if (push?.token) await api.me.removePushToken(push.token).catch(() => undefined);
      if (tokens?.refreshToken) await api.auth.logout(tokens.refreshToken).catch(() => undefined);
      await apiClient.setSession(null);
      staffTokenHolder.clear();
      queryClient.clear();
      const lastPhone = prefs.lastPhone;
      await clearUserData({ keepQueue: opts.keepQueue });
      savePrefs({ ...DEFAULT_PREFS, lastPhone });
      setStatus("signedOut");
    },
    [prefs.lastPhone, savePrefs],
  );

  const setMode = useCallback((mode: AppMode) => updatePrefs({ mode }), [updatePrefs]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      prefs,
      user: prefs.user,
      merchants: prefs.merchants,
      mode: prefs.mode,
      expired,
      signIn,
      signOut,
      setMode,
      updatePrefs,
      refreshMe,
      dismissExpired: () => setExpired(false),
    }),
    [status, prefs, expired, signIn, signOut, setMode, updatePrefs, refreshMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
