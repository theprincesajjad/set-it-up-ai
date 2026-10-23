/**
 * Scan-first counter pieces (cafes-retail.md 7.2, Figma Cafés & Retail frames 3:2, 3:65, 3:114, 3:155):
 * the viewfinder with the camera embedded in the main screen, four digit boxes and the keypad, the two-matches
 * list, the stamped screen, the reward-ready screen and the Undo toast that outlives the 3 s auto-return.
 */
import type { staffApi } from "@ll/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { cameInText, carryOverLine, formatPts, initials, matchesHeading, maskedRow, stampsLeft, visitThisMonth, AUTO_RETURN_SECONDS, SCAN_UNDO_SECONDS, undoSecondsLeft, type CounterProgram, type SuccessView } from "../../lib/award";
import { rewardInSentence } from "../../lib/format";
import { disp, ui, useTheme } from "../../theme";
import { Avatar, Button, CountUp, Text, haptic } from "../../ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

/** Black viewfinder: reticle, "Hold the card up", the camera behind it when permission is granted. */
export function ScanViewfinder({ onScan, hint, lastScanGuardMs = 4000 }: { onScan: (data: string) => void; hint: string; lastScanGuardMs?: number }) {
  const { c } = useTheme();
  const [permission, request] = useCameraPermissions();
  const last = useRef({ data: "", at: 0 });
  const granted = !!permission?.granted;
  return (
    <View accessibilityLabel="Scan a card" style={[styles.finder, { backgroundColor: c.fg }]}>
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr", "pdf417", "aztec", "code128"] }}
          onBarcodeScanned={(r) => {
            if (!r.data) return;
            // The same card held in view must not fire twice in a row.
            if (r.data === last.current.data && Date.now() - last.current.at < lastScanGuardMs) return;
            last.current = { data: r.data, at: Date.now() };
            haptic.success();
            onScan(r.data);
          }}
        />
      ) : null}
      <View pointerEvents="none" style={[styles.reticle, { borderColor: c.bg }]} />
      <View style={styles.finderText} pointerEvents="box-none">
        <Text style={[disp(24, 800, 28), { textAlign: "center" }]} rawColor={c.bg}>
          Hold the card up
        </Text>
        <Text style={[ui(13, 400, 18), { marginTop: 6, textAlign: "center" }]} rawColor={c.fgSubtle}>
          {hint}
        </Text>
        {!granted && permission ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => (permission.canAskAgain ? request() : Linking.openSettings())}
            style={{ marginTop: 10, minHeight: 36, justifyContent: "center" }}
          >
            <Text style={[ui(13, 600, 18), { textDecorationLine: "underline" }]} rawColor={c.bg}>
              {permission.canAskAgain ? "Turn on the camera" : "Open settings to turn on the camera"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Four boxes for the last 4 digits; the next empty one is outlined black. */
export function DigitBoxes({ digits, boxWidth = 62 }: { digits: string; boxWidth?: number }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={digits ? `Entered ${digits.split("").join(" ")}` : "Enter the last 4 digits"} style={styles.boxes}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.box, { width: boxWidth, borderColor: i === digits.length ? c.fg : c.line, backgroundColor: c.bg }]}>
          <Text style={[ui(28, 500, 34), { fontVariant: ["tabular-nums"] }]}>{digits[i] ?? ""}</Text>
        </View>
      ))}
    </View>
  );
}

