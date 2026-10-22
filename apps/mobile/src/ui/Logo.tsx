import Svg, { ClipPath, Circle, Defs, G, Path, Rect } from "react-native-svg";

/** "The Shopfront" mark (apps/web/public/brand/logo-mark.svg). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Defs>
        <ClipPath id="awning">
          <Path d="M6 22a12 12 0 0 1 12-12h28a12 12 0 0 1 12 12v2a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0z" />
        </ClipPath>
      </Defs>
      <Rect x={6} y={10} width={52} height={48} rx={12} fill="#1F6A50" />
      <G clipPath="url(#awning)">
        <Rect x={6} y={10} width={52} height={21} fill="#F5A524" />
        <Rect x={19} y={10} width={13} height={21} fill="#FDDA8E" />
        <Rect x={45} y={10} width={13} height={21} fill="#FDDA8E" />
      </G>
      <Path d="M24 58V44a8 8 0 0 1 16 0v14z" fill="#FAF6EF" />
      <Circle cx={35.5} cy={51} r={2} fill="#F5A524" />
    </Svg>
  );
}

/** Welcome illustration: a street of four shopfronts with awnings (marigold, brick, pine, lake). */
export function StreetIllustration({ width = 320 }: { width?: number }) {
  const awnings = ["#F5A524", "#C65334", "#1F6A50", "#1D5FA8"];
  const h = width * 0.62;
  return (
    <Svg width={width} height={h} viewBox="0 0 320 198" accessibilityElementsHidden>
      <Rect x={0} y={176} width={320} height={22} rx={6} fill="#E7DFD2" />
      {awnings.map((color, i) => {
        const x = 8 + i * 78;
        return (
          <G key={color}>
            <Rect x={x} y={56} width={70} height={120} rx={10} fill="#FFFFFF" stroke="#1F1B16" strokeWidth={2} />
            <Path d={`M${x - 4} 52h78v18a9.75 9.75 0 0 1-19.5 0a9.75 9.75 0 0 1-19.5 0a9.75 9.75 0 0 1-19.5 0a9.75 9.75 0 0 1-19.5 0z`} fill={color} />
            <Rect x={x + 10} y={92} width={22} height={26} rx={4} fill="#F3EDE3" />
            <Path d={`M${x + 40} 176v-44a10 10 0 0 1 20 0v44z`} fill={color} opacity={0.85} />
          </G>
        );
      })}
    </Svg>
  );
}
