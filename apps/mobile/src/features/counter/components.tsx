/** Presentational pieces of the counter screen (staff-counter.md). */
import { radii, touchTargets } from "@ll/design-tokens";
import type { staffApi } from "@ll/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { hairline } from "../../ui/shadow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney, formatNumber, formatPts, initials, lockedRewardCopy, shortName, UNDO_SECONDS, undoSecondsLeft, type CounterProgram, type SuccessView } from "../../lib/award";
import { formatTime, rewardInSentence } from "../../lib/format";
import { maskPhone } from "../../lib/phone";
import type { QueueSnapshot } from "../../lib/offlineQueue";
import type { ActiveStaff, RecentAward } from "../../state/counter";
import { disp, ui, useTheme } from "../../theme";
import {
  Appear,
  Avatar,
  Badge,
  CircleAlert,
  CountUp,
  DrainBar,
  Phone,
  SuccessCheck,
  Banner,
  Button,
  ChevronDownGlyph,
  CloseGlyph,
  ChevronDown,
  ChevronRight,
  Clock3,
  Ellipsis,
  Gift,
  IconButton,
  RotateCcw,
  Sheet,
  StampCard,
  Text,
  UserPlus,
} from "../../ui";
import type { CounterCustomer } from "../../lib/award";

/**
 * Counter header (canvas Counter.dc.html): the shop in Bricolage 800 17 over "counter · <location>", and the
 * staff capsule (28 pt initials, first name, ▾) that opens the counter menu (today, queue, settings, switch).
 */
export function CounterHeader({ title, subtitle, staff, onMenu }: { title: string; subtitle?: string | null; staff: ActiveStaff | null; onStaff?: () => void; onMenu: () => void; canSwitch?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { borderBottomColor: c.line, paddingTop: Math.max(7, 54 - insets.top) }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={disp(17, 800, 21)} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[ui(12, 400, 16), { marginTop: 2 }]} rawColor={c.fgMuted} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {staff ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`More. Signed in as ${staff.name ?? "staff"}`} onPress={onMenu} style={({ pressed }) => [styles.staffChip, { backgroundColor: c.bgSubtle, opacity: pressed ? 0.8 : 1 }]}>
          <View style={[styles.staffAv, { backgroundColor: c.bg }]}>
            <Text style={ui(11, 600, 14)}>{initials(staff.name).toLowerCase()}</Text>
          </View>
          <Text style={ui(14, 500, 18)}>{staff.name?.split(" ")[0] ?? "Staff"}</Text>
          <ChevronDownGlyph size={12} strokeWidth={2.4} color={c.fg} />
        </Pressable>
      ) : (
        <IconButton icon={Ellipsis} label="More" variant="secondary" size={36} onPress={onMenu} />
      )}
    </View>
  );
}