/** 1 to 9, a gap, 0 and Del (the layout on the frames). */
export function ScanKeypad({ onKey, disabled }: { onKey: (k: "back" | string) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.pad}>
      {KEYS.map((k, i) =>
        k === "" ? (
          <View key={`gap-${i}`} style={styles.padKey} />
        ) : (
          <Pressable
            key={k}
            accessibilityRole="keyboardkey"
            accessibilityLabel={k === "back" ? "Delete" : k}
            disabled={disabled}
            onPress={() => {
              haptic.select();
              onKey(k);
            }}
            onLongPress={k === "back" ? () => onKey("clear") : undefined}
            style={({ pressed }) => [styles.padKey, { backgroundColor: pressed ? c.bgMuted : c.bgSubtle, opacity: disabled ? 0.5 : 1 }]}
          >
            <Text style={k === "back" ? [ui(15, 500, 20)] : [ui(26, 400, 32), { fontVariant: ["tabular-nums"] }]} rawColor={k === "back" ? c.fgMuted : c.fg}>
              {k === "back" ? "Del" : k}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

/** A row of stamp circles: accent when earned, a hairline ring when empty. */
export function StampRow({ goal, filled, size = 28 }: { goal: number; filled: number; size?: number }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${Math.min(filled, goal)} of ${goal} stamps`} style={styles.stamps}>
      {Array.from({ length: goal }, (_, i) => {
        const on = i < filled;
        return (
          <View key={i} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.accent : "transparent", borderWidth: on ? 0 : 1.5, borderColor: c.line }}>
            {on ? <Text style={[ui(Math.round(size * 0.55), 700, size)]} rawColor={c.onAccent}>{"✓"}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Two or more members end in the typed digits: tap one and the stamp is added at once. */
export function MatchList({ digits, items, program, now, onPick, onNew }: { digits: string; items: staffApi.MemberSummaryDto[]; program: CounterProgram | null; now: Date; onPick: (m: staffApi.MemberSummaryDto) => void; onNew: () => void }) {
  const { c } = useTheme();
  const auto = !!program?.counterAutoStamp && program.earnType !== "per_dollar";
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={disp(22, 800, 28)} accessibilityRole="header">
          {matchesHeading(items.length, digits)}
        </Text>
        <Text style={ui(14, 400, 20)} rawColor={c.fgMuted}>
          {auto ? "Tap one. Stamp is added immediately." : "Tap one to open their card."}
        </Text>
      </View>
      <DigitBoxes digits={digits} />
      <View style={{ gap: 10 }}>
        {items.map((m) => (
          <View key={m.memberId} style={[styles.match, { borderColor: c.line }]}>
            <Avatar name={m.name} id={m.memberId} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={ui(17, 600, 22)} numberOfLines={1}>
                {m.name ?? "Member"}
              </Text>
              <Text style={[ui(14, 400, 19), { fontVariant: ["tabular-nums"] }]} rawColor={c.fgMuted}>
                {maskedRow(m.maskedPhone)}
              </Text>
              <Text style={ui(13, 400, 18)} rawColor={c.fgMuted}>
                {program?.earnType === "stamps" && program.stampGoal ? `${Math.min(m.balance, program.stampGoal)} of ${program.stampGoal}` : formatPts(m.balance, m.terminology)} · {cameInText(m.lastVisitAt, now)}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${auto ? "Stamp" : "Open"} ${m.name ?? "member"}`} onPress={() => onPick(m)} style={({ pressed }) => [styles.pill, { backgroundColor: c.fg, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={ui(14, 600, 18)} rawColor={c.bg}>
                {auto ? "Stamp" : "Open"}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onNew} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
        <Text style={ui(14, 500, 19)}>Not here? Add as a new member with their number</Text>
      </Pressable>
    </View>
  );
}

/** Four digits that match nobody. */
export function NoMatch({ digits, onTryAgain, onNew }: { digits: string; onTryAgain: () => void; onNew: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <Text style={disp(22, 800, 28)} accessibilityRole="header">{`No one ends in ${digits}`}</Text>
      <Text style={ui(14, 400, 20)} rawColor={c.fgMuted}>Check the digits, or add them as a new member with their number.</Text>
      <Button size="lg" variant="secondary" onPress={onTryAgain}>Try again</Button>
      <Button size="lg" onPress={onNew}>Add as a new member</Button>
    </View>
  );
}

/** Black bar: "Stamp added · 8:02 am" and Undo with its seconds. It stays after the screen returns to scan. */
export function UndoToast({ at, name, time, onUndo, busy }: { at: number; name?: string | null; time: string; onUndo: () => void; busy?: boolean }) {
  const { c } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = undoSecondsLeft(at, now, SCAN_UNDO_SECONDS);
  if (left === 0) return null;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: c.fg }]}>
      <Text style={[ui(13, 500, 18), { flex: 1 }]} rawColor={c.bg} numberOfLines={1}>
        {`${name ? `${name.split(/\s+/)[0]} · ` : ""}Stamp added · ${time}`}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Undo, ${left} seconds left`} disabled={busy} onPress={onUndo} style={{ minHeight: 36, justifyContent: "center", paddingLeft: 12, opacity: busy ? 0.6 : 1 }}>
        <Text style={[ui(13, 700, 18), { fontVariant: ["tabular-nums"] }]} rawColor={c.bg}>
          {`Undo ${left}s`}
        </Text>
      </Pressable>
    </View>
  );
}

/** Stamped: one big number, the stamp row, what is left, then back to scan on its own. */
export function StampedScreen({ view, program, onNext }: { view: SuccessView; program: CounterProgram; onNext: () => void }) {
  const { c } = useTheme();
  const stamps = program.earnType === "stamps" && program.stampGoal > 0 && view.balance != null;
  const goal = program.stampGoal;
  const n = view.balance ?? 0;
  return (
    <View accessible accessibilityLiveRegion="assertive" accessibilityLabel={view.announcement} style={{ alignItems: "center", gap: 10, paddingTop: 8 }}>
      <Avatar name={view.name ?? null} size={64} />
      <Text style={disp(24, 800, 30)} center>{view.name ?? "Customer"}</Text>
      <Text style={ui(13, 400, 18)} rawColor={c.fgMuted} center>
        {view.offline ? "Saved on this phone. It sends when you're back online." : view.visitsThisMonth ? visitThisMonth(view.visitsThisMonth) : " "}
      </Text>
      {stamps ? (
        <Text style={[disp(112, 800, 120), { fontVariant: ["tabular-nums"], marginTop: 8 }]} rawColor={c.accent} center>
          {view.count ? <CountUp value={Math.min(n, goal)} from={Math.min(view.count.from, goal)} variant="displayNumber" rawColor={c.accent} style={{ fontSize: 112, lineHeight: 120 }} /> : Math.min(n, goal)}
          <Text style={[disp(36, 800, 44)]} rawColor={c.fgSubtle}>{` / ${goal}`}</Text>
        </Text>
      ) : (
        <Text variant="displayNumber" rawColor={c.accent} center tabular numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 72, lineHeight: 80, marginTop: 8 }}>
          {view.hero}
        </Text>
      )}
      {stamps ? <StampRow goal={goal} filled={n} /> : null}
      {view.next ? <Text style={ui(15, 500, 20)} center>{view.next}</Text> : null}
      {view.messages.map((m) => (
        <Text key={m} variant="bodyStrong" color="accentText" center>{m}</Text>
      ))}
      <View style={{ alignSelf: "stretch", marginTop: 16, gap: 8 }}>
        <Button size="counter" onPress={onNext}>Next customer</Button>
        <Text style={ui(12, 400, 16)} rawColor={c.fgMuted} center>{`Returns to scan in ${AUTO_RETURN_SECONDS} seconds`}</Text>
      </View>
    </View>
  );
}

/** Goal reached: orange Redeem, or stamp on purpose and keep the reward. */
export function RewardReadyScreen({ member, program, busy, onRedeem, onStamp, onBack }: { member: staffApi.MemberSummaryDto; program: CounterProgram; busy: boolean; onRedeem: () => void; onStamp: () => void; onBack: () => void }) {
  const { c } = useTheme();
  const reward = member.rewardsAffordable[0] ?? null;
  const rewardName = reward?.name ?? member.nextReward?.name ?? "Free drink";
  const cost = reward?.pointsCost ?? program.stampGoal ?? member.balance;
  return (
    <View style={{ alignItems: "center", gap: 10, paddingTop: 8 }}>
      <Avatar name={member.name} size={64} />
      <Text style={disp(22, 800, 28)} center>{member.name ?? "Member"}</Text>
      <View style={[styles.readyPill, { backgroundColor: c.accentSoft }]}>
        <Text style={ui(13, 600, 17)} rawColor={c.accentText}>Reward ready</Text>
      </View>
      <Text style={[disp(54, 800, 56), { marginTop: 4 }]} center accessibilityRole="header">{rewardName}</Text>
      {program.earnType === "stamps" && program.stampGoal ? <StampRow goal={program.stampGoal} filled={program.stampGoal} /> : null}
      <Text style={ui(13, 400, 18)} rawColor={c.fgMuted} center>{carryOverLine(member.name, member.balance, cost, member.terminology)}</Text>
      <View style={{ alignSelf: "stretch", marginTop: 24, gap: 10 }}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onRedeem} style={({ pressed }) => [styles.redeem, { backgroundColor: c.accent, opacity: busy ? 0.6 : pressed ? 0.9 : 1 }]}>
          <Text style={ui(16, 600, 20)} rawColor={c.onAccent}>{`Redeem ${rewardInSentence(rewardName)}`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onStamp} style={({ pressed }) => [styles.stampInstead, { borderColor: c.line, backgroundColor: pressed ? c.bgSubtle : c.bg, opacity: busy ? 0.6 : 1 }]}>
          <Text style={ui(15, 500, 20)}>Stamp instead, keep the reward</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onBack} style={{ minHeight: 40, alignItems: "center", justifyContent: "center" }}>
          <Text style={ui(13, 500, 18)} rawColor={c.fgMuted}>Not them? Back to scan</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Footer under the keypad: "Online · 94 stamps today" and "Redeem a code". */
export function ScanFooter({ online, stampsToday, terminology, onCode }: { online: boolean; stampsToday: number | null; terminology: string; onCode: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.footer}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? c.positive : c.negative }} />
        <Text style={ui(13, 400, 18)} rawColor={c.fgMuted}>{`${online ? "Online" : "Offline"}${stampsToday != null ? ` · ${stampsToday} ${terminology} today` : ""}`}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onCode} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={ui(14, 600, 19)}>Redeem a code</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  finder: { minHeight: 250, borderRadius: 20, overflow: "hidden", justifyContent: "flex-end", paddingHorizontal: 24, paddingBottom: 24 },
  reticle: { position: "absolute", top: 24, alignSelf: "center", width: 150, height: 150, borderRadius: 28, borderWidth: 3, opacity: 0.9 },
  finderText: { alignItems: "center", marginTop: 180 },
  boxes: { flexDirection: "row", justifyContent: "center", gap: 10 },
  box: { height: 56, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pad: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  padKey: { width: "31.7%", height: 58, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stamps: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  match: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  pill: { minHeight: 40, paddingHorizontal: 20, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  toast: { minHeight: 44, borderRadius: 14, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  readyPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14 },
  redeem: { height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  stampInstead: { height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
