import { t as translate, isLocale, LOCALES, type Locale, type MessageKey } from "@ll/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView, View, useColorScheme } from "react-native";
import { getJson } from "../state/storage";
import { FailView } from "./FailView";

/**
 * The root error boundary (exported from app/_layout.tsx). A screen that throws while rendering lands here instead of Expo's
 * English default. It replaces the whole layout, so the app's providers are gone: it reads the saved language itself, never
 * shows the error text, says nothing is lost, offers Try again and a way back to the cards.
 */
export function AppErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  const [locale, setLocale] = useState<Locale>("en");
  const scheme = useColorScheme();
  useEffect(() => {
    let live = true;
    void getJson<string>("ll.locale.v1").then((v) => {
      if (live && isLocale(v)) setLocale(v);
    });
    return () => {
      live = false;
    };
  }, []);
  const t = (key: MessageKey) => translate(locale, key);
  const toCards = () => {
    try {
      router.replace("/wallet");
    } catch {
      void retry();
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: scheme === "dark" ? "#0B0B0C" : "#FFFFFF" }}>
      <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: "center", direction: LOCALES[locale].dir }}>
        <FailView title={t("err.server.title")} body={t("mf.boundary.body")} primaryLabel={t("err.action.retry")} onPrimary={() => void retry()} secondaryLabel={t("mf.go.cards")} onSecondary={toCards} help={t("err.help.customer")} />
      </View>
    </SafeAreaView>
  );
}
