import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { ErrorState, Screen, SkeletonList } from "../../ui";

/** ll://e/<token> or https://…/e/<token> (the quote link from the shop): opens the event in My events. */
export default function CateringByToken() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useLocale();
  const q = useQuery({ queryKey: ["publicCatering", token], queryFn: () => api.catering.publicEvent(token!), enabled: !!token, retry: false });
  if (q.isLoading) return <Screen back><SkeletonList rows={3} /></Screen>;
  if (!q.data) return <Screen back><ErrorState message={t("rest.cat.badLink")} /></Screen>;
  return <Redirect href={`/events/${q.data.event.id}`} />;
}
