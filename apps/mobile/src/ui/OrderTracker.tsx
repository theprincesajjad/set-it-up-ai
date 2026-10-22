import type { commerceApi } from "@ll/shared";
import { StyleSheet, View } from "react-native";
import { formatTime } from "../lib/format";
import { useTheme } from "../theme";
import { Card } from "./Card";
import { PackageCheck } from "./icons";
import { Text } from "./Text";

type OrderStatus = commerceApi.OrderDto["status"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Order sent",
  accepted: "Accepted",
  preparing: "Being prepared",
  ready: "Ready for pickup",
  picked_up: "Picked up",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STEPS = [
  { label: "Sent", statuses: ["pending"] },
  { label: "Preparing", statuses: ["accepted", "preparing"] },
  { label: "Ready", statuses: ["ready"] },
  { label: "Picked up", statuses: ["picked_up"] },
] as const;

/** Horizontal 4-step tracker with a big status line (system.md § OrderTracker). */
export function OrderTracker({ order }: { order: commerceApi.OrderDto }) {
  const { c } = useTheme();
  const closed = order.status === "cancelled" || order.status === "refunded";
  const idx = STEPS.findIndex((s) => (s.statuses as readonly string[]).includes(order.status));
  if (closed) {
    return (
      <Card tone="sunken">
        <Text variant="h2">{ORDER_STATUS_LABELS[order.status]}</Text>
        {order.cancelReason ? (
          <Text variant="body" color="fgMuted">
            {order.cancelReason}
          </Text>
        ) : null}
        {order.paymentStatus === "refunded" ? (
          <Text variant="bodySm" color="fgMuted">
            Your payment was refunded.
          </Text>
        ) : null}
      </Card>
    );
  }
  if (order.status === "ready") {
    return (
      <View style={[styles.ready, { backgroundColor: c.success }]} accessible accessibilityLabel={`Ready for pickup. Show order ${order.number} at the counter.`}>
        <PackageCheck size={40} color={c.onSuccess} />
        <Text variant="h2" rawColor={c.onSuccess}>
          Ready for pickup
        </Text>
        <Text variant="title" rawColor={c.onSuccess}>
          Show this at the counter
        </Text>
        <Text variant="code" rawColor={c.onSuccess} style={{ fontSize: 32, lineHeight: 36 }}>
          {`#${order.number}`}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }} accessible accessibilityLabel={`${ORDER_STATUS_LABELS[order.status]}. Order ${order.number}.`}>
      <Text variant="h2">{ORDER_STATUS_LABELS[order.status]}</Text>
      {order.pickupAt ? (
        <Text variant="body" color="fgMuted">{`Pickup at ${formatTime(order.pickupAt)}`}</Text>
      ) : null}
      <View style={styles.bar}>
        {STEPS.map((s, i) => (
          <View key={s.label} style={{ flex: 1, gap: 6 }}>
            <View style={[styles.seg, { backgroundColor: i <= idx ? c.brand : c.ringTrack }]} />
            <Text variant="caption" color={i <= idx ? "fg" : "fgMuted"}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="code" style={{ fontSize: 32, lineHeight: 36 }}>{`#${order.number}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", gap: 6 },
  seg: { height: 8, borderRadius: 4 },
  ready: { borderRadius: 16, padding: 20, alignItems: "center", gap: 8 },
});
