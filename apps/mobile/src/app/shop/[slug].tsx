import { router, useLocalSearchParams } from "expo-router";
import { failCopy } from "../../features/customer/failCopy";
import { ShopBody, ShopCardCta, useShopModel } from "../../features/customer/ShopBody";
import { failKind } from "../../lib/failKind";
import { useLocale } from "../../lib/i18n";
import { useOnline } from "../../state/network";
import { CloudOff, FailView, Screen, SkeletonList } from "../../ui";

/** 3. Shop page (pushed from wallet, links, rewards): the same body as the Explore sheet. */
export default function ShopDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const online = useOnline();
  const L = useLocale();
  const { t } = L;
  const model = useShopModel(slug);
  if (model.shop.isLoading) {
    return (
      <Screen back>
        <SkeletonList rows={4} rowHeight={72} />
      </Screen>
    );
  }
  if (!model.shop.data) {
    // Say what really happened: a missing shop is not an outage, and no signal is not a shop that left.
    const kind = online ? failKind(model.shop.error) : "offline";
    const toMap = () => router.replace("/map");
    const toCards = () => router.replace("/wallet");
    if (kind === "notFound" || kind === "expired") {
      return (
        <Screen back>
          <FailView title={t("mf.shop.nf.title")} body={t("mf.shop.nf.body")} primaryLabel={t("err.action.findShops")} onPrimary={toMap} secondaryLabel={t("mf.go.cards")} onSecondary={toCards} help={t("err.help.customer")} />
        </Screen>
      );
    }
    const copy = failCopy(L, model.shop.error, kind === "offline");
    return (
      <Screen back>
        <FailView
          icon={copy.offline ? CloudOff : undefined}
          title={copy.title}
          body={copy.body}
          primaryLabel={t("err.action.retry")}
          onPrimary={() => void model.shop.refetch()}
          secondaryLabel={t("err.action.findShops")}
          onSecondary={toMap}
        />
      </Screen>
    );
  }
  return (
    <Screen back collapseTitle title={model.shop.data.merchant.name} titleCase="as-is" refreshing={model.shop.isRefetching} onRefresh={model.refetch} contentStyle={{ paddingTop: 8, paddingHorizontal: 20 }} footer={model.membership ? <ShopCardCta model={model} /> : undefined}>
      <ShopBody model={model} />
    </Screen>
  );
}
