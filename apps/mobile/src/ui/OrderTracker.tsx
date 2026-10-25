import type { commerceApi } from "@ll/shared";
import { StyleSheet, View } from "react-native";
import type { MessageKey } from "@ll/shared";
import { formatTimeL } from "../lib/formatL";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Card } from "./Card";
import { PackageCheck } from "./icons";
import { Text } from "./Text";

type OrderStatus = commerceApi.OrderDto["status"];

/** Catalog key for each pickup-order status; translate with `t(ORDER_STATUS_KEYS[status])`. */
export const ORDER_STATUS_KEYS: Record<OrderStatus, MessageKey> = {
  pending: "ui.order.pending",
  accepted: "ui.order.accepted",
  preparing: "ui.order.preparing",
  ready: "ui.order.ready",
  picked_up: "ui.order.picked_up",
  cancelled: "ui.order.cancelled",
  refunded: "ui.order.refunded",
};

const STEPS = [
  { label: "ui.order.stepSent", statuses: ["pending"] },
  { label: "ui.order.stepPreparing", statuses: ["accepted", "preparing"] },
  { label: "ui.order.stepReady", statuses: ["ready"] },
  { label: "ui.order.stepPickedUp", statuses: ["picked_up"] },
] as const satisfies readonly { label: MessageKey; statuses: readonly string[] }[];

/** Horizontal 4-step tracker with a big status line (system.md § OrderTracker). */
export function OrderTracker({ order }: { order: commerceApi.OrderDto }) {
  const { c } = useTheme();
  const L = useLocale();
  const { t } = L;
  const closed = order.status === "cancelled" || order.status === "refunded";
  const idx = STEPS.findIndex((s) => (s.statuses as readonly string[]).includes(order.status));
  if (closed) {
    return (
      <Card tone="sunken">
        <Text variant="h2">{t(ORDER_STATUS_KEYS[order.status])}</Text>
        {order.cancelReason ? (
          <Text variant="body" color="fgMuted">
            {order.cancelReason}
          </Text>
        ) : null}
        {order.paymentStatus === "refunded" ? (
          <Text variant="bodySm" color="fgMuted">
            {t("ui.order.refundedNote")}
          </Text>
        ) : null}
      </Card>
    );
  }
  if (order.status === "ready") {
    return (
      <View style={[styles.ready, { backgroundColor: c.success }]} accessible accessibilityLabel={t("ui.order.readyA11y", { n: order.number })}>
        <PackageCheck size={40} color={c.onSuccess} />
        <Text variant="h2" rawColor={c.onSuccess}>
          {t("ui.order.ready")}
        </Text>
        <Text variant="title" rawColor={c.onSuccess}>
          {t("ui.order.showAtCounter")}
        </Text>
        <Text variant="code" rawColor={c.onSuccess} style={{ fontSize: 32, lineHeight: 36 }}>
          {`#${order.number}`}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }} accessible accessibilityLabel={t("ui.order.statusA11y", { status: t(ORDER_STATUS_KEYS[order.status]), n: order.number })}>
      <Text variant="h2">{t(ORDER_STATUS_KEYS[order.status])}</Text>
      {order.pickupAt ? (
        <Text variant="body" color="fgMuted">{t("ui.order.pickupAt", { time: formatTimeL(L, order.pickupAt) })}</Text>
      ) : null}
      <View style={styles.bar}>
        {STEPS.map((s, i) => (
          <View key={s.label} style={{ flex: 1, gap: 6 }}>
            <View style={[styles.seg, { backgroundColor: i <= idx ? c.brand : c.ringTrack }]} />
            <Text variant="caption" color={i <= idx ? "fg" : "fgMuted"}>
              {t(s.label)}
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
