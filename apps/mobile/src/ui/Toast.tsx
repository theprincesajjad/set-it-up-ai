import { radii, shadows } from "@ll/design-tokens";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { CircleAlert, CircleCheck } from "./icons";
import { Text } from "./Text";

interface ToastSpec {
  message: string;
  tone?: "success" | "error" | "plain";
  actionLabel?: string;
  onAction?: () => void;
}

const ToastContext = createContext<(t: ToastSpec | string) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

/** One toast at a time; new replaces old. 4 s, 8 s with an action. surfaceInverse + fgInverse. */
export function ToastProvider({ children, bottomOffset = 72 }: { children: ReactNode; bottomOffset?: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (t: ToastSpec | string) => {
      const spec = typeof t === "string" ? { message: t } : t;
      setToast(spec);
      AccessibilityInfo.announceForAccessibility(spec.message);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setToast(null)),
        spec.onAction ? 8000 : 4000,
      );
    },
    [opacity],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const value = useMemo(() => show, [show]);
  const Icon = toast?.tone === "error" ? CircleAlert : toast?.tone === "success" ? CircleCheck : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset, opacity }]}>
          <View
            accessibilityRole={toast.tone === "error" ? "alert" : "text"}
            accessibilityLiveRegion="polite"
            style={[styles.toast, { backgroundColor: c.surfaceInverse }, shadows.lg.native]}
          >
            {Icon ? <Icon size={20} color={c.fgInverse} /> : null}
            <Text variant="bodySm" rawColor={c.fgInverse} style={{ flex: 1 }}>
              {toast.message}
            </Text>
            {toast.actionLabel && toast.onAction ? (
              <Pressable accessibilityRole="button" hitSlop={12} onPress={toast.onAction}>
                <Text variant="label" rawColor={c.fgInverse} style={{ textDecorationLine: "underline" }}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 700 },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 420, width: "100%", borderRadius: radii.md, paddingVertical: 12, paddingHorizontal: 16 },
});
