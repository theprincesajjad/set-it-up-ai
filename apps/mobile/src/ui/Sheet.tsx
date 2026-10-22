import { radii, shadows } from "@ll/design-tokens";
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

/** Bottom sheet: top radius xl, grabber, scrim tap / Android back to close (system.md § Sheet). */
export function Sheet({ visible, onClose, title, children, footer, scroll = true }: SheetProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.surfaceRaised, paddingBottom: insets.bottom + 16 }, shadows.lg.native]}>
            <View style={[styles.grabber, { backgroundColor: c.borderStrong }]} />
            {title ? (
              <View style={styles.titleRow}>
                <Text variant="h3" accessibilityRole="header" style={{ flex: 1 }}>
                  {title}
                </Text>
                <IconButton icon={X} label="Close" onPress={onClose} />
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

/** Confirm dialog: title states the action, body the consequence, destructive on the right. */
export function ConfirmDialog({ visible, title, body, confirmLabel, cancelLabel = "Cancel", onConfirm, onCancel, variant = "danger", loading }: ConfirmDialogProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title={title}
      scroll={false}
      footer={
        <View style={styles.actions}>
          <Button variant="secondary" onPress={onCancel} style={{ flex: 1 }}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onPress={onConfirm} loading={loading} style={{ flex: 1 }}>
            {confirmLabel}
          </Button>
        </View>
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
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingTop: 8 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4 },
  body: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  actions: { flexDirection: "row", gap: 8 },
});
