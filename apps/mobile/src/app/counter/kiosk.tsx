import { touchTargets } from "@ll/design-tokens";
import { customerApi } from "@ll/shared";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { managerBus } from "../../features/scanBus";
import { formatPts } from "../../lib/award";
import { newIdempotencyKey } from "../../lib/ids";
import { formatNanp, toE164 } from "../../lib/phone";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { ThemeScope, useTheme } from "../../theme";
import { Banner, Button, CircleCheck, ConsentCheckbox, Keypad, ShopLogo, Text } from "../../ui";
import type { KeypadKey } from "../../ui/Keypad";

const RESET_MS = 10_000;
const KEY_GAP = 8;
const MIN_PAD_H = 4 * 72 + 3 * KEY_GAP;
const ATTRACT_MS = 60_000;

/**
 * Kiosk: customer-facing check-in tablet. 88 px keys, auto-reset after 10 s, manager PIN to exit (triple-tap logo).
 * Under 768 px wide (a phone) the header is compact and the keys shrink (never below the 72 px counter keypad)
 * so the keypad and "Check in" fit on one screen; it scrolls only if even 72 px keys don't fit.
 */
export default function Kiosk() {
  return (
    <ThemeScope scheme="light">
      <KioskInner />
    </ThemeScope>
  );
}

