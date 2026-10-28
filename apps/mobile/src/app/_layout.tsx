// Deep imports: only the two display weights get bundled (the package index pulls in every weight).
// Body text is the system font (SF Pro / Roboto); Fraunces (600, 800) is for titles, card titles and big numbers, Bricolage for the wordmark.
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Fraunces_800ExtraBold } from "@expo-google-fonts/fraunces/800ExtraBold";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { useFonts } from "expo-font";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useNotificationTaps } from "../features/customer/notifications";
import { configureNotifications } from "../features/push";
import { SessionExpiredSheet } from "../features/SessionExpiredSheet";
import { wireQueryOnlineManager } from "../state/network";
import { queryClient, queryPersister } from "../state/query";
import { LocaleProvider, LocaleRoot } from "../lib/i18n";
import { SessionProvider } from "../state/session";
import { AppearanceSync } from "../features/AppearanceSync";
import { ThemeProvider, useTheme } from "../theme";
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

/** The stack, painted with the resolved look (Clear stays light when the OS is dark; Warm follows it). */
function ThemedStack() {
  const { c, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="counter" options={{ gestureEnabled: false }} />
        <Stack.Screen name="redeem" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="card" options={{ presentation: "formSheet", sheetAllowedDetents: [0.94], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: c.bg } }} />
        <Stack.Screen name="qr" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="discount" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </>
  );
}

/** Root background follows the look too, so no frame of the other theme shows behind a transition. */
function ThemedRoot({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>{children}</GestureHandlerRootView>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_600SemiBold, Fraunces_800ExtraBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
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
    <ThemeProvider>
      <ThemedRoot>
        <SafeAreaProvider>
          <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: 7 * 24 * 60 * 60 * 1000 }}>
            <SessionProvider>
              <AppearanceSync />
              <LocaleProvider>
                <LocaleRoot>
                  <ToastProvider>
                    <ThemedStack />
                    <SessionExpiredSheet />
                    <NotificationTaps />
                  </ToastProvider>
                </LocaleRoot>
              </LocaleProvider>
            </SessionProvider>
          </PersistQueryClientProvider>
        </SafeAreaProvider>
      </ThemedRoot>
    </ThemeProvider>
  );
}
