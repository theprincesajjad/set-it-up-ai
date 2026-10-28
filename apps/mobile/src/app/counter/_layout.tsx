import { Redirect, Stack } from "expo-router";
import { CounterProvider, useCounter } from "../../state/counter";
import { useSession } from "../../state/session";
import { ThemeScope, useTheme } from "../../theme";
import { appearanceFromPayload, resolveAppearance } from "../../theme/appearance";
import { ToastProvider } from "../../ui";

function CounterStack() {
  const { config, merchant } = useCounter();
  // The look follows the shop's setting (Settings > Appearance on the web) unless this device picked one; the counter stays light
  // unless its own Dark switch is on (bright shops; Warm keeps the same switch).
  const { style } = resolveAppearance({ device: { style: config.themeStyle ?? null }, shop: appearanceFromPayload(merchant) });
  return (
    <ThemeScope scheme={config.theme} style={style}>
      <ToastProvider bottomOffset={24}>
        <Themed />
      </ToastProvider>
    </ThemeScope>
  );
}

function Themed() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="scan" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="kiosk" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

/** Counter mode: light theme by default (bright shops), its own state and offline queue. */
export default function CounterLayout() {
  const { status } = useSession();
  if (status === "signedOut") return <Redirect href="/staff-sign-in" />;
  return (
    <CounterProvider>
      <CounterStack />
    </CounterProvider>
  );
}
