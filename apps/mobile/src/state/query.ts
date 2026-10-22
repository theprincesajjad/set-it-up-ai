import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isApiError } from "../api/client";
import { KEYS } from "./storage";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, err) => (isApiError(err) && err.status >= 400 && err.status < 500 ? false : count < 2),
      networkMode: "offlineFirst",
    },
    mutations: { retry: false, networkMode: "always" },
  },
});

/** Cached server state survives restarts so screens show data offline ("Updated 3 min ago"). */
export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: KEYS.queryCache, throttleTime: 2000 });

export const qk = {
  me: ["me"] as const,
  authMe: ["auth", "me"] as const,
  wallet: ["wallet"] as const,
  membership: (id: string) => ["membership", id] as const,
  card: ["card"] as const,
  walletPass: ["walletPass"] as const,
  notifications: ["notifications"] as const,
  notificationsUnread: ["notifications", "unread"] as const,
  notificationPrefs: ["notificationPrefs"] as const,
  feed: (k: string) => ["feed", k] as const,
  shops: (k: string) => ["shops", k] as const,
  shop: (slug: string) => ["shop", slug] as const,
  menu: (slug: string) => ["menu", slug] as const,
  campaigns: ["campaigns"] as const,
  neighbourhoods: ["neighbourhoods"] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["order", id] as const,
  tickets: ["tickets"] as const,
  ticket: (id: string) => ["ticket", id] as const,
  referral: (id: string) => ["referral", id] as const,
  counterMerchant: (id: string) => ["counter", "merchant", id] as const,
  counterRewards: (id: string) => ["counter", "rewards", id] as const,
  counterPromos: (id: string) => ["counter", "promos", id] as const,
  counterCategories: (id: string) => ["counter", "categories", id] as const,
  counterToday: (id: string, loc?: string) => ["counter", "today", id, loc ?? ""] as const,
  counterActivity: (id: string, loc?: string) => ["counter", "activity", id, loc ?? ""] as const,
  team: (id: string) => ["counter", "team", id] as const,
};
