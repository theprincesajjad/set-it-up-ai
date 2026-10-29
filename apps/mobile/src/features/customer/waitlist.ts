/** The client's waitlist asks (phase-pro P2): list, remove, take an open offer. Kept beside the screen, out of api/endpoints.ts. */
import type { waitlistApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../state/api";
import { useSession } from "../../state/session";

const enc = encodeURIComponent;

export const waitlist = {
  list: () => apiClient.get<waitlistApi.MyWaitlistResponse>("/v1/me/waitlist"),
  remove: (id: string) => apiClient.del<void>(`/v1/me/waitlist/${enc(id)}`),
  take: (id: string) => apiClient.post<waitlistApi.TakeOfferResponse>(`/v1/me/waitlist/${enc(id)}/take`, {}),
};

export const WAITLIST_KEY = ["waitlist", "mine"] as const;

export function useMyWaitlist() {
  const { status } = useSession();
  return useQuery({ queryKey: WAITLIST_KEY, queryFn: waitlist.list, enabled: status === "signedIn", retry: false, staleTime: 15_000 });
}
