import { useMemo } from "react";
import { create } from "qrcode/lib/core/qrcode";
import Svg, { Path, Rect } from "react-native-svg";

/**
 * QR code drawn with react-native-svg. ALWAYS black on white (qrFg/qrBg),
 * ECC level M, quiet zone provided by the caller's white card.
 */
export function QrCode({ value, size, accessibilityLabel }: { value: string; size: number; accessibilityLabel?: string }) {
  const { path, count } = useMemo(() => {
    const qr = create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const data = qr.modules.data;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} accessibilityLabel={accessibilityLabel} accessible={!!accessibilityLabel}>
      <Rect x={0} y={0} width={count} height={count} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
