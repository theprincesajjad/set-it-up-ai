import type { networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { failCopy } from "../../features/customer/failCopy";
import { useWallet } from "../../features/customer/queries";
import { failKind } from "../../lib/failKind";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { CloudOff, FailView, Screen } from "../../ui";

/** Universal link /j/<qrCode> (counter QR stand): onboarding with the shop context, or straight to joining. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { status } = useSession();
  if (status === "loading") return null;
  if (status === "signedOut") return <Redirect href={{ pathname: "/welcome", params: { join: code } }} />;
  return <SignedInJoin code={code} />;
}

/**
 * Signed in and scanning a shop's QR: a member is taken to the shop (the everyday case at the counter: nothing to join again),
 * a new shop opens the join step, and a code that does not work says so instead of showing an empty "Join this shop".
 */
function SignedInJoin({ code }: { code: string }) {
  const L = useLocale();
  const { t } = L;
  const { c } = useTheme();
  const info = useQuery<networkApi.JoinInfoResponse>({ queryKey: ["joinInfo", code], queryFn: () => api.network.joinInfo(code), retry: false });
  const wallet = useWallet();
  const blank = <View style={{ flex: 1, backgroundColor: c.bg }} />;

  if (info.isError) {
    const kind = failKind(info.error);
    const toMap = () => router.replace("/map");
    const toCards = () => router.replace("/wallet");
    if (kind === "notFound" || kind === "expired") {
      return (
        <Screen>
          <FailView title={t("mf.join.bad.title")} body={t("mf.join.bad.body")} primaryLabel={t("err.action.findShops")} onPrimary={toMap} secondaryLabel={t("mf.go.cards")} onSecondary={toCards} help={t("err.help.customer")} />
        </Screen>
      );
    }
    const f = failCopy(L, info.error);
    return (
      <Screen>
        <FailView icon={f.offline ? CloudOff : undefined} title={f.title} body={f.body} primaryLabel={t("err.action.retry")} onPrimary={() => void info.refetch()} secondaryLabel={t("err.action.findShops")} onSecondary={toMap} />
      </Screen>
    );
  }
  if (!info.data || wallet.isLoading) return blank;
  const mine = wallet.data?.items.find((m) => m.merchant.id === info.data.merchant.id);
  if (mine) return <Redirect href={{ pathname: "/shop/[slug]", params: { slug: mine.merchant.slug } }} />;
  return <Redirect href={{ pathname: "/name", params: { join: code, returning: "1" } }} />;
}
