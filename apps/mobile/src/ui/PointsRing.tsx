import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { unitLabelL } from "../lib/formatL";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Text } from "./Text";

const SIZES = { 64: { stroke: 5, font: 18 }, 120: { stroke: 7, font: 30 }, 200: { stroke: 10, font: 52 } } as const;

/** Thin circular progress to the next reward (points programs), accent on bgMuted. */
export function PointsRing({ balance, goal, terminology, rewardName, size = 120 }: { balance: number; goal: number | null; terminology: string; rewardName?: string | null; size?: 64 | 120 | 200 }) {
  const { c } = useTheme();
  const L = useLocale();
  const { t } = L;
  const { stroke, font } = SIZES[size];
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ready = goal !== null && goal > 0 && balance >= goal;
  const pct = goal && goal > 0 ? Math.min(1, balance / goal) : 0;
  const toGo = goal ? Math.max(0, goal - balance) : 0;
  const unit = unitLabelL(L, terminology, balance);
  const label = `${t("ui.progressOf", { value: L.number(balance), max: L.number(goal ?? balance) })} ${unit}.${rewardName ? ` ${ready ? t("ui.ring.ready", { reward: rewardName }) : t("ui.ring.toReward", { n: L.number(toGo), unit, reward: rewardName })}` : ""}`;
  return (
    <View accessible accessibilityLabel={label} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.bgMuted} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={ready ? 0 : circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {size === 64 ? (
        <Text variant="metaStrong" color="fg" tabular>{`${Math.round(pct * 100)}%`}</Text>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Text variant="displayNumber" tabular style={{ fontSize: font, lineHeight: font * 1.1 }}>
            {L.number(balance)}
          </Text>
          <Text variant="caption" color="fgMuted">
            {unit}
          </Text>
        </View>
      )}
    </View>
  );
}
