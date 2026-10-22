import Svg, { Circle, Rect } from "react-native-svg";
import { useTheme } from "../theme";

/**
 * The v2 mark, "four corners" (apps/web/public/brand/logo-mark.svg): a black
 * tile with four places; one filled with the accent = the point you earned.
 * In dark mode the tile turns white and the places black (wordmark-inverse.svg).
 */
export function LogoMark({ size = 40, inverse }: { size?: number; inverse?: boolean }) {
  const { isDark } = useTheme();
  const flip = inverse ?? isDark;
  const tile = flip ? "#FFFFFF" : "#0B0B0C";
  const dot = flip ? "#0B0B0C" : "#FFFFFF";
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect width={64} height={64} rx={16} fill={tile} />
      <Circle cx={22} cy={22} r={7.5} fill={dot} />
      <Circle cx={42} cy={22} r={7.5} fill={dot} />
      <Circle cx={22} cy={42} r={7.5} fill={dot} />
      <Circle cx={42} cy={42} r={7.5} fill="#FF5A1F" />
    </Svg>
  );
}

/** v1 export kept for imports; the v2 welcome has no illustration. */
export function StreetIllustration() {
  return null;
}
