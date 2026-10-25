import { layout, radii, shadows, springs } from "@ll/design-tokens";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Button, type ButtonVariant } from "./Button";
import { IconButton } from "./IconButton";
import { X } from "./icons";
import { useReducedMotion } from "./motion";
import { Text } from "./Text";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Primary action pinned at the bottom above the safe area. */
  footer?: ReactNode;
  scroll?: boolean;
}

/**
 * Bottom sheet: radius 24, grabber, title (system 22/600, the one sheet title style) + round close,
 * 16 pt gutters like every page, scrim tap / Android back closes.
 */
export function Sheet({ visible, onClose, title, children, footer, scroll = true }: SheetProps) {
  const { c } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  // Stay mounted while the sheet animates out, so closing is a motion, not a cut.
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(visible ? 0 : 1)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduce) y.setValue(0);
      else Animated.spring(y, { toValue: 0, ...springs.sheet, useNativeDriver: true }).start();
    } else if (mounted) {
      if (reduce) {
        y.setValue(1);
        setMounted(false);
      } else Animated.timing(y, { toValue: 1, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduce]);
  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [0, Math.min(height, 900)] });
  const scrim = y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("sh.card.close")} style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16, transform: [{ translateY }] }, shadows.float.native]}>
            <View style={[styles.grabber, { backgroundColor: c.bgMuted }]} />
            {title ? (
              <View style={styles.titleRow}>
                <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                  {title}
                </Text>
                <IconButton icon={X} label={t("sh.card.close")} variant="secondary" size={32} onPress={onClose} />
              </View>
            ) : null}
            {scroll ? (
              <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <View style={styles.body}>{children}</View>
            )}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
}

/** Confirm: title states the action, body the consequence; stacked like an iOS action sheet. */
export function ConfirmDialog({ visible, title, body, confirmLabel, cancelLabel = "Cancel", onConfirm, onCancel, variant = "danger", loading }: ConfirmDialogProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title={title}
      scroll={false}
      footer={
        <>
          <Button variant={variant === "danger" ? "primary" : variant} size="lg" fullWidth onPress={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" size="lg" fullWidth onPress={onCancel}>
            {cancelLabel}
          </Button>
        </>
      }
    >
      <Text variant="body" color="fgMuted">
        {body}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: 8 },
  grabber: { alignSelf: "center", width: layout.grabberWidth, height: layout.grabberHeight, borderRadius: 3, marginBottom: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutterMobile, paddingBottom: 12, gap: 12, minHeight: 44 },
  body: { paddingHorizontal: layout.gutterMobile, paddingBottom: 8, gap: 16 },
  footer: { paddingHorizontal: layout.gutterMobile, paddingTop: 12, gap: 4 },
});
