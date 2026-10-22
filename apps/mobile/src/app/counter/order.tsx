import type { commerceApi, restaurantApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { isApiError } from "../../api/client";
import { TenderChoice } from "../../features/counter/tender";
import { tenderPrices } from "../../lib/kitchen";
import { newIdempotencyKey as newKey } from "../../lib/ids";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { Banner, Button, IconButton, ListRow, Minus, Plus, Screen, Section, Skeleton, Text, useToast } from "../../ui";

/** Ring up a walk-in or dine-in order at the counter and take it as cash or card (restaurant shops with order-ahead). */
export default function RingUp() {
  const { config } = useCounter();
  const { t, money } = useLocale();
  const toast = useToast();
  const mId = config.merchantId ?? "";
  const menu = useQuery({ queryKey: ["counter", "ringup-menu", mId], queryFn: () => api.kitchen.catalog(mId), enabled: !!mId });
  const dual = useQuery({ queryKey: ["counter", "dual", mId], queryFn: () => api.kitchen.dualPricing(mId).catch(() => null), enabled: !!mId });
  const bps = dual.data?.cashDiscountBps ?? 0;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [tender, setTender] = useState<restaurantApi.Tender>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());

  const items = useMemo(() => (menu.data?.items ?? []).filter((i) => i.available && i.orderable && !i.preorderOnly), [menu.data]);
  const lines = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const subtotal = lines.reduce((s, i) => s + i.priceCents * (qty[i.id] ?? 0), 0);
  const prices = tenderPrices(subtotal, bps);
  const set = (i: commerceApi.CatalogItemDto, d: number) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.min(50, (q[i.id] ?? 0) + d)) }));

  const charge = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await api.kitchen.counterOrder(mId, { items: lines.map((i) => ({ catalogItemId: i.id, quantity: qty[i.id]!, modifiers: [] })), tender, tipCents: 0 }, key.current);
      toast({ tone: "success", message: `#${order.number} · ${money(order.totalCents)}` });
      key.current = newKey();
      router.back();
    } catch (e) {
      setError(isApiError(e) ? e.message : "Can't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title={t("tender.title")}
      footer={
        <Button size="counter" disabled={!lines.length} loading={busy} onPress={charge}>
          {t("tender.charge", { amount: money(tender === "cash" ? prices.cash : prices.card) })}
        </Button>
      }
    >
      {error ? <Banner variant="danger">{error}</Banner> : null}
      <TenderChoice subtotalCents={subtotal} cashDiscountBps={bps} value={tender} onChange={setTender} />
      <Text variant="meta" color="fgMuted">
        Before tax{bps > 0 ? `. Cash price is ${bps / 100}% off the card price.` : "."}
      </Text>
      <Section title={t("tender.addItems")}>
        {menu.isLoading ? (
          <Skeleton height={160} radius={16} />
        ) : (
          <View>
            {items.map((i, n) => (
              <ListRow
                key={i.id}
                divider={n < items.length - 1}
                minHeight={64}
                title={i.name}
                subtitle={money(i.priceCents)}
                trailing={
                  <View style={styles.stepper}>
                    <IconButton variant="secondary" icon={Minus} label={`Remove one ${i.name}`} onPress={() => set(i, -1)} disabled={!(qty[i.id] ?? 0)} />
                    <Text variant="bodyStrong" tabular style={{ minWidth: 22, textAlign: "center" }}>
                      {qty[i.id] ?? 0}
                    </Text>
                    <IconButton variant="secondary" icon={Plus} label={`Add one ${i.name}`} onPress={() => set(i, 1)} />
                  </View>
                }
              />
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
});
