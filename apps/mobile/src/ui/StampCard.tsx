import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { useTheme } from "../theme";
import { Check, Gift, verticalIcon } from "./icons";
import { Text } from "./Text";

/** Columns: 5 for goal 10, 4 for 8, otherwise ceil(goal/2) up to 6. */
export function stampColumns(goal: number): number {
  if (goal === 10) return 5;
  if (goal === 8) return 4;
  return Math.min(6, Math.max(1, Math.ceil(goal / 2)));
}

/** Seeded rotation -8..8 deg for a hand-stamped feel. */
const rotation = (i: number) => (((i * 37) % 17) - 8);

/** Visual stamp grid for stamp programs (system.md § StampCard). */
export function StampCard({ count, goal, vertical, rewardName, justEarned, compact }: { count: number; goal: number; vertical: string; rewardName?: string | null; justEarned?: boolean; compact?: boolean }) {
  const { c, vertical: vfn } = useTheme();
  const { width } = useWindowDimensions();
  const g = Math.max(1, goal);
  const filled = count % g === 0 && count > 0 ? g : count % g;
  const carry = count > g ? count - g : 0;
  const cols = stampColumns(g);
  const slot = Math.max(compact ? 28 : 44, Math.min(56, Math.floor((Math.min(width, 480) - 64 - (cols - 1) * 12) / cols)));
  const v = vfn(vertical);
  const Icon = verticalIcon(v.icon);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!justEarned) return;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      pop.setValue(0.4);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    });
  }, [justEarned, pop]);
  const toGo = Math.max(0, g - filled);
  const caption = `${filled} of ${g}${rewardName ? (toGo === 0 ? ` · ${rewardName} is ready` : ` · ${toGo} more for a ${rewardName.replace(/^Free /, "free ")}`) : ""}`;
  return (
    <View accessible accessibilityLabel={`${filled} of ${g} stamps.${rewardName ? ` ${toGo === 0 ? `${rewardName} is ready.` : `${toGo} more for a ${rewardName}.`}` : ""}`} style={{ gap: 12 }}>
      <View style={[styles.grid, { gap: 12 }]}>
        {Array.from({ length: g }, (_, i) => {
          const isFilled = i < filled;
          const isLast = i === g - 1;
          const isNew = justEarned && i === filled - 1;
          const inner = isLast ? (
            <Gift size={slot * 0.42} color={isFilled ? c.onBrand : c.fgMuted} />
          ) : isFilled ? (
            v.icon ? <Icon size={slot * 0.42} color={c.onAccent} /> : <Check size={slot * 0.42} color={c.onAccent} />
          ) : null;
          return (
            <Animated.View
              key={i}
              style={[
                styles.slot,
                {
                  width: slot,
                  height: slot,
                  borderRadius: slot / 2,
                  backgroundColor: isFilled ? (isLast ? c.brand : c.accent) : "transparent",
                  borderColor: c.stampEmpty,
                  borderWidth: isFilled ? 0 : 2,
                  borderStyle: isFilled ? "solid" : "dashed",
                  transform: [{ rotate: `${isFilled ? rotation(i) : 0}deg` }, { scale: isNew ? pop : 1 }],
                },
              ]}
            >
              {inner}
            </Animated.View>
          );
        })}
      </View>
      {!compact ? (
        <Text variant="bodySm" color="fgMuted">
          {caption}
          {carry > 0 ? ` · +${carry} on your next card` : ""}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  slot: { alignItems: "center", justifyContent: "center" },
});
