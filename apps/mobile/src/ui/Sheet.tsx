import { layout, radii, shadows } from "@ll/design-tokens";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Button, type ButtonVariant } from "./Button";
import { IconButton } from "./IconButton";
import { X } from "./icons";
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

/** Bottom sheet: radius 24, grabber, title + round close, scrim tap / Android back closes. */
export function Sheet({ visible, onClose, title, children, footer, scroll = true }: SheetProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }, shadows.float.native]}>
            <View style={[styles.grabber, { backgroundColor: c.bgMuted }]} />
            {title ? (
              <View style={styles.titleRow}>
                <Text variant="mapLabel" accessibilityRole="header" style={{ flex: 1, fontSize: 20, lineHeight: 26, textTransform: "none" }}>
                  {title}
                </Text>
                <IconButton icon={X} label="Close" variant="secondary" size={32} onPress={onClose} />
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
          </View>
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
  titleRow: { flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 16, paddingBottom: 8, gap: 12 },
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
});
