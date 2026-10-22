import { router } from "expo-router";
import { useEffect, useState } from "react";
import { errorMessage } from "../../api/client";
import { t } from "../../copy/en-CA";
import { managerBus } from "../../features/scanBus";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { useSession } from "../../state/session";
import { Banner, Button, Card, ConfirmDialog, Keypad, Screen, Section, Sheet, SwitchRow, Text, useToast } from "../../ui";

/** Counter settings: theme, kiosk, scanner camera, shared device, my PIN, exit. */
export default function CounterSettings() {
  const { config, setConfig, staff, queueState } = useCounter();
  const { setMode, signOut } = useSession();
  const toast = useToast();
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
      router.replace("/home");
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
      toast({ tone: "success", message: "PIN saved." });
      setPinOpen(false);
      setPin("");
    } catch (e) {
      setPin("");
      setPinErr(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    }
  };

  return (
    <Screen back title="Counter settings">
      <Card>
        <SwitchRow label="Dark theme" description="Light is easier to read in bright shops." value={config.theme === "dark"} onValueChange={(v) => setConfig({ theme: v ? "dark" : "light" })} />
        <SwitchRow label="Scanner faces customer" description="Use the front camera and mirror the preview." value={config.scannerFront} onValueChange={(v) => setConfig({ scannerFront: v })} />
        <SwitchRow label="Sound on award" description="Off by default." value={config.sound} onValueChange={(v) => setConfig({ sound: v })} />
        <SwitchRow label="Shared shop device" description="Staff switch with a PIN. Exit needs a manager." value={config.sharedDevice} onValueChange={(v) => setConfig({ sharedDevice: v })} />
      </Card>
      <Section title="Kiosk">
        <Text color="fgMuted">Turn this tablet around so customers can check in with their number.</Text>
        <Button size="counter" variant="secondary" onPress={() => guarded("kiosk")}>
          Start kiosk mode
        </Button>
      </Section>
      <Section title="My PIN">
        <Button variant="secondary" onPress={() => setPinOpen(true)}>
          Set my counter PIN
        </Button>
      </Section>
      {queueState.pendingCount > 0 ? <Banner variant="warning">{`${queueState.pendingCount} awards are still waiting to send. They stay on this device.`}</Banner> : null}
      <Button variant="secondary" onPress={() => guarded("customer")}>
        Exit counter mode
      </Button>
      <Button variant="ghost" onPress={() => setExitOpen(true)}>
        Sign out of this device
      </Button>
      <Sheet visible={pinOpen} onClose={() => setPinOpen(false)} title="Choose a 4-digit PIN" footer={<Button size="counter" disabled={pin.length !== 4} onPress={savePin}>Save PIN</Button>}>
        <Text variant="keypad" center>
          {pin.replace(/\d/g, "•") || "····"}
        </Text>
        {pinErr ? <Banner variant="danger">{pinErr}</Banner> : null}
        <Keypad onKey={(k) => { setPinErr(null); setPin((p) => (k === "back" ? p.slice(0, -1) : k === "clear" ? "" : p.length < 4 ? p + k : p)); }} />
      </Sheet>
      <ConfirmDialog
        visible={exitOpen}
        title="Sign out of this device?"
        body="Staff won't be able to award points here until someone signs in again."
        confirmLabel="Sign out"
        onCancel={() => setExitOpen(false)}
        onConfirm={() => {
          setExitOpen(false);
          guarded("signout");
        }}
      />
    </Screen>
  );
}
