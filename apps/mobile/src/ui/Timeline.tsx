import type { serviceApi } from "@ll/shared";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { formatDayTime } from "../lib/format";
import { useTheme } from "../theme";
import { Check, Hourglass, X } from "./icons";
import { Text } from "./Text";

type TicketStatus = serviceApi.TicketDto["status"];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  intake: "Dropped off",
  diagnosing: "Diagnosing",
  quote_sent: "Quote ready",
  approved: "Approved",
  in_progress: "Work started",
  waiting_parts: "Waiting for parts",
  ready: "Ready for pickup",
  picked_up: "Picked up",
  declined: "Quote declined",
  cancelled: "Cancelled",
};

const STEPS: TicketStatus[] = ["intake", "diagnosing", "quote_sent", "approved", "in_progress", "ready", "picked_up"];

/** Vertical ticket timeline (system.md § Timeline). The quote_sent step renders `quoteSlot` inline. */
export function Timeline({ status, events, quoteSlot }: { status: TicketStatus; events: serviceApi.TicketEventDto[]; quoteSlot?: ReactNode }) {
  const { c } = useTheme();
  const stopped = status === "declined" || status === "cancelled";
  const steps: TicketStatus[] = status === "waiting_parts" ? [...STEPS.slice(0, 5), "waiting_parts", ...STEPS.slice(5)] : [...STEPS];
  const lastEventFor = (s: TicketStatus) => [...events].reverse().find((e) => e.status === s);
  let currentIndex = steps.indexOf(status);
  if (stopped) {
    // stop after the last step that happened
    const reached = steps.filter((s) => lastEventFor(s));
    currentIndex = reached.length ? steps.indexOf(reached[reached.length - 1]!) : 0;
  }
  const rows = stopped ? [...steps.slice(0, currentIndex + 1), status] : steps;
  return (
    <View accessibilityRole="list">
      {rows.map((s, i) => {
        const done = stopped ? i < rows.length - 1 : i < currentIndex;
        const current = stopped ? i === rows.length - 1 : i === currentIndex;
        const bad = stopped && current;
        const waiting = s === "waiting_parts" && current;
        const ev = lastEventFor(s);
        const nodeColor = bad ? c.danger : waiting ? c.warning : done || current ? c.brand : c.border;
        return (
          <View key={`${s}-${i}`} style={styles.step} accessible accessibilityLabel={`${TICKET_STATUS_LABELS[s]}${done ? ", done" : current ? ", current step" : ", upcoming"}${ev ? `, ${formatDayTime(ev.createdAt)}` : ""}`}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  { borderColor: nodeColor, backgroundColor: done || bad || waiting ? nodeColor : "transparent", borderWidth: current && !bad && !waiting ? 2 : done ? 0 : 2 },
                ]}
              >
                {done ? <Check size={14} color={c.onBrand} strokeWidth={3} /> : bad ? <X size={14} color={c.onDanger} strokeWidth={3} /> : waiting ? <Hourglass size={12} color={c.onWarning} /> : current ? <View style={[styles.dot, { backgroundColor: c.brand }]} /> : null}
              </View>
              {i < rows.length - 1 ? <View style={[styles.connector, { backgroundColor: done ? c.brand : c.border }]} /> : null}
            </View>
            <View style={styles.content}>
              <Text variant={current ? "bodyStrong" : "body"} color={done || current ? "fg" : "fgMuted"}>
                {TICKET_STATUS_LABELS[s]}
              </Text>
              {ev ? (
                <Text variant="caption" color="fgMuted">
                  {formatDayTime(ev.createdAt)}
                </Text>
              ) : null}
              {ev?.note ? (
                <Text variant="bodySm" color="fgMuted">
                  {ev.note}
                </Text>
              ) : null}
              {s === "quote_sent" && current && quoteSlot ? <View style={{ marginTop: 8 }}>{quoteSlot}</View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 24 },
  node: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  connector: { width: 2, flex: 1, minHeight: 16 },
  content: { flex: 1, paddingBottom: 16, gap: 2 },
});
