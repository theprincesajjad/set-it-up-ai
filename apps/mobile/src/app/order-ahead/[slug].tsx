import type { commerceApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { useOrderAhead } from "../../features/customer/queries";
import { formatMoney } from "../../lib/award";
import { addToCart, cartCount, cartSubtotal, orderItems, pickupChoices, setQuantity, unitPrice, type CartLine, type CartModifier } from "../../lib/cart";
import { newIdempotencyKey } from "../../lib/ids";
import { useLocale } from "../../lib/i18n";
import { LanguageSwitcher } from "../../lib/i18n/LanguageSwitcher";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { Banner, Button, Card, Chip, EmptyState, ErrorState, IconButton, ListRow, LockedFeature, Minus, Plus, Screen, Section, Sheet, ShoppingBag, SkeletonList, Text, TextField } from "../../ui";

/** Order-ahead (Phase 2, orders.order_ahead): menu → cart → pickup time → place order → tracker. */
export default function OrderAhead() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const qc = useQueryClient();
  const { t: tr, money, pick, time } = useLocale();
  const menu = useOrderAhead(slug);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [item, setItem] = useState<commerceApi.CatalogItemDto | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [checkout, setCheckout] = useState(false);
  const [pickupAt, setPickupAt] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const m = menu.data;
  const location = m?.locations[0] ?? null;
  const slots = useQuery({
    queryKey: ["slots", slug ?? "", location?.id ?? ""],
    queryFn: () => api.commerce.slots(slug!, { kind: "pickup", locationId: location?.id }),
    enabled: !!m?.pickupSlots && !!location && checkout,
  });
  const times = useMemo(() => pickupChoices(new Date()), [checkout]);

  if (menu.isLoading) return <Screen back><SkeletonList rows={4} rowHeight={72} /></Screen>;
  if (menu.isError || !m) {
    const locked = isApiError(menu.error) && menu.error.status === 402;
    return (
      <Screen back title="Order ahead">
        {locked ? (
          <LockedFeature icon={ShoppingBag} title="Order ahead" body={t("soon.orderAhead")} />
        ) : (
          <ErrorState message={t("err.network")} onRetry={() => menu.refetch()} />
        )}
      </Screen>
    );
  }

  const sections = [...m.categories.map((cat) => ({ title: cat.name, items: cat.items })), ...(m.uncategorized.length ? [{ title: tr("menu.title"), items: m.uncategorized }] : [])];
  const selectedMods = (it: commerceApi.CatalogItemDto): CartModifier[] =>
    it.modifiers.flatMap((g) => {
      const name = choice[g.name] ?? g.options[0]?.name;
      const opt = g.options.find((o) => o.name === name);
      return opt ? [{ name: g.name, option: opt.name, priceCents: opt.priceCents }] : [];
    });

  const place = async () => {
    if (!location) return;
    setPlacing(true);
    setError(null);
    try {
      const res = await api.commerce.placeOrder({
        merchantId: m.merchant.id,
        locationId: location.id,
        items: orderItems(cart),
        pickupAt: slotId ? null : pickupAt,
        slotId,
        tipCents: 0,
        notes: notes.trim() || null,
        // In-app card payment needs the Stripe SDK (not in this build): pay at pickup.
        paymentMethod: "at_pickup",
        idempotencyKey: idemKey,
      });
      void qc.invalidateQueries({ queryKey: qk.orders });
      setCheckout(false);
      router.replace(`/orders/${res.order.id}`);
    } catch (e) {
      if (isApiError(e) && e.status < 500) setIdemKey(newIdempotencyKey());
      setError(isApiError(e) && e.code === "item_unavailable" ? "Something in your order just sold out. Check your cart." : errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Screen
      back
      title={m.merchant.name}
      footer={
        cart.length > 0 ? (
          <Button size="lg" fullWidth onPress={() => setCheckout(true)}>
            {`${tr("cart.review")} · ${cartCount(cart)} · ${money(cartSubtotal(cart))}`}
          </Button>
        ) : undefined
      }
    >
      <LanguageSwitcher />
      <Text color="fgMuted">{`Pick up at ${location?.name ?? m.merchant.name}${location?.address ? `, ${location.address}` : ""}. Pay at pickup.`}</Text>
      {sections.length === 0 ? <EmptyState icon={ShoppingBag} title="Nothing to order right now" body="Check back later." /> : null}
      {sections.map((sec) => (
        <Section key={sec.title} title={sec.title}>
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {sec.items.map((it) => (
              <ListRow
                key={it.id}
                title={pick(it).name}
                subtitle={pick(it).description}
                trailing={<Text variant="bodyStrong" tabular>{money(it.priceCents)}</Text>}
                onPress={() => {
                  setChoice({});
                  setItem(it);
                }}
              />
            ))}
          </Card>
        </Section>
      ))}

      <Sheet
        visible={!!item}
        onClose={() => setItem(null)}
        title={item ? pick(item).name : undefined}
        footer={
          item ? (
            <Button
              fullWidth
              onPress={() => {
                setCart((c) => addToCart(c, { catalogItemId: item.id, name: item.name, basePriceCents: item.priceCents, quantity: 1, modifiers: selectedMods(item) }));
                setItem(null);
              }}
            >
              {`${tr("menu.add")} · ${money(unitPrice({ basePriceCents: item.priceCents, modifiers: selectedMods(item) }))}`}
            </Button>
          ) : undefined
        }
      >
        {item && pick(item).description ? <Text color="fgMuted">{pick(item).description}</Text> : null}
        {item?.modifiers.map((g) => (
          <View key={g.name} style={{ gap: 8 }}>
            <Text variant="label">{g.name}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {g.options.map((o) => (
                <Chip key={o.name} label={o.priceCents ? `${o.name} +${formatMoney(o.priceCents)}` : o.name} selected={(choice[g.name] ?? g.options[0]?.name) === o.name} onPress={() => setChoice((c) => ({ ...c, [g.name]: o.name }))} />
              ))}
            </View>
          </View>
        ))}
      </Sheet>

      <Sheet
        visible={checkout}
        onClose={() => setCheckout(false)}
        title={tr("cart.title")}
        footer={
          <Button size="lg" fullWidth loading={placing} disabled={cart.length === 0 || (!pickupAt && !slotId)} onPress={place}>
            {tr("checkout.placeOrder")}
          </Button>
        }
      >
        {cart.map((l) => (
          <View key={l.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{l.name}</Text>
              {l.modifiers.length ? <Text variant="bodySm" color="fgMuted">{l.modifiers.map((x) => x.option).join(", ")}</Text> : null}
            </View>
            <IconButton icon={Minus} label={`One less ${l.name}`} onPress={() => setCart((c) => setQuantity(c, l.key, l.quantity - 1))} />
            <Text variant="bodyStrong" tabular>
              {String(l.quantity)}
            </Text>
            <IconButton icon={Plus} label={`One more ${l.name}`} onPress={() => setCart((c) => setQuantity(c, l.key, l.quantity + 1))} />
          </View>
        ))}
        <Text variant="bodySm" color="fgMuted">{`About ${formatMoney(cartSubtotal(cart))} before tax. The shop confirms the total.`}</Text>
        <Text variant="label">{tr("checkout.pickupTime")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {m.pickupSlots && (slots.data?.items.length ?? 0) > 0
            ? slots.data!.items.slice(0, 16).map((s) => (
                <Chip key={s.id} label={time(s.startsAt)} selected={slotId === s.id} onPress={() => { setSlotId(s.id); setPickupAt(null); }} />
              ))
            : times.map((d, i) => (
                <Chip key={d.toISOString()} label={i === 0 ? `${tr("checkout.asap")} · ${time(d)}` : time(d)} selected={pickupAt === d.toISOString()} onPress={() => { setPickupAt(d.toISOString()); setSlotId(null); }} />
              ))}
        </ScrollView>
        <TextField label="Note for the shop" optionalLabel value={notes} onChangeText={setNotes} maxLength={500} placeholder="Oat milk please" />
        {error ? <Banner variant="danger">{error}</Banner> : null}
      </Sheet>
    </Screen>
  );
}
