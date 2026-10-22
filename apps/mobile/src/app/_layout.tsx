// Deep imports: only the weights we use get bundled (the package index pulls in every weight).
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { Figtree_700Bold } from "@expo-google-fonts/figtree/700Bold";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
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
import { configureNotifications } from "../features/push";
import { SessionExpiredSheet } from "../features/SessionExpiredSheet";
import { wireQueryOnlineManager } from "../state/network";
import { queryClient, queryPersister } from "../state/query";
import { SessionProvider } from "../state/session";
import { ThemeProvider } from "../theme";
import { ToastProvider } from "../ui";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
wireQueryOnlineManager();

export default function RootLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [fontsLoaded, fontError] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Fraunces_600SemiBold });
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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors[scheme].canvas }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: 7 * 24 * 60 * 60 * 1000 }}>
          <ThemeProvider>
            <SessionProvider>
              <ToastProvider>
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors[scheme].canvas } }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="counter" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="redeem" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
                  <Stack.Screen name="card" options={{ presentation: "formSheet", sheetAllowedDetents: [0.92], sheetGrabberVisible: true, sheetCornerRadius: 24 }} />
                  <Stack.Screen name="qr" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="discount" options={{ presentation: "fullScreenModal" }} />
                </Stack>
                <SessionExpiredSheet />
              </ToastProvider>
            </SessionProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
