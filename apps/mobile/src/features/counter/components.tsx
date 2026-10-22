/** Presentational pieces of the counter screen (staff-counter.md). */
import { radii, touchTargets } from "@ll/design-tokens";
import type { staffApi } from "@ll/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { formatMoney, formatPts, shortName, undoSecondsLeft, type CounterProgram, type SuccessView } from "../../lib/award";
import { formatTime } from "../../lib/format";
import type { QueueSnapshot } from "../../lib/offlineQueue";
import type { ActiveStaff, RecentAward } from "../../state/counter";
import { useTheme } from "../../theme";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  ChevronDown,
  CircleCheck,
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
    <View style={[styles.header, { borderBottomColor: c.border }]}>
      <Text variant="title" numberOfLines={1} style={{ flex: 1, fontSize: 18 }} accessibilityRole="header">
        {title}
      </Text>
      {staff ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canSwitch ? `Signed in staff: ${staff.name ?? "Staff"}. Switch staff` : `Signed in staff: ${staff.name ?? "Staff"}`}
          onPress={canSwitch ? onStaff : undefined}
          style={[styles.staffChip, { backgroundColor: c.surfaceSunken }]}
        >
          <Avatar name={staff.name} id={staff.userId} size={32} />
          <Text variant="bodyStrong">{staff.name?.split(" ")[0] ?? "Staff"}</Text>
          {canSwitch ? <ChevronDown size={18} color={c.fgMuted} /> : null}
        </Pressable>
      ) : null}
      <IconButton icon={Ellipsis} label="More" onPress={onMenu} />
    </View>
  );
}

