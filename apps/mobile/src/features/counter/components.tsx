/** Presentational pieces of the counter screen (staff-counter.md). */
import { radii, touchTargets } from "@ll/design-tokens";
import type { staffApi } from "@ll/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { formatMoney, formatPts, lockedRewardCopy, shortName, UNDO_SECONDS, undoSecondsLeft, type CounterProgram, type SuccessView } from "../../lib/award";
import { formatTime, rewardInSentence } from "../../lib/format";
import { maskPhone } from "../../lib/phone";
import type { QueueSnapshot } from "../../lib/offlineQueue";
import type { ActiveStaff, RecentAward } from "../../state/counter";
import { useTheme } from "../../theme";
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

export function CounterHeader({ title, staff, onStaff, onMenu, canSwitch }: { title: string; staff: ActiveStaff | null; onStaff: () => void; onMenu: () => void; canSwitch: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: c.line }]}>
      <Text variant="headline" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </Text>
      {staff ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canSwitch ? `Signed in staff: ${staff.name ?? "Staff"}. Switch staff` : `Signed in staff: ${staff.name ?? "Staff"}`}
          onPress={canSwitch ? onStaff : undefined}
          style={[styles.staffChip, { backgroundColor: c.bgSubtle }]}
        >
          <Avatar name={staff.name} id={staff.userId} size={32} />
          <Text variant="bodyStrong">{staff.name?.split(" ")[0] ?? "Staff"}</Text>
          {canSwitch ? <ChevronDown size={18} color={c.fgMuted} /> : null}
        </Pressable>
      ) : null}
      <IconButton icon={Ellipsis} label="More" variant="secondary" onPress={onMenu} />
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

export function CustomerCard({ customer, program, vertical, onRedeem, onCode, cooldown }: { customer: CounterCustomer; program: CounterProgram | null; vertical: string; onRedeem?: () => void; onCode?: () => void; cooldown?: string | null }) {
  const { c } = useTheme();
  if (customer.kind === "new") {
    return (
      <View style={{ gap: 8 }}>
        <View style={styles.row}>
          <View style={[styles.newIcon, { backgroundColor: c.bgSubtle }]}>
            <UserPlus size={24} color={c.fg} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title">New customer</Text>
            <Text variant="body" color="fgMuted" tabular>
              {`•• ${customer.digits.slice(-4)}`}
            </Text>
          </View>
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
        {/* No name offline: a phone glyph, not initials of "…1004" (polish-audit C17). */}
        <View style={[styles.newIcon, { backgroundColor: c.bgMuted }]}>
          <Phone size={24} color={c.fg} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title" tabular>{customer.label}</Text>
          <Text variant="meta" color="fgMuted">
            Balance updates when you're back online
          </Text>
        </View>
      </View>
    );
  }
  const m = customer.member;
  const ready = m.rewardsAffordable[0];
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.row}>
        <Avatar name={m.name} id={m.memberId} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="title">{shortName(m.name)}</Text>
          <Text variant="body" color="fgMuted" tabular>
            {m.maskedPhone ? maskPhone(m.maskedPhone) : m.memberCode}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="displayNumber" tabular style={{ fontSize: 32, lineHeight: 36 }}>
            {program?.earnType === "stamps" && m.balance <= program.stampGoal ? `${m.balance} / ${program.stampGoal}` : formatPts(m.balance, m.terminology).split(" ")[0]}
          </Text>
          <Text variant="meta" color="fgMuted">
            {m.terminology}
          </Text>
        </View>
      </View>
      {m.vip ? <Badge tone="neutral">{m.vip.name}</Badge> : null}
      {program?.earnType === "stamps" && program.stampGoal > 0 ? <StampCard count={m.balance} goal={program.stampGoal} vertical={vertical} compact /> : null}
      {ready ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Reward ready: ${ready.name}. Redeem`} onPress={onRedeem} style={({ pressed }) => [styles.ready, { borderColor: c.line, backgroundColor: pressed ? c.bgSubtle : c.bg }]}>
          <Gift size={22} color={c.accent} strokeWidth={2} />
          <Text variant="headline" color="accentText" style={{ flex: 1 }}>
            {`Reward ready: ${rewardInSentence(ready.name)}`}
          </Text>
          <ChevronRight size={20} color={c.fgMuted} />
        </Pressable>
      ) : m.nextReward ? (
        <Text variant="meta" color="fgMuted">{`${formatPts(m.nextReward.pointsNeeded, m.terminology)} to ${m.nextReward.name}`}</Text>
      ) : null}
      {m.openRedemptionCount > 0 ? (
        <Banner variant="info" actionLabel={onCode ? "Enter code" : undefined} onAction={onCode}>
          They have a reward code from the app.
        </Banner>
      ) : null}
      {cooldown ? <Banner variant="warning">{cooldown}</Banner> : null}
    </View>
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
  header: { height: 56, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  staffChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 4, paddingRight: 10, minHeight: 44, borderRadius: 999 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  newIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  ready: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 16, minHeight: touchTargets.counter },
  success: { flex: 1, paddingTop: 32, paddingBottom: 4, alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 360 },
  recent: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
});
