/** TanStack Query hooks for the restaurant pack customer screens (tiffin, catering, banquet, WhatsApp consent). */
import type { customerApi, whatsappApi } from "@ll/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError } from "../../api/client";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { useWallet } from "../customer/queries";

export const rk = {
  plans: (slug: string, lang: string) => ["tiffin", "plans", slug, lang] as const,
  subs: ["tiffin", "subs"] as const,
  sub: (id: string) => ["tiffin", "sub", id] as const,
  upcoming: (id: string) => ["tiffin", "upcoming", id] as const,
  events: ["catering", "events"] as const,
  event: (id: string) => ["catering", "event", id] as const,
  halls: (slug: string) => ["banquet", "halls", slug] as const,
  availability: (slug: string, hallId: string, from: string, to: string) => ["banquet", "availability", slug, hallId, from, to] as const,
  bookings: ["banquet", "bookings"] as const,
  consent: (merchantId: string) => ["whatsapp", "consent", merchantId] as const,
};

/** The shop has the feature off (402), or does not exist / is not enabled here (403, 404). */
export const featureOff = (e: unknown) => isApiError(e) && (e.status === 402 || e.status === 403 || e.status === 404);

type Features = customerApi.CustomerFeaturesDto | undefined;

/** Public tiffin plans for a shop, in the app language (translations fall back per field). */
export function useTiffinPlans(slug: string | null | undefined, enabled = true) {
  const { locale } = useLocale();
  return useQuery({
    queryKey: rk.plans(slug ?? "none", locale),
    queryFn: () => api.tiffin.plans(slug!, { lang: locale, menuDays: 7 }),
    enabled: !!slug && enabled,
    retry: false,
    staleTime: 2 * 60_000,
  });
}

export function useHalls(slug: string | null | undefined, enabled = true) {
  return useQuery({ queryKey: rk.halls(slug ?? "none"), queryFn: () => api.banquet.halls(slug!), enabled: !!slug && enabled, retry: false, staleTime: 2 * 60_000 });
}

/**
 * My tiffin subscriptions, catering events and hall bookings. Only fetched when one of my shops has the
 * feature on (the wallet carries per-shop flags), like usePhase2, so there is no probing for 402s.
 */
export function useRestaurantMine(opts: { always?: boolean } = {}) {
  const { status } = useSession();
  const wallet = useWallet();
  const shops = wallet.data?.items ?? [];
  // Screens that list them (My tiffin, My events) ask for all three even when no wallet shop has the flag: the shop may be one I only visited.
  const tiffinOn = !!opts.always || shops.some((m) => m.features?.tiffin);
  const cateringOn = !!opts.always || shops.some((m) => m.features?.catering);
  const banquetOn = !!opts.always || shops.some((m) => m.features?.banquet);
  const signedIn = status === "signedIn";
  const subs = useQuery({ queryKey: rk.subs, queryFn: () => api.tiffin.subscriptions(), enabled: signedIn && tiffinOn, retry: false });
  const events = useQuery({ queryKey: rk.events, queryFn: () => api.catering.events(), enabled: signedIn && cateringOn, retry: false });
  const bookings = useQuery({ queryKey: rk.bookings, queryFn: () => api.banquet.bookings(), enabled: signedIn && banquetOn, retry: false });
  const subItems = tiffinOn ? (subs.data?.items ?? []) : [];
  const eventItems = cateringOn ? (events.data?.items ?? []) : [];
  const bookingItems = banquetOn ? (bookings.data?.items ?? []) : [];
  return {
    subs: subItems,
    events: eventItems,
    bookings: bookingItems,
    tiffinOn,
    cateringOn,
    banquetOn,
    /** Show "My tiffin": a shop of mine offers it, or I already subscribe. */
    tiffinEnabled: tiffinOn || subItems.length > 0,
    eventsEnabled: cateringOn || banquetOn || eventItems.length > 0 || bookingItems.length > 0,
    loading: (tiffinOn && subs.isLoading) || (cateringOn && events.isLoading) || (banquetOn && bookings.isLoading),
    refetch: () => Promise.all([tiffinOn ? subs.refetch() : null, cateringOn ? events.refetch() : null, banquetOn ? bookings.refetch() : null]),
  };
}

export function useMySubscription(id: string | undefined) {
  return useQuery({ queryKey: rk.sub(id ?? "none"), queryFn: () => api.tiffin.subscription(id!), enabled: !!id, refetchInterval: 60_000 });
}

export function useUpcoming(id: string | undefined) {
  return useQuery({ queryKey: rk.upcoming(id ?? "none"), queryFn: () => api.tiffin.upcoming({ days: 14, subscriptionId: id }), enabled: !!id, refetchInterval: 60_000 });
}

/** Refetch everything a subscription change can touch. */
export function useInvalidateTiffin() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: rk.subs });
    if (id) {
      void qc.invalidateQueries({ queryKey: rk.sub(id) });
      void qc.invalidateQueries({ queryKey: rk.upcoming(id) });
    }
  };
}

/** WhatsApp updates opt-in for one shop (GET/PUT /v1/me/merchants/:id/whatsapp-consent). Optimistic. */
export function useWhatsappConsent(merchantId: string | undefined, features: Features) {
  const { status } = useSession();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const on = status === "signedIn" && !!merchantId && !!features?.whatsapp;
  const query = useQuery({ queryKey: rk.consent(merchantId ?? "none"), queryFn: () => api.whatsapp.consent(merchantId!), enabled: on, retry: false });
  const set = useMutation({
    mutationFn: (optIn: boolean) => api.whatsapp.setConsent(merchantId!, { optIn, ...(locale !== "en" ? { language: locale as whatsappApi.WaLanguage } : {}) }),
    onMutate: async (optIn) => {
      const prev = qc.getQueryData<whatsappApi.WhatsappConsent>(rk.consent(merchantId!));
      if (prev) qc.setQueryData<whatsappApi.WhatsappConsent>(rk.consent(merchantId!), { ...prev, optedIn: optIn });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(rk.consent(merchantId!), ctx.prev);
    },
    onSuccess: (res) => qc.setQueryData(rk.consent(merchantId!), res),
  });
  return { available: on && !featureOff(query.error), query, set };
}