/** Number display: "(416) 555-01__" in keypad style, or the placeholder. */
export function EntryDisplay({ text, placeholder, error }: { text: string; placeholder: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6, alignItems: "center", minHeight: 72, justifyContent: "center" }} accessibilityLiveRegion="polite">
      {text ? (
        <Text variant="keypad" maxFontSizeMultiplier={1.6} accessibilityLabel={`Entered ${text.replace(/\D/g, "").split("").join(" ")}`}>
          {text}
        </Text>
      ) : (
        <Text variant="bodyLg" color="fgMuted">
          {placeholder}
        </Text>
      )}
      {error ? (
        <Text variant="bodySm" rawColor={c.danger} center>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function CustomerCard({ customer, program, vertical, onRedeem, cooldown }: { customer: CounterCustomer; program: CounterProgram | null; vertical: string; onRedeem?: () => void; cooldown?: string | null }) {
  const { c } = useTheme();
  if (customer.kind === "new") {
    return (
      <View style={{ gap: 8 }}>
        <View style={styles.row}>
          <View style={[styles.newIcon, { backgroundColor: c.brandSubtle }]}>
            <UserPlus size={24} color={c.onBrandSubtle} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h3">New customer</Text>
            <Text variant="bodyLg" color="fgMuted">
              {`...${customer.digits.slice(-4)}`}
            </Text>
          </View>
        </View>
        <Text variant="bodySm" color="fgMuted">
          They'll get a welcome text with their card and a question about offers.
        </Text>
      </View>
    );
  }
  if (customer.kind === "offline") {
    return (
      <View style={styles.row}>
        <Avatar name={customer.label} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="h3">{customer.label}</Text>
          <Text variant="bodySm" color="fgMuted">
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
          <Text variant="h3">{shortName(m.name)}</Text>
          <Text variant="bodyLg" color="fgMuted">
            {m.maskedPhone ?? m.memberCode}
          </Text>
        </View>
        {m.vip ? <Badge tone="brand">{m.vip.name}</Badge> : null}
      </View>
      {program?.earnType === "stamps" && program.stampGoal > 0 ? (
        <StampCard count={m.balance} goal={program.stampGoal} vertical={vertical} compact />
      ) : null}
      <Text variant="title">{program?.earnType === "stamps" ? `${m.balance} of ${program.stampGoal} ${m.terminology}` : formatPts(m.balance, m.terminology)}</Text>
      {ready ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Reward ready: ${ready.name}. Redeem`} onPress={onRedeem}>
          <View style={[styles.ready, { backgroundColor: c.accent }]}>
            <Gift size={22} color={c.onAccent} />
            <Text variant="title" rawColor={c.onAccent} style={{ flex: 1 }}>
              {`Reward ready: ${ready.name}`}
            </Text>
          </View>
        </Pressable>
      ) : m.nextReward ? (
        <Text variant="bodySm" color="fgMuted">{`${formatPts(m.nextReward.pointsNeeded, m.terminology)} to ${m.nextReward.name}`}</Text>
      ) : null}
      {m.openRedemptionCount > 0 ? <Banner variant="info">They have a reward code from the app. Tap Code to confirm it.</Banner> : null}
      {cooldown ? <Banner variant="warning">{cooldown}</Banner> : null}
    </View>
  );
}

/** Amount entry for per-dollar programs: "$11.80", cents shift in from the right. */
export function AmountDisplay({ cents }: { cents: number }) {
  return (
    <View style={{ alignItems: "center" }} accessibilityLiveRegion="polite">
      <Text variant="counterHero" maxFontSizeMultiplier={1.6} style={{ fontSize: 56, lineHeight: 60 }}>
        {formatMoney(cents)}
      </Text>
    </View>
  );
}

export function UndoButton({ startedAt, onUndo, label = "Undo", busy }: { startedAt: number; onUndo: () => void; label?: string; busy?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = undoSecondsLeft(startedAt, now);
  if (left === 0) return null;
  return (
    <Button variant="inverse" size="counter" iconStart={RotateCcw} onPress={onUndo} loading={busy} accessibilityLabel={`${label}, ${left} seconds left`}>
      {`${label} (${left})`}
    </Button>
  );
}

/** Full-colour success card (leaf for awards, marigold for redeems). */
export function SuccessCard({
  view,
  tone,
  startedAt,
  onUndo,
  undoBusy,
  onRedeemNow,
  undoLabel,
}: {
  view: SuccessView;
  tone: "success" | "accent";
  startedAt: number;
  onUndo?: () => void;
  undoBusy?: boolean;
  onRedeemNow?: () => void;
  undoLabel?: string;
}) {
  const { c } = useTheme();
  const bg = tone === "accent" ? c.accent : c.success;
  const fg = tone === "accent" ? c.onAccent : c.onSuccess;
  return (
    <View style={[styles.success, { backgroundColor: bg }]} accessible={false}>
      <View accessible accessibilityLabel={view.announcement} accessibilityLiveRegion="assertive" style={{ alignItems: "center", gap: 8 }}>
        <CircleCheck size={48} color={fg} />
        <Text variant="h2" rawColor={fg} center>
          {view.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {view.offline ? <Clock3 size={24} color={fg} /> : null}
          <Text variant="counterHero" rawColor={fg} center maxFontSizeMultiplier={1.4}>
            {view.hero}
          </Text>
        </View>
        {view.next ? (
          <Text variant="title" rawColor={fg} center>
            {view.next}
          </Text>
        ) : null}
        {view.offline ? (
          <Text variant="bodyStrong" rawColor={fg} center>
            Saved. Will send when you're back online.
          </Text>
        ) : null}
        {view.messages.map((msg) => (
          <Text key={msg} variant="bodyStrong" rawColor={fg} center>
            {msg}
          </Text>
        ))}
      </View>
      <View style={{ gap: 8, alignSelf: "stretch" }}>
        {view.rewardReady && onRedeemNow ? (
          <Button variant="accent" size="counter" iconStart={Gift} onPress={onRedeemNow}>
            Redeem now
          </Button>
        ) : null}
        {onUndo ? <UndoButton startedAt={startedAt} onUndo={onUndo} busy={undoBusy} label={undoLabel} /> : null}
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
      <Text variant="overline" color="fgMuted">
        Recent
      </Text>
      {recent.map((r, i) => {
        const left = undoSecondsLeft(r.at, now);
        return (
          <View key={r.key} style={[styles.recent, { borderBottomColor: c.border }]}>
            <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{`${formatTime(r.at)} · ${r.who} · ${r.label}`}</Text>
            {r.undone ? (
              <Badge tone="neutral">Undone</Badge>
            ) : r.queued ? (
              <Badge tone="warning" icon={Clock3}>
                Waiting
              </Badge>
            ) : i === 0 && left > 0 ? (
              <Button variant="secondary" size="sm" onPress={() => onUndo(r)}>{`Undo (${left})`}</Button>
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
            <Text variant="bodySm" color="fgMuted">
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
            <Button variant="accent" size="counter" loading={busy} disabled={!online} onPress={() => onConfirm(reward.id)}>
              Confirm redeem
            </Button>
            <Button variant="secondary" size="counter" onPress={() => setPicked(null)}>
              Back
            </Button>
          </>
        ) : undefined
      }
    >
      {!online ? <Banner variant="warning">Redeem needs internet. Awards still work.</Banner> : null}
      {member && reward ? (
        <Text variant="h3">{`Uses ${formatPts(reward.pointsCost, member.terminology)} · ${shortName(member.name)} will have ${Math.max(0, member.balance - reward.pointsCost)}`}</Text>
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
                style={[styles.rewardRow, { borderColor: c.border, backgroundColor: ok ? c.surface : c.surfaceSunken }]}
              >
                <Gift size={24} color={ok ? c.onAccentSubtle : c.fgMuted} />
                <Text variant="title" color={ok ? "fg" : "fgMuted"} style={{ flex: 1 }}>
                  {r.name}
                </Text>
                <Text variant="bodyStrong" color="fgMuted">
                  {ok ? formatPts(r.pointsCost, member.terminology) : `${formatPts(r.pointsCost - member.balance, member.terminology)} to go`}
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
  ready: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radii.md, padding: 14, minHeight: touchTargets.counter },
  success: { flex: 1, borderRadius: radii.xl, padding: 20, alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 360 },
  recent: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: 16 },
});
