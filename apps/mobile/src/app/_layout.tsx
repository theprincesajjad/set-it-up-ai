// Deep imports: only the two display weights get bundled (the package index pulls in every weight).
// Body text is the system font (SF Pro / Roboto); Bricolage is for titles, numbers and map labels.
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { useFonts } from "expo-font";
import { colors } from "@ll/design-tokens";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useNotificationTaps } from "../features/customer/notifications";
import { configureNotifications } from "../features/push";
import { SessionExpiredSheet } from "../features/SessionExpiredSheet";
import { wireQueryOnlineManager } from "../state/network";
import { queryClient, queryPersister } from "../state/query";
import { SessionProvider } from "../state/session";
import { ThemeProvider } from "../theme";
import { installWebStyles } from "../theme/webStyles";
import { ToastProvider } from "../ui";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
wireQueryOnlineManager();
installWebStyles();

/** Mounted after the Stack so a cold-start tap can navigate (useNotificationTaps needs the router ready). */
function NotificationTaps() {
  useNotificationTaps();
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [fontsLoaded, fontError] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  // Never block first paint on fonts for long (system font fallback).
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const ready = fontsLoaded || !!fontError || timedOut;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  useEffect(() => configureNotifications(), []);
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors[scheme].bg }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: 7 * 24 * 60 * 60 * 1000 }}>
          <ThemeProvider>
            <SessionProvider>
              <ToastProvider>
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors[scheme].bg } }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
                  <Stack.Screen name="counter" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="redeem" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
                  <Stack.Screen name="card" options={{ presentation: "formSheet", sheetAllowedDetents: [0.94], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: colors[scheme].bg } }} />
                  <Stack.Screen name="qr" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="discount" options={{ presentation: "fullScreenModal" }} />
                </Stack>
                <SessionExpiredSheet />
                <NotificationTaps />
              </ToastProvider>
            </SessionProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
