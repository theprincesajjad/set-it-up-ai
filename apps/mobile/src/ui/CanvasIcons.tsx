/**
 * The handful of glyphs the design canvas draws itself (docs/design/canvas/*.dc.html), path for path,
 * so the tab bar, card button and gift slot match the artboards exactly. Everything else is Lucide.
 */
import Svg, { Circle, Path, Rect } from "react-native-svg";

type P = { size?: number; color: string; strokeWidth?: number; filled?: boolean };

export function TabMapIcon({ size = 24, color, strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <Path d="M9 4v14M15 6v14" />
    </Svg>
  );
}

export function TabDiscoverIcon({ size = 24, color, strokeWidth = 1.8, filled }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z" />
    </Svg>
  );
}

export function TabWalletIcon({ size = 24, color, strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Rect x={3} y={6} width={18} height={14} rx={3} />
      <Path d="M3 10h18M16 15h2" />
    </Svg>
  );
}

/** The QR glyph on the black "my card" button and the "show my card to redeem" bar. */
export function CardQrIcon({ size = 24, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Rect x={3} y={3} width={7} height={7} rx={1.5} />
      <Rect x={14} y={3} width={7} height={7} rx={1.5} />
      <Rect x={3} y={14} width={7} height={7} rx={1.5} />
      <Path d="M14 14h3v3M21 14v.01M14 21h.01M17.5 21H21v-3.5" />
    </Svg>
  );
}

/** Gift in the last stamp slot (ShopSheet artboard). */
export function GiftGlyph({ size = 13, color, strokeWidth = 2.4 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Rect x={3} y={8} width={18} height={13} rx={2} />
      <Path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1" />
    </Svg>
  );
}

/** Wallet glyph on "Add to Apple Wallet" (Card artboard). */
export function WalletPassGlyph({ size = 22, color, strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Rect x={3} y={5} width={18} height={15} rx={3} />
      <Path d="M3 10h18M3 14c4 0 5 2 9 2s5-2 9-2" />
    </Svg>
  );
}

/** Recenter arrow (Main artboard): a filled paper plane. */
export function RecenterGlyph({ size = 18, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M3 11l18-8-8 18-2-8z" />
    </Svg>
  );
}

/** Notification settings sliders (Inbox artboard). */
export function SlidersGlyph({ size = 18, color, strokeWidth = 1.9 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx={16} cy={7} r={2} />
      <Circle cx={10} cy={17} r={2} />
    </Svg>
  );
}

/** Bell (Main / Discover artboards). */
export function BellGlyph({ size = 20, color, strokeWidth = 1.9 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Svg>
  );
}

export function SearchGlyph({ size = 20, color, strokeWidth = 1.9 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-3.5-3.5" />
    </Svg>
  );
}

export function ChevronDownGlyph({ size = 14, color, strokeWidth = 2.2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function CloseGlyph({ size = 16, color, strokeWidth = 2.2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function ChevronLeftGlyph({ size = 20, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function ChevronRightGlyph({ size = 16, color, strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/** ShopSheet action tiles. */
export function DirectionsGlyph({ size = 20, color, strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M3 11l18-8-8 18-2-8z" />
    </Svg>
  );
}
export function CallGlyph({ size = 20, color, strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </Svg>
  );
}
export function WebsiteGlyph({ size = 20, color, strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Svg>
  );
}
export function ShareGlyph({ size = 20, color, strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </Svg>
  );
}
