import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { formatNumber, unitLabel } from "../lib/award";
import { useTheme } from "../theme";
import { Gift } from "./icons";
import { Text } from "./Text";

const SIZES = { 64: { stroke: 8, font: 20 }, 120: { stroke: 10, font: 32 }, 200: { stroke: 14, font: 56 } } as const;

/** Circular progress to the next reward (points programs). Full accent ring + gift when ready. */
export function PointsRing({ balance, goal, terminology, rewardName, size = 120 }: { balance: number; goal: number | null; terminology: string; rewardName?: string | null; size?: 64 | 120 | 200 }) {
  const { c } = useTheme();
  const { stroke, font } = SIZES[size];
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ready = goal !== null && goal > 0 && balance >= goal;
  const pct = goal && goal > 0 ? Math.min(1, balance / goal) : 0;
  const toGo = goal ? Math.max(0, goal - balance) : 0;
  const label = `${formatNumber(balance)} of ${formatNumber(goal ?? balance)} ${terminology}.${rewardName ? (ready ? ` ${rewardName} is ready.` : ` ${formatNumber(toGo)} ${terminology} to ${rewardName}.`) : ""}`;
  return (
    <View accessible accessibilityLabel={label} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.ringTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ready ? c.accent : c.brand}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={ready ? 0 : circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {ready && size === 64 ? (
        <Gift size={24} color={c.onAccentSubtle} />
      ) : (
        <View style={{ alignItems: "center" }}>
          {ready ? <Gift size={size / 8} color={c.onAccentSubtle} /> : null}
          <Text variant="points" tabular style={{ fontSize: font, lineHeight: font * 1.1 }}>
            {formatNumber(balance)}
          </Text>
          <Text variant="caption" color="fgMuted">
            {unitLabel(terminology, balance)}
          </Text>
        </View>
      )}
    </View>
  );
}