/** Number display: "(416) 555-01__" in keypad style, or the placeholder. */
export function EntryDisplay({ text, placeholder, error }: { text: string; placeholder: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6, alignItems: "center", minHeight: 72, justifyContent: "center" }} accessibilityLiveRegion="polite">
      {text ? (
        <Text variant="keypad" tabular maxFontSizeMultiplier={1.4} style={{ fontSize: 36, lineHeight: 42, fontWeight: "500", letterSpacing: 0.5 }} accessibilityLabel={`Entered ${text.replace(/\D/g, "").split("").join(" ")}`}>
          {text}
        </Text>
      ) : (
        <Text variant="headline" color="fgMuted" style={{ fontWeight: "400" }}>
          {placeholder}
        </Text>
      )}
      {error ? (
        <Text variant="meta" rawColor={c.negative} center>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/**
 * Member found (canvas Counter.dc.html): 48 pt initials, name 18/600, masked phone · nth visit, a clear
 * button; then the balance as one 64 pt tabular number ("7 / 10" with the goal in grey), what's left, and
 * the stamp row (accent = earned, grey rings = to go).
 */
export function CustomerCard({ customer, program, onCode, onClear, cooldown }: { customer: CounterCustomer; program: CounterProgram | null; vertical?: string; onRedeem?: () => void; onCode?: () => void; onClear?: () => void; cooldown?: string | null }) {
  const { c } = useTheme();
  const clear = onClear ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Clear customer" onPress={onClear} style={[styles.clear, { backgroundColor: c.bgSubtle }]}>
      <CloseGlyph size={16} color={c.fg} />
    </Pressable>
  ) : null;
  if (customer.kind === "new") {
    return (
      <View style={{ gap: 8 }}>
        <View style={styles.row}>
          <View style={[styles.av48, { backgroundColor: c.bgMuted }]}>
            <UserPlus size={22} color={c.fg} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ui(18, 600, 23)}>New customer</Text>
            <Text style={[ui(13, 400, 17), { fontVariant: ["tabular-nums"] }]} rawColor={c.fgMuted}>{`•• ${customer.digits.slice(-4)}`}</Text>
          </View>
          {clear}
        </View>
        <Text variant="meta" color="fgMuted">
          They'll get a welcome text with their card and a question about offers.
        </Text>
      </View>
    );
  }
  if (customer.kind === "offline") {
    return (
      <View style={styles.row}>
        {/* No name offline: a phone glyph, not initials of "…1004". */}
        <View style={[styles.av48, { backgroundColor: c.bgMuted }]}>
          <Phone size={22} color={c.fg} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ui(18, 600, 23), { fontVariant: ["tabular-nums"] }]}>{customer.label}</Text>
          <Text style={ui(13, 400, 17)} rawColor={c.fgMuted}>
            Balance updates when you're back online
          </Text>
        </View>
        {clear}
      </View>
    );
  }
  const m = customer.member;
  const ready = m.rewardsAffordable[0];
  const stamps = program?.earnType === "stamps" && program.stampGoal > 0;
  const goal = stamps ? program!.stampGoal : 0;
  const shown = stamps ? Math.min(m.balance, goal) : m.balance;
  const toGo = m.nextReward ? m.nextReward.pointsNeeded : null;
  const line = ready
    ? `${m.terminology} · ${rewardInSentence(ready.name)} ready`
    : toGo != null && m.nextReward
      ? `${m.terminology} · ${toGo} to ${/^free /i.test(m.nextReward.name) ? `a ${rewardInSentence(m.nextReward.name)}` : m.nextReward.name}`
      : m.terminology;
  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.av48, { backgroundColor: c.bgMuted }]}>
          <Text style={ui(15, 600, 19)}>{initials(m.name).toLowerCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={ui(18, 600, 23)} numberOfLines={1}>
            {m.name ?? "Customer"}
          </Text>
          <Text style={[ui(13, 400, 17), { fontVariant: ["tabular-nums"] }]} rawColor={c.fgMuted} numberOfLines={1}>
            {[m.maskedPhone ? maskPhone(m.maskedPhone).replace(/(•+)\s(\d{4})$/, "$1-$2") : m.memberCode, `${ORD(m.visitCount + 1)} visit`].join(" · ")}
          </Text>
        </View>
        {clear}
      </View>
      {m.vip ? <View style={{ marginTop: 10 }}><Badge tone="neutral">{m.vip.name}</Badge></View> : null}

      <View style={{ marginTop: 28, alignItems: "center" }} accessible accessibilityLabel={`${shown}${stamps ? ` of ${goal}` : ""} ${m.terminology}. ${line}`}>
        <Text style={[disp(64, 800, 64, -0.02), { fontVariant: ["tabular-nums"] }]} maxFontSizeMultiplier={1.2}>
          {formatNumber(shown)}
          <Text style={disp(32, 800, 40, -0.02)} rawColor={c.fgSubtle}>
            {stamps ? ` / ${goal}` : ` ${unitShort(m.terminology, m.balance)}`}
          </Text>
        </Text>
        <Text style={[ui(14, 400, 18), { marginTop: 8 }]} rawColor={ready ? c.accentText : c.fgMuted}>
          {line}
        </Text>
        {stamps ? (
          <View style={styles.stampRow}>
            {Array.from({ length: goal }, (_, i) => (
              <View key={i} style={[styles.stamp, i < shown ? { backgroundColor: c.accent } : { borderWidth: 1.5, borderColor: c.lineStrong }]} />
            ))}
          </View>
        ) : null}
      </View>
      {m.openRedemptionCount > 0 ? (
        <View style={{ marginTop: 20 }}>
          <Banner variant="info" actionLabel={onCode ? "Enter code" : undefined} onAction={onCode}>
            They have a reward code from the app.
          </Banner>
        </View>
      ) : null}
      {cooldown ? <View style={{ marginTop: 12 }}><Banner variant="warning">{cooldown}</Banner></View> : null}
    </View>
  );
}

