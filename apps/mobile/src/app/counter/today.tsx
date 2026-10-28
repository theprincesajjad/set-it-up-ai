import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { formatMoney, initials, shortName } from "../../lib/award";
import { formatTime, signed } from "../../lib/format";
import { api } from "../../state/api";
import { useCounter } from "../../state/counter";
import { qk } from "../../state/query";
import { Avatar, Badge, Button, Calculator, ChevronLeft, ChevronRight, CLEAR_CARD_TITLE, clearCard, EmptyState, ErrorState, Gift, Glass, History, ListRow, ScrollEdge, MessageCircle, Screen, Section, Skeleton, StatTile, Text, Ticket, User, Users, useToast } from "../../ui";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import { useLocale } from "../../lib/i18n";
import { greetingKey, hourBars, needsItems, statCards } from "../../lib/ownerToday";
import { useSession } from "../../state/session";
import { last4Label } from "../../lib/phone";

/** Today: Clear (mock `?s=today-m`) or Warm, the same data and the same Undo. */
export default function Today() {
  const { isClear } = useTheme();
  return isClear ? <ClearToday /> : <WarmToday />;
}

/** Warm Today: 2x2 stats + today's activity with the staff initials; Undo where the API allows it. */
function WarmToday() {
  const { c } = useTheme();
  const { config, online, program } = useCounter();
  const unit = (program?.terminology ?? "points").toLowerCase();
  const toast = useToast();
  const mId = config.merchantId ?? "";
  const loc = config.locationId ?? undefined;
  const today = useQuery({ queryKey: qk.counterToday(mId, loc), queryFn: () => api.counter.today(mId, loc), enabled: !!mId });
  const activity = useQuery({ queryKey: qk.counterActivity(mId, loc), queryFn: () => api.counter.activity(mId, loc, 100), enabled: !!mId });
  const [busy, setBusy] = useState<string | null>(null);
  const undo = async (id: string) => {
    setBusy(id);
    try {
      const res = await api.counter.undo(mId, id, "Undo from Today");
      toast(t("ok.counter.undone", { firstName: shortName(res.member.name), pts: `${res.member.balance} ${res.member.terminology}` }));
      await Promise.all([today.refetch(), activity.refetch()]);
    } catch (e) {
      toast({ tone: "error", message: isApiError(e) && e.status === 403 ? "Ask a manager to undo this one." : isApiError(e) ? e.message : t("err.network") });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen back title="Today" onRefresh={() => Promise.all([today.refetch(), activity.refetch()])} refreshing={today.isRefetching}>
      {today.isLoading ? (
        <Skeleton height={176} radius={16} />
      ) : today.data ? (
        // One bordered block, numbers split by hairlines (foundations § Stats), not four cards.
        <View style={[styles.stats, { borderColor: c.line }]}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <StatTile label="Visits" value={today.data.visitCount} />
            </View>
            <View style={[styles.vrule, { backgroundColor: c.line }]} />
            <View style={styles.stat}>
              <StatTile label={`${unit.charAt(0).toUpperCase()}${unit.slice(1)} given`} value={today.data.pointsIssued} />
            </View>
          </View>
          <View style={[styles.hrule, { backgroundColor: c.line }]} />
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <StatTile label="Redemptions" value={today.data.redemptions} />
            </View>
            <View style={[styles.vrule, { backgroundColor: c.line }]} />
            <View style={styles.stat}>
              <StatTile label="New members" value={today.data.newMembers} />
            </View>
          </View>
        </View>
      ) : (
        <ErrorState offline={!online} message={t("err.network")} onRetry={() => today.refetch()} />
      )}
      <Section title="Activity">
        {(activity.data?.items ?? []).length === 0 && !activity.isLoading ? (
          <EmptyState icon={History} body="No visits yet today. Awards show up here as you make them." />
        ) : (
          <View>
            {(activity.data?.items ?? []).map((a, i, all) => (
              <ListRow
                key={a.transactionId}
                divider={i < all.length - 1}
                minHeight={64}
                // The row is about the customer: their initials lead; who tapped goes in the meta line (polish-audit C13).
                leading={<Avatar name={a.name} size={40} />}
                title={shortName(a.name)}
                subtitle={[formatTime(a.createdAt), a.maskedPhone ? last4Label(a.maskedPhone) : null, a.amountCents ? formatMoney(a.amountCents) : null, a.points < 0 ? "redeemed" : null, a.staffName ? `by ${a.staffName.split(" ")[0]}` : null].filter(Boolean).join(" · ")}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text variant="bodyStrong" tabular color={a.reversed ? "fgMuted" : a.points > 0 ? "accentText" : "fg"} style={a.reversed ? { textDecorationLine: "line-through" } : null}>
                      {signed(a.points)}
                    </Text>
                    {a.reversed ? (
                      <Badge>Undone</Badge>
                    ) : a.canUndo ? (
                      <Button variant="secondary" size="sm" loading={busy === a.transactionId} onPress={() => undo(a.transactionId)}>
                        Undo
                      </Button>
                    ) : null}
                  </View>
                }
              />
            ))}
          </View>
        )}
      </Section>
      <Text variant="meta" color="fgMuted">Later corrections go through Adjust in the dashboard.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 16, overflow: "hidden" },
  statRow: { flexDirection: "row" },
  stat: { flex: 1, paddingHorizontal: 16, paddingVertical: 14 },
  vrule: { width: StyleSheet.hairlineWidth * 2 },
  hrule: { height: StyleSheet.hairlineWidth * 2 },
});

