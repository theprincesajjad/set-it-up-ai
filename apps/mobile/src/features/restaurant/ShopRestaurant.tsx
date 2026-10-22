/**
 * Restaurant pack pieces of the shop page: the dietary badges under the open line, the "meals and events"
 * entry points (tiffin, catering, banquet halls) and the WhatsApp updates switch. Everything shows only when the
 * shop's `features` flags say so; halal and dietary claims are the shop's own and are labelled that way.
 */
import { spiceKey, type customerApi, type networkApi } from "@ll/shared";
import { router } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { useLocale } from "../../lib/i18n";
import { summarizeDiet } from "../../lib/restaurant";
import { ui } from "../../theme";
import { Badge, ListRow, Section, ShoppingBag, Store, SwitchRow, Text, Ticket, useToast } from "../../ui";
import { useOrderAhead } from "../customer/queries";
import { useHalls, useTiffinPlans, useWhatsappConsent } from "./queries";

type Features = customerApi.CustomerFeaturesDto | undefined;

/** Halal / zabihah / vegetarian / spice badges from what the shop tagged on its menu and plans. */
export function ShopDietary({ slug, features }: { slug: string; features: Features }) {
  const { t } = useLocale();
  const menuOn = !!features?.dietaryTags && !!features.orderAhead;
  const menu = useOrderAhead(menuOn ? slug : null);
  const plans = useTiffinPlans(slug, !!features?.tiffin);
  const summary = useMemo(() => {
    const items = menu.data ? [...menu.data.categories.flatMap((c) => c.items), ...menu.data.uncategorized] : [];
    const list = [...items.map((i) => i.dietary), ...(plans.data?.plans ?? []).map((p) => p.dietary)];
    return summarizeDiet(list);
  }, [menu.data, plans.data]);
  const badges: string[] = [];
  if (summary.zabihah) badges.push(t("diet.zabihah"));
  if (summary.halal) badges.push(summary.halal === "all" ? t("rest.diet.halalAll") : t("rest.diet.halalSome"));
  if (summary.veg) badges.push(summary.veg === "all" ? t("rest.diet.vegAll") : t("rest.diet.vegSome"));
  if (summary.maxSpice !== null && summary.maxSpice > 0) badges.push(t("rest.diet.spiceUpTo", { level: t(spiceKey(summary.maxSpice)) }));
  if (badges.length === 0) return null;
  return (
    <View style={{ marginTop: 12, gap: 6 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {badges.map((b) => (
          <Badge key={b}>{b}</Badge>
        ))}
      </View>
      {summary.halal ? (
        <Text style={ui(12, 400, 16)} color="fgMuted">
          {[summary.certifiers.length ? t("diet.certifiedBy", { certifier: summary.certifiers.join(", ") }) : null, t("diet.shopClaim")].filter(Boolean).join(". ").replace(/\.\.$/, ".")}
        </Text>
      ) : null}
    </View>
  );
}

/** Tiffin plans, catering and banquet halls: one row each, only for what the shop offers. */
export function ShopRestaurantRows({ shop, features }: { shop: networkApi.PublicShopResponse; features: Features }) {
  const { t, money } = useLocale();
  const slug = shop.merchant.slug;
  const plans = useTiffinPlans(slug, !!features?.tiffin);
  const halls = useHalls(slug, !!features?.banquet);
  const tiffin = !!features?.tiffin && plans.data?.plans.length !== 0;
  const banquet = !!features?.banquet && halls.data?.items.length !== 0;
  const catering = !!features?.catering;
  if (!tiffin && !banquet && !catering) return null;
  const cheapest = plans.data?.plans.length ? Math.min(...plans.data.plans.map((p) => p.priceCents)) : null;
  const rows = [
    tiffin && {
      key: "tiffin",
      icon: ShoppingBag,
      title: t("rest.tiffin.plans"),
      subtitle: cheapest !== null ? t("rest.shop.tiffin.from", { price: money(cheapest) }) : t("rest.shop.tiffin.sub"),
      to: `/tiffin/plans/${slug}`,
    },
    catering && { key: "catering", icon: Ticket, title: t("rest.cat.title"), subtitle: t("rest.shop.catering.sub"), to: `/catering/${slug}` },
    banquet && { key: "banquet", icon: Store, title: t("rest.bk.title"), subtitle: t("rest.shop.banquet.sub"), to: `/banquet/${slug}` },
  ].filter(Boolean) as { key: string; icon: typeof Store; title: string; subtitle: string; to: string }[];
  return (
    <Section title={t("rest.shop.section")}>
      {rows.map((r, i) => (
        <ListRow key={r.key} leadingIcon={r.icon} title={r.title} subtitle={r.subtitle} chevron divider={i < rows.length - 1} onPress={() => router.push(r.to as never)} />
      ))}
    </Section>
  );
}

/** "WhatsApp updates from this shop": the per-shop opt-in (PUT /v1/me/merchants/:id/whatsapp-consent). */
export function ShopWhatsapp({ shop, features }: { shop: networkApi.PublicShopResponse; features: Features }) {
  const { t } = useLocale();
  const toast = useToast();
  const { available, query, set } = useWhatsappConsent(shop.merchant.id, features);
  if (!available || !query.data) return null;
  return (
    <Section title={t("rest.wa.section")}>
      <SwitchRow
        label={t("rest.wa.title")}
        description={query.data.optedIn ? t("rest.wa.on", { shop: shop.merchant.name }) : t("rest.wa.off", { shop: shop.merchant.name })}
        value={query.data.optedIn}
        disabled={set.isPending}
        divider={false}
        onValueChange={(v) => set.mutate(v, { onSuccess: () => toast({ message: v ? t("rest.wa.enabled", { shop: shop.merchant.name }) : t("rest.wa.disabled", { shop: shop.merchant.name }) }), onError: () => toast({ tone: "error", message: t("rest.err.save") }) })}
      />
    </Section>
  );
}