function unitShort(term: string, n: number): string {
  return formatPts(n, term).replace(/^[\d,]+ /, "");
}

/** +1 / +2 / +3 (canvas): grey 44 pt capsules in Bricolage 700 16, black when picked. */
export function QuantityChips({ values, value, onChange, unit }: { values: number[]; value: number; onChange: (q: number) => void; unit: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.qtyRow} accessibilityRole="radiogroup">
      {values.map((q) => {
        const on = q === value;
        return (
          <Pressable key={q} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`+${q}`} accessibilityHint={`${q} ${unit} for this visit`} onPress={() => onChange(q)} style={({ pressed }) => [styles.qty, { backgroundColor: on ? c.fg : c.bgSubtle, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={disp(16, 700, 20)} rawColor={on ? c.bg : c.fg}>{`+${q}`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The 72 pt black award button (canvas: radius 20, Bricolage 800 22). */
export function AwardButton({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, busy: !!loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.award, { backgroundColor: disabled ? c.bgMuted : c.fg, opacity: pressed ? 0.9 : 1 }]}>
      {loading ? <ActivityIndicator color={c.bg} /> : <Text style={disp(22, 800, 26)} rawColor={disabled ? c.fgSubtle : c.bg}>{label}</Text>}
    </Pressable>
  );
}

/** Grey 52 pt secondary counter button ("Redeem · needs 10" disabled, "Enter code"). */
export function CounterSecondary({ label, onPress, disabled, accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.secondary, { backgroundColor: pressed ? c.bgMuted : c.bgSubtle }]}>
      <Text style={ui(15, 600, 19)} rawColor={disabled ? c.fgSubtle : c.fg} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Amount entry for per-dollar programs: "$11.80", cents shift in from the right. */
export function AmountDisplay({ cents }: { cents: number }) {
  return (
    <View style={{ alignItems: "center" }} accessibilityLiveRegion="polite">
      <Text variant="displayNumber" tabular maxFontSizeMultiplier={1.4} style={{ fontSize: 56, lineHeight: 62 }}>
        {formatMoney(cents)}
      </Text>
    </View>
  );
}

export function UndoButton({ startedAt, onUndo, label = "Undo", busy }: { startedAt: number; onUndo: () => void; label?: string; busy?: boolean }) {
  const { c } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = undoSecondsLeft(startedAt, now);
  if (left === 0) return null;
  // "Undo · 8s" with a bar that empties over the window (polish-audit C8).
  return (
    <View style={{ gap: 6 }}>
      <Button variant="secondary" size="counter" iconStart={RotateCcw} onPress={onUndo} loading={busy} accessibilityLabel={`${label}, ${left} seconds left`}>
        {`${label} · ${left}s`}
      </Button>
      <View style={{ paddingHorizontal: 16 }}>
        <DrainBar startedAt={startedAt} ms={UNDO_SECONDS * 1000} color={c.fgMuted} track={c.bgMuted} height={2} />
      </View>
    </View>
  );
}

/**
 * Award / redeem result: white, a green check, what staff did in black, and
 * the points in accent (the one accent on screen = points awarded). Undo is a
 * grey counter-size button with its countdown.
 */
export function SuccessCard({
  view,
  tone,
  startedAt,
  onUndo,
  undoBusy,
  onRedeemNow,
  undoLabel,
  onNext,
}: {
  view: SuccessView;
  tone: "success" | "accent";
  startedAt: number;
  onUndo?: () => void;
  undoBusy?: boolean;
  onRedeemNow?: () => void;
  undoLabel?: string;
  /** "Next customer": don't make staff wait for the auto-return (polish-audit C7). */
  onNext?: () => void;
}) {
  const { c } = useTheme();
  const heroColor = tone === "accent" ? c.fg : c.accent;
  // "9 / 10", "1,240 pts", "~9 / 10": count the leading number up from the balance before the award.
  const m = /^(~?)([\d,]+)(.*)$/.exec(view.hero);
  const heroStyle = { fontSize: view.hero.length > 7 ? 56 : 72, lineHeight: view.hero.length > 7 ? 64 : 80 };
  return (
    <View style={[styles.success, { backgroundColor: c.bg }]} accessible={false}>
      <View accessible accessibilityLabel={view.announcement} accessibilityLiveRegion="assertive" style={{ alignItems: "center", gap: 8 }}>
        {view.offline ? <Clock3 size={44} color={c.fgMuted} strokeWidth={1.75} /> : <SuccessCheck size={48} color={c.positive} />}
        <Text variant="title" center>
          {view.title}
        </Text>
        {m && view.count && Number(m[2]!.replace(/,/g, "")) === view.count.to ? (
          <Text variant="displayNumber" rawColor={heroColor} center tabular maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={heroStyle}>
            {m[1]}
            <CountUp value={view.count.to} from={view.count.from} variant="displayNumber" rawColor={heroColor} style={heroStyle} />
            {m[3]}
          </Text>
        ) : (
          <Text variant="displayNumber" rawColor={heroColor} center tabular maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={heroStyle}>
            {view.hero}
          </Text>
        )}
        {view.next ? (
          <Text variant="headline" color="fgMuted" center style={{ fontWeight: "400" }}>
            {view.next}
          </Text>
        ) : null}
        {view.offline ? (
          <Text variant="bodyStrong" center>
            Saved on this phone. It sends when you're back online.
          </Text>
        ) : null}
        {view.messages.map((msg) => (
          <Text key={msg} variant="bodyStrong" color="accentText" center>
            {msg}
          </Text>
        ))}
      </View>
      <View style={{ gap: 8, alignSelf: "stretch" }}>
        {view.rewardReady && onRedeemNow ? (
          <Button size="counter" iconStart={Gift} onPress={onRedeemNow}>
            Redeem now
          </Button>
        ) : null}
        {onUndo ? <UndoButton startedAt={startedAt} onUndo={onUndo} busy={undoBusy} label={undoLabel} /> : null}
        {onNext ? (
          <Button variant="ghost" size="lg" fullWidth onPress={onNext}>
            Next customer
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** After an undo or a failure: same frame as success (icon, one line, Next customer), no bordered card (C9). */
export function NoticeCard({ message, tone, onNext }: { message: string; tone: "neutral" | "danger"; onNext: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.success, { backgroundColor: c.bg }]}>
      <Appear style={{ alignItems: "center", gap: 12 }}>
        {tone === "danger" ? <CircleAlert size={44} color={c.negative} strokeWidth={1.75} /> : <RotateCcw size={44} color={c.fgMuted} strokeWidth={1.75} />}
        <Text variant="title" color={tone === "danger" ? "negative" : "fg"} center accessibilityLiveRegion="polite">
          {message}
        </Text>
      </Appear>
      <View style={{ alignSelf: "stretch" }}>
        <Button size="counter" onPress={onNext}>
          Next customer
        </Button>
      </View>
    </View>
  );
}

export function RecentStrip({ recent, onUndo }: { recent: RecentAward[]; onUndo: (r: RecentAward) => void }) {
  const { c } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (recent.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text variant="metaStrong" color="fgMuted">
        recent
      </Text>
      {recent.map((r, i) => {
        const left = undoSecondsLeft(r.at, now);
        // Two lines, never truncated mid-word: what happened, then who and when (polish-audit C12, C19).
        return (
          <View key={r.key} style={[styles.recent, { borderBottomColor: c.line }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" numberOfLines={2} style={r.undone ? { textDecorationLine: "line-through", color: c.fgMuted } : null}>
                {r.label}
              </Text>
              <Text variant="meta" color="fgMuted" tabular numberOfLines={1}>{`${r.who} · ${formatTime(r.at)}`}</Text>
            </View>
            {r.undone ? (
              <Badge tone="neutral">Undone</Badge>
            ) : r.queued ? (
              <Badge tone="warning" icon={Clock3}>
                Waiting to send
              </Badge>
            ) : i === 0 && left > 0 ? (
              <Button variant="secondary" size="sm" onPress={() => onUndo(r)}>{`Undo · ${left}s`}</Button>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function QueueSheet({ visible, onClose, state, onRetry, onDismiss, online }: { visible: boolean; onClose: () => void; state: QueueSnapshot; onRetry: () => void; onDismiss: (id: string) => void; online: boolean }) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Waiting to send (${state.pendingCount})`}
      footer={
        <Button size="counter" onPress={onRetry} loading={state.flushing} disabled={!online && state.pendingCount === 0}>
          Retry now
        </Button>
      }
    >
      {state.items.length === 0 ? <Text color="fgMuted">Everything has been sent.</Text> : null}
      {state.items.map((i) => (
        <View key={i.id} style={{ gap: 4, paddingVertical: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>{`${formatTime(i.createdAt)} · ${i.display.who} · ${i.display.label}`}</Text>
            <Badge tone={i.status === "failed" ? "danger" : i.status === "sending" ? "info" : "warning"}>{i.status === "failed" ? "Needs attention" : i.status === "sending" ? "Sending" : "Waiting"}</Badge>
          </View>
          {i.error ? (
            <Text variant="meta" color="fgMuted">
              {i.error.code === "duplicate" ? `Couldn't add for ${i.display.who}: it was already added.` : `Couldn't add for ${i.display.who}: ${i.error.message}`}
            </Text>
          ) : null}
          {i.status === "failed" ? (
            <Button variant="ghost" size="sm" onPress={() => onDismiss(i.id)}>
              Dismiss
            </Button>
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}

export function RewardPicker({
  visible,
  onClose,
  member,
  rewards,
  onConfirm,
  busy,
  error,
  online,
}: {
  visible: boolean;
  onClose: () => void;
  member: staffApi.MemberSummaryDto | null;
  rewards: { id: string; name: string; pointsCost: number; rewardType: string }[];
  onConfirm: (rewardId: string) => void;
  busy?: boolean;
  error?: string | null;
  online: boolean;
}) {
  const { c } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) setPicked(null);
  }, [visible]);
  const reward = rewards.find((r) => r.id === picked) ?? null;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={reward ? reward.name : "Redeem a reward"}
      footer={
        reward ? (
          <>
            <Button size="counter" loading={busy} disabled={!online} onPress={() => onConfirm(reward.id)}>
              Confirm redeem
            </Button>
            <Button variant="ghost" size="counter" onPress={() => setPicked(null)}>
              Back
            </Button>
          </>
        ) : undefined
      }
    >
      {!online ? <Banner variant="warning">Redeem needs internet. Awards still work.</Banner> : null}
      {member && reward ? (
        <Text color="fgMuted">{`Uses ${formatPts(reward.pointsCost, member.terminology)}. ${shortName(member.name)} will have ${formatPts(Math.max(0, member.balance - reward.pointsCost), member.terminology)} left.`}</Text>
      ) : null}
      {member && !reward
        ? rewards.map((r) => {
            const ok = member.balance >= r.pointsCost;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ok }}
                onPress={ok ? () => setPicked(r.id) : undefined}
                style={({ pressed }) => [styles.rewardRow, { borderBottomColor: c.line, backgroundColor: pressed && ok ? c.bgSubtle : c.bg }]}
              >
                <Gift size={22} color={ok ? c.accent : c.fgSubtle} strokeWidth={2} />
                <Text variant="headline" color={ok ? "fg" : "fgMuted"} style={{ flex: 1 }}>
                  {r.name}
                </Text>
                <Text variant="body" color="fgMuted" tabular>
                  {ok ? formatPts(r.pointsCost, member.terminology) : lockedRewardCopy(r.pointsCost - member.balance, member.terminology)}
                </Text>
              </Pressable>
            );
          })
        : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Canvas: 54 pt top padding includes the status bar; the screen's safe area provides that part.
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 7, paddingBottom: 14, borderBottomWidth: hairline },
  staffChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4, paddingRight: 6, height: 36, borderRadius: 999 },
  staffAv: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  clear: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  av48: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  stampRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 6, marginTop: 16 },
  stamp: { width: 24, height: 24, borderRadius: 12 },
  qtyRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  qty: { height: 44, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  award: { height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  secondary: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  newIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  ready: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 16, minHeight: touchTargets.counter },
  success: { flex: 1, paddingTop: 32, paddingBottom: 4, alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 360 },
  recent: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
});
