/** TanStack Query hooks for the customer class screens: the studio's schedule and the person's own passes, memberships and bookings. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "../../state/api";
import { useSession } from "../../state/session";

export const ck = {
  studio: (slug: string) => ["classes", "studio", slug] as const,
  mine: ["classes", "mine"] as const,
};

/** The studio's schedule, offers and policy; signed-in viewers also get their own booking state on each class. */
export function useStudio(slug: string | null | undefined) {
  const { status } = useSession();
  return useQuery({ queryKey: [...ck.studio(slug ?? "none"), status], queryFn: () => api.classes.studio(slug!), enabled: !!slug, retry: false, staleTime: 30_000 });
}

/** The signed-in person's passes, memberships and booked classes (all studios). */
export function useMyClasses(enabled = true) {
  const { status } = useSession();
  return useQuery({ queryKey: ck.mine, queryFn: () => api.classes.mine(), enabled: enabled && status === "signedIn", retry: false, staleTime: 15_000 });
}

/** After any booking, purchase or membership change: refetch the schedule and the person's own list. */
export function useRefreshClasses() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["classes"] }), qc.refetchQueries({ queryKey: ck.mine })]);
  }, [qc]);
}
