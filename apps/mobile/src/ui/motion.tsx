/**
 * Motion primitives (foundations § Motion): 150 ms ease-out for taps, 240 ms spring for sheets, nothing
 * bounces twice, and everything respects Reduce Motion (read once, then kept in sync with the OS setting).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Text, type TextProps } from "./Text";

let cached = false;
let known = false;
const listeners = new Set<(v: boolean) => void>();
let subscribed = false;

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      cached = !!v;
      known = true;
      listeners.forEach((l) => l(cached));
    })
    .catch(() => undefined);
  try {
    AccessibilityInfo.addEventListener("reduceMotionChanged", (v: boolean) => {
      cached = !!v;
      known = true;
      listeners.forEach((l) => l(cached));
    });
  } catch {
    // Older RN-web: no event; the first read is enough.
  }
}

/** True when the user asked the OS to reduce motion. */
export function useReducedMotion(): boolean {
  const [v, setV] = useState(cached);
  useEffect(() => {
    subscribe();
    listeners.add(setV);
    if (known) setV(cached);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

/** Synchronous read for imperative code (sheets): the last known value. */
export function reducedMotionNow(): boolean {
  subscribe();
  return cached;
}

const ease = Easing.out(Easing.cubic);

/**
 * A number that counts from its previous value to the new one (≤ 400 ms, ease-out). The first render shows
 * the value as-is (no count-up on screen load); only changes animate. Reduce Motion: no animation.
 */
export function CountUp({ value, format = (n) => n.toLocaleString("en-CA"), duration = 380, ...text }: { value: number; format?: (n: number) => string; duration?: number } & Omit<TextProps, "children">) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  useEffect(() => {
    if (value === from.current) return;
    const start = from.current;
    from.current = value;
    if (reduce || Math.abs(value - start) < 1) {
      setShown(value);
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - (1 - p) ** 3;
      setShown(Math.round(start + (value - start) * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, reduce]);
  return (
    <Text tabular accessibilityLabel={format(value)} {...text}>
      {format(shown)}
    </Text>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The award check: the ring draws, then the tick, with a single small scale settle (1 → 1.04 → 1).
 * 320 ms total. Reduce Motion: drawn immediately.
 */
export function SuccessCheck({ size = 48, color, style }: { size?: number; color: string; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(reduce ? 1 : 0.92)).current;
  useEffect(() => {
    if (reduce) {
      p.setValue(1);
      scale.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(p, { toValue: 1, duration: 320, easing: ease, useNativeDriver: false }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.04, duration: 200, easing: ease, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 120, easing: ease, useNativeDriver: true }),
      ]),
    ]).start();
  }, [p, scale, reduce]);
  const r = 22;
  const ring = 2 * Math.PI * r;
  const tick = 30;
  return (
    <Animated.View style={[{ width: size, height: size, transform: [{ scale }] }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <AnimatedCircle
          cx={24}
          cy={24}
          r={r}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray={`${ring}`}
          strokeDashoffset={p.interpolate({ inputRange: [0, 0.6], outputRange: [ring, 0], extrapolate: "clamp" })}
          strokeLinecap="round"
          rotation={-90}
          origin="24, 24"
        />
        <AnimatedPath
          d="M15.5 24.5 L21.5 30.5 L33 18.5"
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${tick}`}
          strokeDashoffset={p.interpolate({ inputRange: [0.45, 1], outputRange: [tick, 0], extrapolate: "clamp" })}
        />
      </Svg>
    </Animated.View>
  );
}

/** A soft opacity pulse for "waiting" dots (status, not accent). Static with Reduce Motion. */
export function PulseDot({ color, size = 8, style }: { color: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o, reduce]);
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: o }, style]} />;
}

/** Fades + lifts its children in once (8 pt, 180 ms). Used when a success state replaces a form. */
export function Appear({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: 1, duration: 180, delay, easing: ease, useNativeDriver: true }).start();
  }, [v, reduce, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}

/** Thin bar that empties over `ms` (the 10 s undo window). */
export function DrainBar({ startedAt, ms, color, track, height = 3 }: { startedAt: number; ms: number; color: string; track: string; height?: number }) {
  const reduce = useReducedMotion();
  const left = Math.max(0, 1 - (Date.now() - startedAt) / ms);
  const w = useRef(new Animated.Value(left)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(w, { toValue: 0, duration: Math.max(0, startedAt + ms - Date.now()), easing: Easing.linear, useNativeDriver: false }).start();
  }, [w, startedAt, ms, reduce]);
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: "hidden", alignSelf: "stretch" }}>
      <Animated.View style={{ height, backgroundColor: color, width: w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
    </View>
  );
}

