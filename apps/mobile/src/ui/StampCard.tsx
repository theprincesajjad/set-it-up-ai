import { springs } from "@ll/design-tokens";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { useTheme } from "../theme";
import { Check, Gift } from "./icons";
import { Text } from "./Text";

/** Columns: 5 for goal 10, 4 for 8, otherwise ceil(goal/2) up to 6. */
export function stampColumns(goal: number): number {
  if (goal === 10) return 5;
  if (goal === 8) return 4;
  return Math.min(6, Math.max(1, Math.ceil(goal / 2)));
}

/**
 * The stamp row: earned stamps are accent dots with a check, open slots are
 * outlined circles (lineStrong, 3:1), the last slot holds the reward. One
 * accent meaning: these are points. A "7 / 10" count sits right.
 */
export function StampCard({
  count,
  goal,
  rewardName,
  justEarned,
  compact,
}: {
  count: number;
  goal: number;
  /** v1 props, ignored (no logos in stamps). */
  vertical?: string;
  logoUrl?: string | null;
  rewardName?: string | null;
  justEarned?: boolean;
  compact?: boolean;
}) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const g = Math.max(1, goal);
  // Stamps are a balance: a full card is a reward ready; extra stamps carry over to the next card.
  const filled = Math.min(Math.max(0, count), g);
  const carry = count > g ? count - g : 0;
  const oneRow = g <= 10;
  const cols = oneRow ? g : stampColumns(g);
  const gap = oneRow ? 6 : 10;
  const avail = Math.min(width, 480) - 32 - (cols - 1) * gap;
  const slot = Math.max(compact ? 24 : 26, Math.min(compact ? 32 : 44, Math.floor(avail / cols)));
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!justEarned) return;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      pop.setValue(0.5);
      Animated.spring(pop, { toValue: 1, ...springs.pop, useNativeDriver: true }).start();
    });
  }, [justEarned, pop]);
  const toGo = Math.max(0, g - filled);
  const reward = rewardName?.replace(/^Free /, "free ");
  return (
    <View
      accessible
      accessibilityLabel={`${filled} of ${g} stamps.${toGo === 0 ? ` ${rewardName ?? "Reward"} is ready.` : rewardName ? ` ${toGo} more for a ${reward}.` : ""}${carry > 0 ? ` ${carry} extra carry over.` : ""}`}
      style={{ gap: 10, alignSelf: "stretch" }}
    >
      {compact ? null : (
      <View style={styles.head}>
        {!compact ? (
          <Text variant="meta" color="fgMuted" style={{ flex: 1 }}>
            {toGo === 0 ? `${rewardName ?? "Reward"} is ready` : rewardName ? `${toGo} more for a ${reward}` : `${toGo} to go`}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Text variant="metaStrong" color="accentText" tabular>{`${filled} / ${g}`}</Text>
      </View>
      )}
      <View style={[styles.grid, { gap }]}>
        {Array.from({ length: g }, (_, i) => {
          const isFilled = i < filled;
          const isLast = i === g - 1;
          const isNew = justEarned && i === filled - 1;
          return (
            <Animated.View
              key={i}
              style={[
                styles.slot,
                {
                  width: slot,
                  height: slot,
                  borderRadius: slot / 2,
                  backgroundColor: isFilled ? c.accent : "transparent",
                  borderColor: c.lineStrong,
                  borderWidth: isFilled ? 0 : 1.5,
                  transform: [{ scale: isNew ? pop : 1 }],
                },
              ]}
            >
              {isLast ? <Gift size={slot * 0.46} color={isFilled ? c.onAccent : c.fgMuted} strokeWidth={2} /> : isFilled ? <Check size={slot * 0.5} color={c.onAccent} strokeWidth={2.5} /> : null}
            </Animated.View>
          );
        })}
      </View>
      {carry > 0 && !compact ? (
        <Text variant="meta" color="fgMuted">{`+${carry} extra ${carry === 1 ? "stamp carries" : "stamps carry"} over to your next card`}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  slot: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
