import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../../copy/en-CA";
import { scanBus } from "../../features/scanBus";
import { useCounter } from "../../state/counter";
import { useTheme } from "../../theme";
import { Button, Camera, EmptyState, Flashlight, IconButton, Text, X } from "../../ui";

/** Full-screen barcode scanner: member QR, wallet pass barcode, redeem code QR. Auto-closes on read. */
export default function Scan() {
  const { c } = useTheme();
  const { config } = useCounter();
  const [permission, request] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const done = useRef(false);

  if (!permission) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center", padding: 16 }}>
        <EmptyState
          icon={Camera}
          title="Camera is off"
          body={t("err.camera.denied")}
          actionLabel={permission.canAskAgain ? "Turn on camera" : "Open settings"}
          onAction={() => (permission.canAskAgain ? request() : Linking.openSettings())}
          secondaryLabel="Type number instead"
          onSecondary={() => router.back()}
        />
      </SafeAreaView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={[StyleSheet.absoluteFill, config.scannerFront ? { transform: [{ scaleX: -1 }] } : null]}
        facing={config.scannerFront ? "front" : "back"}
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr", "pdf417", "aztec", "code128"] }}
        onBarcodeScanned={(r) => {
          if (done.current || !r.data) return;
          done.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          router.back();
          setTimeout(() => scanBus.emit(r.data), 50);
        }}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.top}>
          <IconButton icon={X} label="Close scanner" variant="secondary" onPress={() => router.back()} />
        </View>
        <View style={styles.frame} accessibilityLabel="Point the camera at the card's QR code">
          {[styles.tl, styles.tr, styles.bl, styles.br].map((s, i) => (
            <View key={i} style={[styles.corner, s]} />
          ))}
        </View>
        <Text variant="bodyLg" rawColor="#FFFFFF" center>
          Scan the member card or reward code
        </Text>
        <View style={styles.bottom}>
          <IconButton icon={Flashlight} label={torch ? "Torch off" : "Torch on"} variant="secondary" size={64} onPress={() => setTorch((v) => !v)} />
          <Button variant="inverse" onPress={() => router.back()}>
            Type number instead
          </Button>
        </View>
      </SafeAreaView>
    </View>
  );
}

const C = 36;
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "space-between", padding: 16 },
  top: { alignSelf: "flex-start" },
  frame: { width: 260, height: 260 },
  corner: { position: "absolute", width: C, height: C, borderColor: "#FFFFFF" },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  bottom: { alignItems: "center", gap: 16, paddingBottom: 16 },
});
