/** TanStack Query hooks for the customer app (server state; persisted for offline). */
import type { customerApi } from "@ll/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isApiError } from "../../api/client";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { getJson, KEYS, setJson } from "../../state/storage";

export function useWallet() {
  const { status } = useSession();
  return useQuery({ queryKey: qk.wallet, queryFn: api.me.memberships, enabled: status === "signedIn" });
}

export function useProfile() {
  const { status } = useSession();
  return useQuery({ queryKey: qk.me, queryFn: api.me.profile, enabled: status === "signedIn" });
}

export function useMembershipDetail(memberId: string | null | undefined, opts: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: qk.membership(memberId ?? "none"),
    queryFn: () => api.me.membership(memberId!),
    enabled: !!memberId,
    refetchInterval: opts.refetchInterval,
  });
}

/** Details for several memberships (rewards ready, discount cards). Capped to keep old phones quick. */
export function useMembershipDetails(memberIds: string[]) {
  return useQueries({
    queries: memberIds.slice(0, 12).map((id) => ({ queryKey: qk.membership(id), queryFn: () => api.me.membership(id), staleTime: 60_000 })),
  });
}

/**
 * My card: cached in AsyncStorage as well as the query cache, so the QR renders
 * instantly and offline (even after > 7 days without a refresh).
 */
export function useCard() {
  const { status } = useSession();
  const [cached, setCached] = useState<customerApi.CardResponse | null>(null);
  useEffect(() => {
    void getJson<customerApi.CardResponse>(KEYS.card).then((c) => c && setCached(c));
  }, []);
  const q = useQuery({
    queryKey: qk.card,
    queryFn: async () => {
      const card = await api.me.card();
      await setJson(KEYS.card, card);
      return card;
    },
    enabled: status === "signedIn",
    staleTime: 10 * 60_000,
  });
  return { ...q, card: q.data ?? cached };
}

export function useCampaigns(lat?: number, lng?: number) {
  const { status } = useSession();
  return useQuery({ queryKey: [...qk.campaigns, lat ?? 0, lng ?? 0], queryFn: () => api.me.campaigns(lat, lng), enabled: status === "signedIn" });
}

/** True when the API says the feature is switched off for this shop/user (402/403/404) — hide the entry point. */
export function isFeatureOff(e: unknown): boolean {
  return isApiError(e) && (e.status === 402 || e.status === 403 || e.status === 404);
}

/**
 * Phase 2 (orders + repair tickets). Shown only when the API returns data:
 * locked features answer 402 and an empty list means nothing to show.
 */
export function usePhase2() {
  const { status } = useSession();
  const orders = useQuery({ queryKey: qk.orders, queryFn: () => api.commerce.orders(), enabled: status === "signedIn", retry: false });
  const tickets = useQuery({ queryKey: qk.tickets, queryFn: () => api.service.tickets(), enabled: status === "signedIn", retry: false });
  const orderItems = orders.data?.items ?? [];
  const ticketItems = tickets.data?.items ?? [];
  return {
    orders: orderItems,
    tickets: ticketItems,
    enabled: orderItems.length > 0 || ticketItems.length > 0,
    loading: orders.isLoading || tickets.isLoading,
    refetch: () => Promise.all([orders.refetch(), tickets.refetch()]),
  };
}

export function useOrderAhead(slug: string | null | undefined) {
  return useQuery({ queryKey: qk.menu(slug ?? "none"), queryFn: () => api.commerce.menu(slug!), enabled: !!slug, retry: false, staleTime: 5 * 60_000 });
}
