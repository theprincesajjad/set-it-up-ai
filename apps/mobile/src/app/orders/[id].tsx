import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "../../api/client";
import { t } from "../../copy/en-CA";
import { formatMoney, formatPts } from "../../lib/award";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { Banner, Button, Card, ConfirmDialog, ErrorState, OrderTracker, Screen, Section, SkeletonList, Text } from "../../ui";

/** Order detail: tracker (polls while open), items, totals. */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  if (!order.data) return <Screen back><ErrorState message="We couldn't find this order." onRetry={() => order.refetch()} /></Screen>;
  const o = order.data;
  return (
    <Screen back title={`Order #${o.number}`} onRefresh={() => order.refetch()} refreshing={order.isRefetching}>
      <Text variant="title">{o.merchantName}</Text>
      <OrderTracker order={o} />
      <Section title="Items">
        <Card>
          {o.items.map((it) => (
            <View key={it.id} style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
              <Text style={{ flex: 1 }}>{`${it.quantity} × ${it.name}${it.modifiers.length ? ` (${it.modifiers.map((m) => m.option).join(", ")})` : ""}`}</Text>
              <Text tabular>{formatMoney(it.lineTotalCents)}</Text>
            </View>
          ))}
          {o.discountCents > 0 ? <Row label="Reward" value={`-${formatMoney(o.discountCents)}`} /> : null}
          <Row label="Tax" value={formatMoney(o.taxCents)} />
          {o.tipCents > 0 ? <Row label="Tip" value={formatMoney(o.tipCents)} /> : null}
          <Row label="Total" value={formatMoney(o.totalCents)} strong />
          <Text variant="bodySm" color="fgMuted">
            {o.paymentMethod === "at_pickup" ? "Pay at pickup." : o.paymentStatus === "paid" ? "Paid in the app." : "Payment pending."}
          </Text>
          {o.pointsEarned > 0 ? <Text variant="bodySm" color="onSuccessSubtle">{`You earned ${formatPts(o.pointsEarned, "points")}.`}</Text> : null}
          {o.notes ? <Text variant="bodySm" color="fgMuted">{`Note: ${o.notes}`}</Text> : null}
        </Card>
      </Section>
      {error ? <Banner variant="danger">{error}</Banner> : null}
      {o.status === "pending" ? (
        <Button variant="secondary" onPress={() => setConfirm(true)}>
          Cancel order
        </Button>
      ) : null}
      <ConfirmDialog
        visible={confirm}
        title="Cancel this order?"
        body="The shop hasn't started it yet. Any reward you used goes back to your card."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        loading={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const res = await api.commerce.cancelOrder(o.id);
            qc.setQueryData(qk.order(o.id), res);
            void qc.invalidateQueries({ queryKey: qk.orders });
          } catch (e) {
            setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
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
