/** Kitchen screen pieces (restaurant.kds): a ticket card with tap-to-advance item rows and a Bump button. */
import { radii } from "@ll/design-tokens";
import type { restaurantApi } from "@ll/shared";
import { Pressable, StyleSheet, View } from "react-native";
import { ageText, isLate, nextItemStatus } from "../../lib/kitchen";
import { disp, ui, useTheme } from "../../theme";
import { Button, Check, Text } from "../../ui";
import { hairline } from "../../ui/shadow";
import { useLocale } from "../../lib/i18n";

type Item = restaurantApi.KitchenItemDto;

const KIND: Record<string, string> = { preorder: "Pre-order", tiffin: "Tiffin", catering: "Catering", banquet: "Banquet" };
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", phone: "Phone", counter: "Counter" };

/** One ticket: big number, age (accent once late), item rows 64 pt tall, Bump at the bottom. */
export function KitchenTicket({ ticket, age, busy, onItem, onBump }: { ticket: restaurantApi.KitchenTicketDto; age: number; busy: boolean; onItem: (i: Item) => void; onBump: () => void }) {
  const { c } = useTheme();
  const { t, dir, info } = useLocale();
  const late = isLate(age);
  const allReady = ticket.items.every((i) => i.status === "ready");
  const tags = [KIND[ticket.kind], CHANNEL[ticket.channel]].filter(Boolean).join(" · ");
  return (
    <View accessibilityLabel={t("kitchen.ticket", { n: ticket.number })} style={[styles.card, { borderColor: late ? c.accent : c.fg, backgroundColor: c.bg }]}>
      <View style={[styles.head, { borderBottomColor: c.line }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={disp(28, 800, 30)}>#{ticket.number}</Text>
          {tags ? (
            <Text variant="meta" color="fgMuted" numberOfLines={1}>
              {tags}
            </Text>
          ) : null}
        </View>
        <View style={[styles.age, { backgroundColor: late ? c.accentSoft : c.bgSubtle }]}>
          <Text style={[ui(20, late ? 700 : 600, 24), { fontVariant: ["tabular-nums"] }]} color={late ? "accentText" : "fg"} accessibilityLabel={`${Math.floor(age / 60)} min${late ? ", late" : ""}`}>
            {ageText(age)}
          </Text>
        </View>
      </View>
      {ticket.items.map((i) => {
        const next = nextItemStatus(i.status);
        return (
          <Pressable
            key={i.id}
            disabled={!next || busy}
            onPress={() => onItem(i)}
            accessibilityRole="button"
            accessibilityLabel={`${i.quantity} ${i.name}, ${i.status}${next ? `. Tap to mark ${next}` : ""}`}
            style={({ pressed }) => [styles.row, { borderBottomColor: c.line, backgroundColor: i.status === "ready" ? c.bgSubtle : pressed ? c.bgMuted : c.bg }]}
          >
            <Text style={[ui(24, 700, 28), { width: 44, textAlign: "center", fontVariant: ["tabular-nums"] }]} color={i.status === "ready" ? "fgMuted" : "fg"}>
              {i.quantity}×
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text lang={info.bcp47} style={[ui(18, 600, 24), { writingDirection: dir }, i.status === "ready" ? { textDecorationLine: "line-through" } : null]} color={i.status === "ready" ? "fgMuted" : "fg"}>
                {i.name}
              </Text>
              {i.modifiers.length ? (
                <Text variant="meta" color="fgMuted">
                  {i.modifiers.map((m) => m.option).join(", ")}
                </Text>
              ) : null}
              {i.notes ? (
                <Text variant="metaStrong" style={{ marginTop: 2 }}>
                  {i.notes}
                </Text>
              ) : null}
            </View>
            <StatusChip status={i.status} />
          </Pressable>
        );
      })}
      {ticket.notes ? (
        <View style={{ backgroundColor: c.bgSubtle, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text variant="metaStrong">{ticket.notes}</Text>
        </View>
      ) : null}
      <View style={styles.foot}>
        <Button size="lg" variant={allReady ? "primary" : "outline"} iconStart={Check} loading={busy} onPress={onBump} fullWidth>
          {t("kitchen.bump")}
        </Button>
      </View>
    </View>
  );
}

function StatusChip({ status }: { status: Item["status"] }) {
  const { c } = useTheme();
  const { t } = useLocale();
  const label = t(status === "queued" ? "kitchen.new" : status === "cooking" ? "kitchen.cooking" : "kitchen.ready");
  const on = status === "cooking";
  return (
    <View style={[styles.chip, { backgroundColor: on ? c.fg : c.bg, borderColor: status === "queued" ? c.lineStrong : on ? c.fg : c.line }]}>
      <Text variant="metaStrong" rawColor={on ? c.onBrand : c.fg}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: radii.card, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: hairline },
  age: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: hairline },
  chip: { minWidth: 84, height: 36, borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  foot: { padding: 12 },
});
