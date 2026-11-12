import { router } from "expo-router";
import { useEffect, useState } from "react";
import { errorMessage } from "../../api/client";
import { LanguageSwitcher } from "../../lib/i18n/LanguageSwitcher";
import { useLocale } from "../../lib/i18n";
import { managerBus } from "../../features/scanBus";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { useSession } from "../../state/session";
import { appearanceFromPayload } from "../../theme/appearance";
import { useTheme } from "../../theme";
import { Banner, Button, ConfirmDialog, Keypad, Screen, Section, SegmentedControl, Sheet, SwitchRow, Text, useToast } from "../../ui";

/** Counter settings: theme, kiosk, scanner camera, shared device, my PIN, exit. */
export default function CounterSettings() {
  const { config, setConfig, staff, queueState, merchant } = useCounter();
  const { style } = useTheme();
  const shopStyle = appearanceFromPayload(merchant)?.style ?? "clear";
  const { setMode, signOut } = useSession();
  const toast = useToast();
  const { t } = useLocale();
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [pendingExit, setPendingExit] = useState<null | "customer" | "signout" | "kiosk">(null);

  useEffect(() => {
    if (!pendingExit) return;
    return managerBus.once(() => {
      if (pendingExit === "kiosk") {
        setConfig({ kiosk: true });
        router.replace("/counter/kiosk");
      } else void doExit(pendingExit);
      setPendingExit(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExit]);

  const doExit = async (kind: "customer" | "signout") => {
    if (kind === "customer") {
      setConfig({ sharedDevice: false, kiosk: false });
      setMode("customer");
      router.replace("/map");
    } else {
      await signOut({ keepQueue: queueState.pendingCount > 0 });
      router.replace("/welcome");
    }
  };
  const guarded = (kind: "customer" | "signout" | "kiosk") => {
    if (config.sharedDevice && staff?.role === "staff") {
      setPendingExit(kind);
      router.push({ pathname: "/counter/pin", params: { verifyOnly: "manager" } });
    } else if (kind === "kiosk") {
      setConfig({ kiosk: true });
      router.replace("/counter/kiosk");
    } else void doExit(kind);
  };

  const savePin = async () => {
    try {
      await api.auth.setStaffPin(config.merchantId!, pin);
      toast({ tone: "success", message: t("mc.set.pinSaved") });
      setPinOpen(false);
      setPin("");
    } catch (e) {
      setPin("");
      setPinErr(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    }
  };

  return (
    <Screen back title={t("mc.set.title")}>
      <Section title={t("settings.appearance.style")} spaced>
        <SegmentedControl
          accessibilityLabel={t("settings.appearance.style")}
          options={[
            { value: "clear", label: t("settings.appearance.clear") },
            { value: "warm", label: t("settings.appearance.warm") },
          ]}
          value={style}
          // Picking the shop's own look clears the device override, so a later change in the shop's settings reaches this device.
          onChange={(v) => setConfig({ themeStyle: v === shopStyle ? null : v })}
        />
        <Text variant="meta" color="fgMuted">{style === "clear" ? t("settings.appearance.clearHint") : t("settings.appearance.warmHint")}</Text>
      </Section>
      <Section title={t("mc.set.device")}>
        <SwitchRow label={t("mc.set.dark")} description={t("mc.set.darkHint")} value={config.theme === "dark"} onValueChange={(v) => setConfig({ theme: v ? "dark" : "light" })} divider />
        <SwitchRow label={t("mc.set.scannerFront")} description={t("mc.set.scannerFrontHint")} value={config.scannerFront} onValueChange={(v) => setConfig({ scannerFront: v })} divider />
        <SwitchRow label={t("mc.set.sound")} description={t("mc.set.soundHint")} value={config.sound} onValueChange={(v) => setConfig({ sound: v })} divider />
        <SwitchRow label={t("mc.set.shared")} description={t("mc.set.sharedHint")} value={config.sharedDevice} onValueChange={(v) => setConfig({ sharedDevice: v })} />
      </Section>
      <Section title={t("lang.label")} spaced>
        <LanguageSwitcher />
      </Section>
      <Section title={t("mc.set.kiosk")} spaced>
        <Text color="fgMuted">{t("mc.set.kioskHint")}</Text>
        <Button size="lg" variant="secondary" onPress={() => guarded("kiosk")}>
          {t("mc.set.kioskStart")}
        </Button>
      </Section>
      <Section title={t("mc.set.myPin")} spaced>
        <Button size="lg" variant="secondary" onPress={() => setPinOpen(true)}>
          {t("mc.set.setPin")}
        </Button>
      </Section>
      <Section title={t("mc.set.leave")} spaced>
        {queueState.pendingCount > 0 ? <Banner variant="warning">{t("mc.set.pending", { n: queueState.pendingCount })}</Banner> : null}
        <Button size="lg" variant="secondary" onPress={() => guarded("customer")}>
          {t("mc.set.exit")}
        </Button>
        <Button size="lg" variant="ghost" onPress={() => setExitOpen(true)}>
          {t("mc.set.signOutDevice")}
        </Button>
      </Section>
      <Sheet visible={pinOpen} onClose={() => setPinOpen(false)} title={t("mc.set.choosePin")} footer={<Button size="counter" disabled={pin.length !== 4} onPress={savePin}>{t("mc.set.savePin")}</Button>}>
        <Text variant="keypad" center>
          {pin.replace(/\d/g, "•") || "····"}
        </Text>
        {pinErr ? <Banner variant="danger">{pinErr}</Banner> : null}
        <Keypad onKey={(k) => { setPinErr(null); setPin((p) => (k === "back" ? p.slice(0, -1) : k === "clear" ? "" : p.length < 4 ? p + k : p)); }} />
      </Sheet>
      <ConfirmDialog
        visible={exitOpen}
        title={t("mc.set.signOutQ")}
        body={t("mc.set.signOutBody")}
        confirmLabel={t("err.action.signOut")}
        cancelLabel={t("counter.cancel")}
        onCancel={() => setExitOpen(false)}
        onConfirm={() => {
          setExitOpen(false);
          guarded("signout");
        }}
      />
    </Screen>
  );
}
