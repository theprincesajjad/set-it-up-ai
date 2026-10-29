/**
 * The inbox pushed from a push notification or deep link: a back button instead of the profile one.
 *
 * phase-solo D: messages from shops (the people-side inbox) live here too. `?thread=<id>` opens one conversation with a reply
 * box; otherwise a "Messages" pill sits over the activity list when the customer has any thread.
 */
import type { inboxApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { InboxScreen } from "../features/customer/InboxScreen";
import { useLocale } from "../lib/i18n";
import { apiClient } from "../state/api";
import { ui, useTheme } from "../theme";
import { Button, EmptyState, Screen, SkeletonList, Text } from "../ui";

export default function Notifications() {
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  if (thread) return <ThreadScreen id={thread} />;
  return (
    <View style={{ flex: 1 }}>
      <InboxScreen inTab={false} />
      <MessagesPill />
    </View>
  );
}

function MessagesPill() {
  const { c } = useTheme();
  const { t } = useLocale();
  const q = useQuery({ queryKey: ["me", "threads"], queryFn: () => apiClient.get<inboxApi.MyThreadsResponse>("/v1/me/inbox"), retry: false });
  const [open, setOpen] = useState(false);
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  return (
    <View style={styles.pillWrap} pointerEvents="box-none">
      {open ? (
        <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line }]} accessibilityLabel={t("inbox.me.title")}>
          {items.map((th) => (
            <Pressable key={th.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/notifications", params: { thread: th.id } } as never)} style={styles.threadRow}>
              <Text style={ui(15, th.unread ? 700 : 500, 20)} numberOfLines={1}>{th.merchant.name}</Text>
              <Text style={ui(13, 400, 18)} rawColor={c.fgMuted} numberOfLines={1}>{th.lastMessage?.body ?? ""}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.me.open")} onPress={() => setOpen((x) => !x)} style={[styles.pill, { backgroundColor: c.brand }]}>
        <Text style={ui(15, 600, 20)} rawColor={c.onBrand}>
          {q.data?.unreadTotal ? `${t("inbox.me.title")} · ${t("inbox.me.unread", { n: q.data.unreadTotal })}` : t("inbox.me.title")}
        </Text>
      </Pressable>
    </View>
  );
}

function ThreadScreen({ id }: { id: string }) {
  const { c } = useTheme();
  const { t, time } = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["me", "thread", id], queryFn: () => apiClient.get<inboxApi.MyThreadResponse>(`/v1/me/inbox/${encodeURIComponent(id)}`), retry: false });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setFailed(false);
    try {
      await apiClient.post(`/v1/me/inbox/${encodeURIComponent(id)}/messages`, { body: body.trim() });
      setBody("");
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ["me", "threads"] });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      back
      title={q.data?.thread.merchant.name ?? t("inbox.me.title")}
      titleCase="as-is"
      footer={
        <View style={{ gap: 8 }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t("inbox.me.reply")}
            placeholderTextColor={c.fgSubtle}
            multiline
            maxLength={1000}
            accessibilityLabel={t("inbox.me.reply")}
            style={[styles.input, { borderColor: c.line, color: c.fg, backgroundColor: c.bg }]}
          />
          {failed ? <Text style={ui(13, 400, 18)} rawColor={c.fgMuted}>{t("inbox.me.failed")}</Text> : null}
          <Button size="lg" fullWidth loading={busy} disabled={!body.trim()} onPress={() => void send()}>{t("inbox.me.send")}</Button>
        </View>
      }
    >
      {q.isLoading ? <SkeletonList /> : null}
      {q.data && !q.data.messages.length ? <EmptyState title={t("inbox.me.empty")} body={t("inbox.me.emptyBody")} /> : null}
      <View style={{ gap: 8, paddingVertical: 12 }}>
        {(q.data?.messages ?? []).map((m) => {
          const mine = m.direction === "in";
          return (
            <View key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
              <View style={[styles.bubble, { backgroundColor: mine ? c.brand : c.bgSubtle }]}>
                <Text style={ui(15, 400, 21)} rawColor={mine ? c.onBrand : c.fg}>{m.body}</Text>
              </View>
              <Text style={[ui(12, 400, 16), { alignSelf: mine ? "flex-end" : "flex-start", marginTop: 2 }]} rawColor={c.fgSubtle}>
                {mine ? `${t("inbox.me.you")} · ` : ""}
                {time(m.createdAt)}
              </Text>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillWrap: { position: "absolute", left: 16, right: 16, bottom: 32, alignItems: "center", gap: 8 },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  sheet: { alignSelf: "stretch", borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  threadRow: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, justifyContent: "center" },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