// ---------------------------------------------------------------------------------------------------------------------------
// Clear (docs/design/v3.2-clear-audit.md section 2, mock `?s=today-m`)
// ---------------------------------------------------------------------------------------------------------------------------

const STAT_ICONS = { users: Users, ticket: Ticket, gift: Gift, user: User } as const;

/**
 * Phone owner Today in Clear: a glass capsule row (back, the shop), the greeting with the date only, the "Open counter" CTA in a
 * glass frame, four stat cards on the 2 x 171 grid, "Needs you", visits by hour, then today's activity (with Undo). Cards are flat;
 * only the capsules and the CTA frame are glass. Owners and managers get the report's comparisons; staff see the counter numbers.
 */
function ClearToday() {
  const theme = useTheme();
  const { c, r, x, trade } = theme;
  const { t: tr, number, date, isRtl } = useLocale();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { config, online, program, staff, merchant } = useCounter();
  const { user } = useSession();
  const toast = useToast();
  const mId = config.merchantId ?? "";
  const loc = config.locationId ?? undefined;
  const today = useQuery({ queryKey: qk.counterToday(mId, loc), queryFn: () => api.counter.today(mId, loc), enabled: !!mId });
  const activity = useQuery({ queryKey: qk.counterActivity(mId, loc), queryFn: () => api.counter.activity(mId, loc, 100), enabled: !!mId });
  // Managers and owners only; a 403 (staff) is not an error here, the counter's own numbers stand in.
  const report = useQuery({ queryKey: qk.ownerToday(mId), queryFn: () => api.reports.today(mId), enabled: !!mId, retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const undo = async (id: string) => {
    setBusy(id);
    try {
      const res = await api.counter.undo(mId, id, "Undo from Today");
      toast(t("ok.counter.undone", { firstName: shortName(res.member.name), pts: `${res.member.balance} ${res.member.terminology}` }));
      await Promise.all([today.refetch(), activity.refetch(), report.refetch()]);
    } catch (e) {
      toast({ tone: "error", message: isApiError(e) && e.status === 403 ? "Ask a manager to undo this one." : isApiError(e) ? e.message : t("err.network") });
    } finally {
      setBusy(null);
    }
  };

  const now = new Date();
  const f = { t: tr, number, isolate: isRtl ? (v: string) => `\u2066${v}\u2069` : undefined };
  const firstName = (staff?.name ?? user?.name ?? "").split(" ")[0] ?? "";
  const greeting = tr(greetingKey(now.getHours(), !!firstName), { name: firstName });
  const dateLine = date(now, { weekday: "long", month: "short", day: "numeric" });
  const rep = report.data ?? null;
  const cards = statCards({ report: rep, counter: today.data ?? null, terminology: program?.terminology ?? null, weekday: date(now, { weekday: "short" }) }, f);
  const needs = needsItems(rep, f);
  const bars = hourBars(rep, now.getHours());
  const vertical = merchant?.merchant.vertical ?? null;
  const tc = trade(vertical);
  const col = Math.floor((width - 16 * 2 - 16) / 2);
  const shopName = config.merchantName ?? merchant?.merchant.name ?? "";
  const where = config.locationAddress ?? config.locationName ?? null;
  const goCounter = () => (router.canGoBack() ? router.back() : router.replace("/counter"));
  const items = activity.data?.items ?? [];
  const Chevron = ChevronRight;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 72, paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={today.isRefetching} onRefresh={() => void Promise.all([today.refetch(), activity.refetch(), report.refetch()])} />}
      >
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 36, fontWeight: "700", letterSpacing: -0.62 }}>
            {greeting}
          </Text>
          <Text color="fgMuted" style={{ fontSize: 15, lineHeight: 20 }}>
            {dateLine}
          </Text>
        </View>

        {/* The one primary action on the phone: solid black in a glass frame (64 = 4 + 56 + 4, r26 / r22). */}
        <Glass radius={26} style={{ padding: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("shell.today.openCounter")}
            onPress={goCounter}
            style={({ pressed }) => [
              clearStyles.cta,
              { backgroundColor: c.brand, transform: pressed ? [{ scale: 0.98 }] : undefined },
              { boxShadow: theme.isDark ? "0 8px 20px -4px rgba(0,0,0,0.6)" : "0 8px 20px -4px rgba(20,24,40,0.35), inset 0 1px 0 rgba(255,255,255,0.18)" } as object,
            ]}
          >
            <Calculator size={22} color={c.onBrand} strokeWidth={1.8} />
            <Text rawColor={c.onBrand} style={{ flex: 1, fontSize: 17, lineHeight: 24, fontWeight: "600", letterSpacing: -0.17 }}>
              {tr("shell.today.openCounter")}
            </Text>
            <Chevron size={20} color={c.onBrand} strokeWidth={2} />
          </Pressable>
        </Glass>

        {today.isLoading && !rep ? (
          <Skeleton height={360} radius={20} />
        ) : today.data || rep ? (
          <View style={clearStyles.grid} accessibilityRole="summary" accessibilityLabel={tr("shell.today.numbers")}>
            {cards.map((s) => {
              const Icon = STAT_ICONS[s.icon];
              return (
                <View key={s.key} accessible accessibilityLabel={`${s.label}: ${s.value}${s.chip ? `. ${s.chip.text}` : ""}`} style={[clearCard(theme), clearStyles.stat, { width: col }]}>
                  <View style={[clearStyles.statTile, { backgroundColor: tc.soft }]}>
                    <Icon size={18} color={tc.accent} strokeWidth={1.8} />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text color="fgMuted" numberOfLines={1} style={{ fontSize: 13, lineHeight: 20, fontWeight: "500" }}>
                      {s.label}
                    </Text>
                    <Text tabular style={{ fontSize: 32, lineHeight: 36, fontWeight: "600", letterSpacing: -1 }}>
                      {s.value}
                    </Text>
                  </View>
                  {s.chip ? (
                    <View style={[clearStyles.chip, { backgroundColor: s.chip.tone === "up" ? x.successSoft : s.chip.tone === "info" ? r.infoSoft : r.muted }]}>
                      {s.chip.arrow ? <ArrowUpRight size={12} strokeWidth={2.4} color={r.successText} style={isRtl ? { transform: [{ scaleX: -1 }] } : undefined} /> : null}
                      <Text numberOfLines={1} rawColor={s.chip.tone === "up" ? r.successText : s.chip.tone === "info" ? r.infoText : r.foreground} style={{ fontSize: 12, lineHeight: 16, fontWeight: "600" }}>
                        {s.chip.text}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <ErrorState offline={!online} message={t("err.network")} onRetry={() => today.refetch()} />
        )}

        {rep ? (
          <View style={clearCard(theme)}>
            <View style={clearStyles.cardHeader}>
              <Text accessibilityRole="header" style={CLEAR_CARD_TITLE}>
                {tr("shell.today.needsYou")}
              </Text>
              {needs.length ? (
                <View style={[clearStyles.badge, { backgroundColor: r.muted }]}>
                  <Text tabular style={{ fontSize: 12, lineHeight: 16, fontWeight: "500" }}>{number(needs.length)}</Text>
                </View>
              ) : null}
            </View>
            {needs.length === 0 ? (
              <View style={[clearStyles.row, { minHeight: 44 }]}>
                <Text color="fgMuted">{tr("shell.today.nothingNeedsYou")}</Text>
              </View>
            ) : (
              needs.map((n, i) => {
                const Icon = n.icon === "gift" ? Gift : MessageCircle;
                return (
                  <View key={n.key} style={[clearStyles.row, { minHeight: 64 }]}>
                    {/* Dividers drawn over the row (no layout), inset 16 at the leading edge on phones (audit #5, #17). */}
                    <View style={[clearStyles.rule, { backgroundColor: r.border, start: 16 }]} />
                    <View style={[clearStyles.rowTile, { backgroundColor: tc.soft }]}>
                      <Icon size={18} color={tc.accent} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: "600" }}>{n.title}</Text>
                      <Text color="fgMuted" style={{ fontSize: 13, lineHeight: 20 }}>{n.subtitle}</Text>
                    </View>
                                      </View>
                );
              })
            )}
          </View>
        ) : null}

        {bars ? (
          <View style={clearCard(theme)}>
            <View style={clearStyles.cardHeader}>
              <Text accessibilityRole="header" style={CLEAR_CARD_TITLE}>
                {tr("shell.today.byHour")}
              </Text>
              {bars.peakHour != null ? (
                <Text color="fgMuted" style={{ fontSize: 13, lineHeight: 20 }}>
                  {tr("shell.today.peakAt", { time: date(new Date(now.getFullYear(), now.getMonth(), now.getDate(), bars.peakHour), { hour: "numeric" }) })}
                </Text>
              ) : null}
            </View>
            <View
              accessible
              accessibilityLabel={bars.peakHour != null ? tr("shell.today.byHourSummary", { time: date(new Date(now.getFullYear(), now.getMonth(), now.getDate(), bars.peakHour), { hour: "numeric" }) }) : tr("shell.today.byHourEmpty")}
              style={[clearStyles.bars, { flexDirection: isRtl ? "row-reverse" : "row" }]}
            >
              <View style={[clearStyles.baseline, { backgroundColor: r.border }]} />
              {bars.heights.map((h, i) => (
                <View key={i} style={{ flex: 1, height: Math.max(2, Math.round(h * 96)), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: i === bars.current ? tc.accent : x.chartMuted }} />
              ))}
            </View>
            <View style={[clearStyles.axis, { flexDirection: isRtl ? "row-reverse" : "row" }]}>
              {[bars.hours[0], bars.hours[Math.floor(bars.hours.length / 2)], bars.hours[bars.hours.length - 1]].map((h, i) => (
                <Text key={i} color="fgMuted" tabular style={{ fontSize: 12, lineHeight: 16 }}>
                  {h != null ? date(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h), { hour: "numeric" }) : ""}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        <View style={clearCard(theme)}>
          <View style={clearStyles.cardHeader}>
            <Text accessibilityRole="header" style={CLEAR_CARD_TITLE}>
              Activity
            </Text>
          </View>
          {items.length === 0 && !activity.isLoading ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <EmptyState icon={History} body="No visits yet today. Awards show up here as you make them." />
            </View>
          ) : (
            items.map((a) => (
              <View key={a.transactionId} style={[clearStyles.row, { minHeight: 64 }]}>
                <View style={[clearStyles.rule, { backgroundColor: r.border, start: 16 }]} />
                <Avatar name={a.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: "600" }} numberOfLines={1}>
                    {shortName(a.name)}
                  </Text>
                  <Text color="fgMuted" numberOfLines={1} style={{ fontSize: 13, lineHeight: 20 }}>
                    {[formatTime(a.createdAt), a.maskedPhone ? last4Label(a.maskedPhone) : null, a.amountCents ? formatMoney(a.amountCents) : null, a.points < 0 ? "redeemed" : null, a.staffName ? `by ${a.staffName.split(" ")[0]}` : null].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Text variant="bodyStrong" tabular color={a.reversed ? "fgMuted" : "fg"} style={a.reversed ? { textDecorationLine: "line-through" } : null}>
                  {signed(a.points)}
                </Text>
                {a.reversed ? (
                  <Badge>Undone</Badge>
                ) : a.canUndo ? (
                  <Button variant="secondary" size="sm" loading={busy === a.transactionId} onPress={() => undo(a.transactionId)}>
                    Undo
                  </Button>
                ) : null}
              </View>
            ))
          )}
        </View>
        <Text variant="meta" color="fgMuted" style={{ paddingHorizontal: 16 }}>Later corrections go through Adjust in the dashboard.</Text>
      </ScrollView>

      <ScrollEdge edge="top" offset={insets.top} />
      {/* Glass capsule row over the scrolling page (y 12, 16 gutter): back, and the shop (32 mark + name + street). */}
      <View style={[clearStyles.capsules, { top: insets.top + 12 }]} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel={tr("rc.back")} onPress={goCounter} hitSlop={4}>
          <Glass radius={22} style={clearStyles.circle}>
            <ChevronLeft size={20} color={c.fg} strokeWidth={2} />
          </Glass>
        </Pressable>
        <Glass radius={22} style={clearStyles.shop}>
          <View style={[clearStyles.mark, { backgroundColor: tc.accent }]}>
            <Text allowFontScaling={false} rawColor={tc.foreground} style={{ fontSize: 11, lineHeight: 16, fontWeight: "600" }}>
              {initials(shopName).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 16, fontWeight: "600" }}>
              {shopName}
            </Text>
            {where ? (
              <Text numberOfLines={1} color="fgMuted" style={{ fontSize: 12, lineHeight: 16 }}>
                {where}
              </Text>
            ) : null}
          </View>
        </Glass>
      </View>
    </View>
  );
}

const clearStyles = StyleSheet.create({
  capsules: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  circle: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  shop: { flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingStart: 6, paddingEnd: 16 },
  mark: { width: 32, height: 32, borderRadius: 10, borderCurve: "continuous", alignItems: "center", justifyContent: "center" },
  cta: { height: 56, borderRadius: 22, borderCurve: "continuous", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  stat: { padding: 16, gap: 12, minHeight: 140 },
  statTile: { width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, height: 24, borderRadius: 12, paddingHorizontal: 8, marginTop: -4 },
  cardHeader: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { height: 20, borderRadius: 8, paddingHorizontal: 8, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rule: { position: "absolute", top: 0, end: 0, height: StyleSheet.hairlineWidth * 2 },
  rowTile: { width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center" },
  bars: { height: 104, alignItems: "flex-end", gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  baseline: { position: "absolute", left: 16, right: 16, bottom: 0, height: 1 },
  axis: { justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
});
