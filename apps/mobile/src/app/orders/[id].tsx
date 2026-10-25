import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "../../api/client";
import { formatMoneyL, formatPtsL } from "../../lib/formatL";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { Banner, Button, Card, ConfirmDialog, ErrorState, OrderTracker, Screen, Section, SkeletonList, Text } from "../../ui";

/** Order detail: tracker (polls while open), items, totals. */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const L = useLocale();
  const { t } = L;
  const formatMoney = (c: number) => formatMoneyL(L, c);
  const qc = useQueryClient();
  const order = useQuery({
    queryKey: qk.order(id ?? ""),
    queryFn: () => api.commerce.order(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ["pending", "accepted", "preparing", "ready"].includes(q.state.data.status) ? 10_000 : false),
  });
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (order.isLoading) return <Screen back><SkeletonList rows={3} /></Screen>;
  if (!order.data) return <Screen back><ErrorState message={t("ms.order.notFound")} onRetry={() => order.refetch()} /></Screen>;
  const o = order.data;
  return (
    <Screen back title={t("ms.order.title", { n: o.number })} onRefresh={() => order.refetch()} refreshing={order.isRefetching}>
      <Text variant="title">{o.merchantName}</Text>
      <OrderTracker order={o} />
      <Section title={t("ms.order.items")}>
        <Card>
          {o.items.map((it) => (
            <View key={it.id} style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
              <Text style={{ flex: 1 }}>{`${it.quantity} × ${it.name}${it.modifiers.length ? ` (${it.modifiers.map((m) => m.option).join(", ")})` : ""}`}</Text>
              <Text tabular>{formatMoney(it.lineTotalCents)}</Text>
            </View>
          ))}
          {o.discountCents > 0 ? <Row label={t("ui.reward")} value={`-${formatMoney(o.discountCents)}`} /> : null}
          <Row label={t("rc.ca.tax")} value={formatMoney(o.taxCents)} />
          {o.tipCents > 0 ? <Row label={t("sv.i.tipLine")} value={formatMoney(o.tipCents)} /> : null}
          <Row label={t("cart.total")} value={formatMoney(o.totalCents)} strong />
          <Text variant="bodySm" color="fgMuted">
            {o.paymentMethod === "at_pickup" ? t("ms.order.payAtPickup") : o.paymentStatus === "paid" ? t("ms.order.paidInApp") : t("ms.order.payPending")}
          </Text>
          {o.pointsEarned > 0 ? <Text variant="bodySm" color="onSuccessSubtle">{t("ms.order.earned", { amount: formatPtsL(L, o.pointsEarned, "points") })}</Text> : null}
          {o.notes ? <Text variant="bodySm" color="fgMuted">{t("ms.order.note", { note: o.notes })}</Text> : null}
        </Card>
      </Section>
      {error ? <Banner variant="danger">{error}</Banner> : null}
      {o.status === "pending" ? (
        <Button variant="secondary" onPress={() => setConfirm(true)}>
          {t("ms.order.cancel")}
        </Button>
      ) : null}
      <ConfirmDialog
        visible={confirm}
        title={t("ms.order.cancelTitle")}
        body={t("ms.order.cancelBody")}
        confirmLabel={t("ms.order.cancel")}
        cancelLabel={t("ms.order.keep")}
        loading={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const res = await api.commerce.cancelOrder(o.id);
            qc.setQueryData(qk.order(o.id), res);
            void qc.invalidateQueries({ queryKey: qk.orders });
          } catch (e) {
            setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
          } finally {
            setBusy(false);
            setConfirm(false);
          }
        }}
      />
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 2 }}>
      <Text variant={strong ? "bodyStrong" : "bodySm"} color={strong ? "fg" : "fgMuted"} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant={strong ? "bodyStrong" : "bodySm"} tabular>
        {value}
      </Text>
    </View>
  );
}
