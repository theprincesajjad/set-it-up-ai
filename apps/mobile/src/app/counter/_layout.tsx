import { Redirect, Stack } from "expo-router";
import { CounterProvider, useCounter } from "../../state/counter";
import { useSession } from "../../state/session";
import { ThemeScope, useTheme } from "../../theme";
import { ToastProvider } from "../../ui";

function CounterStack() {
  const { config } = useCounter();
  return (
    <ThemeScope scheme={config.theme}>
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
