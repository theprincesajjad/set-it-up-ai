/** You tab: "Waiting for a spot", shown only while the client is on a shop's waitlist (phase-pro P2). */
import { router } from "expo-router";
import { useLocale } from "../../lib/i18n";
import { Clock, ListRow } from "../../ui";
import { useMyWaitlist } from "./waitlist";

export function WaitlistRow() {
  const { t } = useLocale();
  const q = useMyWaitlist();
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  const offer = items.find((e) => e.offer);
  return <ListRow leadingIcon={Clock} title={t("wl.mine.title")} subtitle={offer ? t("wl.mine.offerShort", { shop: offer.merchant.name }) : t("wl.mine.count", { n: items.length })} chevron onPress={() => router.push("/appointments/waitlist" as never)} />;
}
