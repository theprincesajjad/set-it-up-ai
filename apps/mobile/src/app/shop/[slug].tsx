import { useLocalSearchParams } from "expo-router";
import { t } from "../../copy/en-CA";
import { ShopBody, useShopModel } from "../../features/customer/ShopBody";
import { useOnline } from "../../state/network";
import { ErrorState, Screen, SkeletonList } from "../../ui";

/** 3. Shop page (pushed from wallet, links, rewards): the same body as the Explore sheet. */
export default function ShopDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const online = useOnline();
  const model = useShopModel(slug);
  if (model.shop.isLoading) {
    return (
      <Screen back>
        <SkeletonList rows={4} rowHeight={72} />
      </Screen>
    );
  }
  if (!model.shop.data) {
    return (
      <Screen back>
        <ErrorState offline={!online} message={online ? "This shop isn't on the network right now." : t("err.network")} onRetry={() => model.shop.refetch()} />
      </Screen>
    );
  }
  return (
    <Screen back collapseTitle title={model.shop.data.merchant.name} titleCase="as-is" refreshing={model.shop.isRefetching} onRefresh={model.refetch} contentStyle={{ paddingTop: 8 }}>
      <ShopBody model={model} />
    </Screen>
  );
}