function KioskInner() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { config, merchant, setConfig, online } = useCounter();
  const [digits, setDigits] = useState("");
  const [step, setStep] = useState<"entry" | "consent" | "done" | "attract">("entry");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; sub: string } | null>(null);
  const [bigText, setBigText] = useState(false);
  const [padArea, setPadArea] = useState(0);
  const taps = useRef<number[]>([]);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shopName = merchant?.merchant.name ?? config.merchantName ?? "";
  const consentText = customerApi.marketingConsentText(shopName);

  const reset = () => {
    setDigits("");
    setConsent(false);
    setError(null);
    setResult(null);
    setStep("entry");
  };
  // Auto-reset after 10 s of no input (never leaves a previous customer's number on screen); attract screen after 60 s.
  const bump = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      reset();
      idle.current = setTimeout(() => setStep("attract"), ATTRACT_MS);
    }, RESET_MS);
  };
  useEffect(() => {
    bump();
    return () => void (idle.current && clearTimeout(idle.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, digits]);

  useEffect(
    () =>
      managerBus.once(() => {
        setConfig({ kiosk: false });
        router.replace("/counter");
      }),
    [setConfig],
  );

  const onLogoTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 1000), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      router.push({ pathname: "/counter/pin", params: { verifyOnly: "manager" } });
    }
  };

  const checkIn = async (withConsent: boolean) => {
    const phone = toE164(digits);
    if (!phone || !config.merchantId || !config.locationId) {
      setError(t("err.phone.incomplete"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (step === "entry") {
        // New to this shop? Ask for consent first (the customer is the one consenting).
        const look = await api.counter.lookup(config.merchantId, phone).catch(() => null);
        if (look && look.items.length === 0) {
          setStep("consent");
          return;
        }
      }
      const res = await api.counter.kioskCheckIn(config.merchantId, {
        phone,
        locationId: config.locationId,
        ...(withConsent ? { consent: { text: consentText } } : {}),
        idempotencyKey: newIdempotencyKey(),
      });
      const name = res.firstName ? `, ${res.firstName}` : "";
      setResult({
        title: res.outcome === "visit" ? `You're checked in${name}.` : `Welcome${name}. Staff will add your points at the till.`,
        sub: [`You have ${formatPts(res.balance, res.terminology)}.`, res.rewardsAvailable[0] ? `Reward ready: ${res.rewardsAvailable[0].name}` : res.nextReward ? `${formatPts(res.nextReward.pointsNeeded, res.terminology)} to ${res.nextReward.name}` : ""].filter(Boolean).join(" "),
      });
      setStep("done");
    } catch (e) {
      setError(isApiError(e) && e.code === "cooldown" ? "You've already checked in today. See you next time." : isApiError(e) && e.isNetwork ? "We can't connect right now. Ask staff to add your visit." : isApiError(e) ? e.message : t("err.server"));
    } finally {
      setBusy(false);
    }
  };

  const scale = bigText ? 1.4 : 1;
  const wide = width >= 768;
  // Phone: 4 rows + 3 gaps of 8 fill the space left under the header, clamped to 72–88 px keys.
  const compactKeyH = Math.max(touchTargets.keypad, Math.min(touchTargets.kiosk, Math.floor((padArea - 3 * KEY_GAP) / 4)));
  if (step === "attract") {
    return (
      <Pressable style={[styles.full, { backgroundColor: c.brand }]} onPress={reset} accessibilityRole="button" accessibilityLabel="Tap to check in">
        <Text variant="display" rawColor={c.onBrand} center>
          {shopName}
        </Text>
        <Text variant="h1" rawColor={c.onBrand} center>
          Check in and earn
        </Text>
        <Text variant="h3" rawColor={c.onBrand} center>
          Tap anywhere to start
        </Text>
      </Pressable>
    );
  }
  if (step === "done" && result) {
    return (
      <Pressable style={[styles.full, { backgroundColor: c.success }]} onPress={reset} accessibilityRole="button" accessibilityLabel={`${result.title} ${result.sub}. Tap to finish`}>
        <CircleCheck size={96} color={c.onSuccess} />
        <Text variant="h1" rawColor={c.onSuccess} center style={{ fontSize: 40 * scale, lineHeight: 46 * scale }}>
          {result.title}
        </Text>
        <Text variant="h3" rawColor={c.onSuccess} center>
          {result.sub}
        </Text>
      </Pressable>
    );
  }
  const onKey = (k: KeypadKey) => {
    setError(null);
    setDigits((d) => (k === "back" ? d.slice(0, -1) : k === "clear" ? "" : d.length < 10 ? d + k : d));
  };
  const logoEl = (size: number) => (
    <Pressable onPress={onLogoTap} accessibilityLabel={`${shopName} logo`} accessible>
      <ShopLogo shop={{ name: shopName, vertical: merchant?.merchant.vertical ?? "other", logoUrl: merchant?.merchant.logoUrl, brandColor: merchant?.merchant.brandColor }} size={size} />
    </Pressable>
  );
  const consentBlock = (
    <View style={{ gap: 24 }}>
      <ConsentCheckbox large text={consentText} checked={consent} onChange={setConsent} caption={t("consent.merchant.caption.v1", { shop: shopName })} />
      <Button size="kiosk" loading={busy} onPress={() => checkIn(consent)}>
        Join and check in
      </Button>
      <Button variant="secondary" size="kiosk" onPress={reset}>
        Start over
      </Button>
    </View>
  );
  const subtitle = step === "consent" ? "You're new here. One question first." : "Type your mobile number";
  const bigTextToggle = (
    <Button variant="ghost" size={wide ? "md" : "sm"} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} onPress={() => setBigText((b) => !b)}>
      {bigText ? "Normal text" : "Bigger text"}
    </Button>
  );

  if (!wide) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.compactRoot} onTouchStart={bump} keyboardShouldPersistTaps="handled">
          <View style={styles.compactHeader}>
            {logoEl(56)}
            <Text variant="display" style={{ flex: 1, fontSize: 30 * scale, lineHeight: 34 * scale }}>
              Check in and earn
            </Text>
          </View>
          <View style={styles.compactSub}>
            <Text variant="bodyLg" style={{ flex: 1, fontSize: 18 * scale, lineHeight: 24 * scale }}>
              {subtitle}
            </Text>
            {bigTextToggle}
          </View>
          {!online ? <Banner variant="warning">Offline. Ask staff to add your visit.</Banner> : null}
          {step === "consent" ? (
            consentBlock
          ) : (
            <>
              <Text variant="counterHero" center maxFontSizeMultiplier={1.4} style={{ fontSize: 40, lineHeight: 48, minHeight: 48 }}>
                {formatNanp(digits) || " "}
              </Text>
              {error ? <Banner variant="danger">{error}</Banner> : null}
              {/* The keypad is laid over this box, so its size never feeds back into the measurement. */}
              <View style={styles.padArea} onLayout={(e) => setPadArea(e.nativeEvent.layout.height)}>
                <View style={styles.padInner}>
                  <Keypad size="kiosk" keyHeight={compactKeyH} onKey={onKey} />
                </View>
              </View>
              <Button size="kiosk" loading={busy} disabled={digits.length !== 10 || !online} onPress={() => checkIn(false)} style={{ minHeight: touchTargets.keypad, height: Math.max(touchTargets.keypad, compactKeyH) }}>
                Check in
              </Button>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={[styles.root, wide ? { flexDirection: "row" } : null]} onTouchStart={bump}>
        <View style={[styles.left, wide ? { flex: 45 } : null]}>
          {logoEl(96)}
          <Text variant="display" style={{ fontSize: 40 * scale, lineHeight: 44 * scale }}>
            Check in and earn
          </Text>
          <Text variant="bodyLg" style={{ fontSize: 20 * scale, lineHeight: 28 * scale }}>
            {subtitle}
          </Text>
          {bigTextToggle}
          {!online ? <Banner variant="warning">Offline. Ask staff to add your visit.</Banner> : null}
        </View>
        <View style={[styles.right, wide ? { flex: 55 } : null]}>
          {step === "consent" ? (
            consentBlock
          ) : (
            <>
              <Text variant="counterHero" center maxFontSizeMultiplier={1.4} style={{ fontSize: 48, lineHeight: 56, minHeight: 56 }}>
                {formatNanp(digits) || " "}
              </Text>
              {error ? <Banner variant="danger">{error}</Banner> : null}
              <Keypad size="kiosk" onKey={onKey} />
              <Button size="kiosk" loading={busy} disabled={digits.length !== 10 || !online} onPress={() => checkIn(false)} style={{ minHeight: touchTargets.kiosk }}>
                Check in
              </Button>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 32, gap: 32 },
  left: { gap: 16, justifyContent: "center" },
  right: { gap: 16, justifyContent: "center" },
  full: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24, padding: 32 },
  compactRoot: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 12 },
  compactHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  compactSub: { flexDirection: "row", alignItems: "center", gap: 12 },
  padArea: { flex: 1, minHeight: MIN_PAD_H },
  padInner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center" },
});
