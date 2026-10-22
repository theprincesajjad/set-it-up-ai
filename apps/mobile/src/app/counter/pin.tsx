import { touchTargets } from "@ll/design-tokens";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { managerBus } from "../../features/scanBus";
import { firstName } from "../../lib/award";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { qk } from "../../state/query";
import { useTheme } from "../../theme";
import { Avatar, Banner, Button, Keypad, Text } from "../../ui";

/**
 * Staff PIN screen (shared device): staff tiles → 4-digit PIN on the Keypad.
 * The staff list is manager+ only on the API; without it the PIN alone identifies staff.
 * `?verifyOnly=manager` re-uses the pad to authorise a manager action (exit kiosk / counter).
 */
export default function StaffPin() {
  const { verifyOnly } = useLocalSearchParams<{ verifyOnly?: string }>();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { config, setStaffFromPin } = useCounter();
  const merchantId = config.merchantId ?? "";
  const team = useQuery({ queryKey: qk.team(merchantId), queryFn: () => api.merchant.team(merchantId), enabled: !!merchantId, retry: false });
  const staff = (team.data?.items ?? []).filter((s) => s.hasPin).slice(0, 12);
  const [picked, setPicked] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  const doShake = () =>
    Animated.sequence([4, -4, 4, -4, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 40, useNativeDriver: true }))).start();

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.verifyStaffPin(merchantId, { pin: value, ...(picked ? { userId: picked } : {}) });
      if (verifyOnly === "manager") {
        if (res.staff.role === "staff") {
          setError("A manager or owner needs to do this.");
          setPin("");
          doShake();
          return;
        }
        router.back();
        managerBus.approve();
        return;
      }
      setStaffFromPin(res);
      router.replace("/counter");
    } catch (e) {
      setPin("");
      doShake();
      setError(isApiError(e) && e.status === 429 ? t("err.pin.locked") : isApiError(e) && e.status === 401 ? t("err.pin.wrong") : t("err.network"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (pin.length === 4 && !busy) void verify(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const wide = width >= 768;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.root, wide ? { flexDirection: "row" } : null]}>
        <View style={{ flex: 1, gap: 16 }}>
          <Text variant="h2">{verifyOnly ? "Manager PIN" : `Who's at the counter?`}</Text>
          <Text color="fgMuted">{config.locationName ?? config.merchantName ?? ""}</Text>
          {staff.length > 0 && !verifyOnly ? (
            <ScrollView contentContainerStyle={styles.tiles}>
              {staff.map((s) => (
                <Pressable
                  key={s.userId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked === s.userId }}
                  accessibilityLabel={s.name ?? "Staff"}
                  onPress={() => {
                    setPicked(s.userId);
                    setPin("");
                    setError(null);
                  }}
                  style={[styles.tile, { borderColor: picked === s.userId ? c.brand : c.border, backgroundColor: picked === s.userId ? c.brandSubtle : c.surface }]}
                >
                  <Avatar name={s.name} id={s.userId} size={56} />
                  <Text variant="bodyStrong">{firstName(s.name) ?? "Staff"}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 16, maxWidth: 440, alignSelf: "center", width: "100%" }}>
          <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]} accessible accessibilityLabel={`${pin.length} of 4 digits entered`}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.dot, { borderColor: error ? c.danger : c.borderStrong, backgroundColor: i < pin.length ? c.fg : "transparent" }]} />
            ))}
          </Animated.View>
          {error ? <Banner variant="danger">{error}</Banner> : null}
          <Keypad onKey={(k) => setPin((p) => (k === "back" ? p.slice(0, -1) : k === "clear" ? "" : p.length < 4 ? p + k : p))} disabled={busy} />
          {!verifyOnly ? (
            <Button variant="ghost" onPress={() => router.replace("/counter/select")}>
              Switch location
            </Button>
          ) : (
            <Button variant="secondary" onPress={() => router.back()}>
              Cancel
            </Button>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 24 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: 112, minHeight: touchTargets.kiosk + 24, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center", gap: 6, padding: 8 },
  dots: { flexDirection: "row", gap: 16, justifyContent: "center", paddingVertical: 8 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
});
