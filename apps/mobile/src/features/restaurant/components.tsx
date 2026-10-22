/**
 * Small building blocks shared by the restaurant pack screens (tiffin, catering, banquet): a stepper row,
 * wrapped chip groups, dietary badges, an inline calendar, a live countdown and the "pay on the web" hand-off.
 * Everything is made of the existing kit (Chip, Badge, IconButton, Text) so the screens read like the rest of the app.
 */
import { spiceKey, type MessageKey } from "@ll/shared";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, View } from "react-native";
import { WEB_URL } from "../../config";
import { useLocale } from "../../lib/i18n";
import { addDays, dayToDate, dietBadges, paymentUrl, torontoToday, weekdayOf, type CountdownParts, type DietaryLike } from "../../lib/restaurant";
import { ui, useTheme } from "../../theme";
import { Badge, Chip, ChevronLeft, ChevronRight, IconButton, Minus, Plus, Text } from "../../ui";

/**
 * `money` for the app language. In right-to-left text the currency sign would jump to the wrong side of the digits
 * ("$54" shows as "54$"), so the amount is wrapped in a left-to-right isolate there.
 */
export function useMoney() {
  const { money, isRtl } = useLocale();
  return (cents: number): string => (isRtl ? `\u2066${money(cents)}\u2069` : money(cents));
}

/** One-letter weekday heads for hi / pa / en; Urdu has no usable narrow form in CLDR (it falls back to Latin letters), so it gets the short name. */
export function useWeekdayHead() {
  const { date, locale } = useLocale();
  return (dow: number): string => date(dayToDate(addDays("2026-11-01", dow)), { weekday: locale === "ur" ? "short" : "narrow" });
}

/** Re-renders every `ms` so countdowns tick. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "2 d 5 h" / "5 h 20 min" / "12 min" in the app language. */
export function useCountdownText() {
  const { t } = useLocale();
  return (p: CountdownParts): string => {
    switch (p.kind) {
      case "dh":
        return t("rest.dur.dh", { d: p.d, h: p.h });
      case "hm":
        return t("rest.dur.hm", { h: p.h, m: p.m });
      case "m":
        return t("rest.dur.m", { m: p.m });
      default:
        return "";
    }
  };
}

/** Label left, round minus / count / plus right (same controls as the cart). */
export function StepperRow({ label, hint, value, min = 1, max = 20, onChange, format }: { label: string; hint?: string; value: number; min?: number; max?: number; onChange: (n: number) => void; format?: (n: number) => string }) {
  const { number } = useLocale();
  return (
    <View style={styles.stepper}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="meta" color="fgMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      <IconButton icon={Minus} label={`${label} −`} variant="secondary" size={36} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <Text variant="bodyStrong" tabular style={{ minWidth: 28, textAlign: "center" }}>
        {format ? format(value) : number(value)}
      </Text>
      <IconButton icon={Plus} label={`${label} +`} variant="secondary" size={36} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

/** A caption over a wrapped group of chips (event type, service, start time). */
export function ChipGroup<T extends string | number>({ label, options, value, onChange, optionalLabel }: { label?: string; options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; optionalLabel?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text variant="metaStrong" color="fgMuted">
          {label}
          {optionalLabel ? (
            <Text variant="metaStrong" color="fgSubtle">{` (${optionalLabel})`}</Text>
          ) : null}
        </Text>
      ) : null}
      <View style={styles.wrap}>
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** The shop's own dietary claims as grey capsules (zabihah / halal, veg, spice). Never says more than the shop does. */
export function DietBadges({ dietary, style }: { dietary: DietaryLike; style?: object }) {
  const { t } = useLocale();
  const badges = dietBadges(dietary);
  const spice = dietary?.spice;
  if (badges.length === 0 && spice === undefined) return null;
  const key = (b: (typeof badges)[number]): MessageKey => `diet.${b}`;
  return (
    <View style={[styles.wrap, { gap: 6 }, style]}>
      {badges.map((b) => (
        <Badge key={b}>{t(key(b))}</Badge>
      ))}
      {spice !== undefined && spice > 0 ? <Badge>{t(spiceKey(spice))}</Badge> : null}
    </View>
  );
}

/** Opens the web pay page for a PaymentIntent, and runs `onReturn` when the app comes back to the foreground. */
export function usePayment(onReturn: () => void) {
  const waiting = useRef(false);
  const cb = useRef(onReturn);
  cb.current = onReturn;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && waiting.current) {
        waiting.current = false;
        cb.current();
      }
    });
    return () => sub.remove();
  }, []);
  return async (payment: { paymentIntentId: string; clientSecret: string | null }) => {
    if (!payment.clientSecret) return false;
    waiting.current = true;
    try {
      await Linking.openURL(paymentUrl(WEB_URL, { paymentIntentId: payment.paymentIntentId, clientSecret: payment.clientSecret }));
      return true;
    } catch {
      waiting.current = false;
      return false;
    }
  };
}

// ---------------------------------------------------------------------------
// Inline calendar
// ---------------------------------------------------------------------------
const CELL = 40;

/** Month grid: tap a day. Days outside min/max or `isDisabled` are greyed; `busy` days get a small dot. Week starts on Sunday. */
export function CalendarGrid({ value, onChange, min, max, isDisabled, busy }: { value: string | null; onChange: (day: string) => void; min?: string; max?: string; isDisabled?: (day: string) => boolean; busy?: (day: string) => boolean }) {
  const { c } = useTheme();
  const { date, t } = useLocale();
  const today = torontoToday();
  const start = value ?? min ?? today;
  const [month, setMonth] = useState(start.slice(0, 7));
  const first = `${month}-01`;
  const lead = weekdayOf(first);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const off = (day: string) => (min !== undefined && day < min) || (max !== undefined && day > max) || !!isDisabled?.(day);
  const canPrev = min === undefined || `${month}-01` > min;
  const canNext = max === undefined || addDays(`${month}-01`, count) <= max;
  // Sunday-first weekday initials in the app language (2026-11-01 is a Sunday).
  const head = useWeekdayHead();
  const heads = Array.from({ length: 7 }, (_, i) => head(i));
  return (
    <View accessibilityLabel={t("rest.cal.label")} style={[styles.cal, { borderColor: c.line }]}>
      <View style={styles.calHead}>
        <IconButton icon={ChevronLeft} label={t("rest.cal.prev")} variant="ghost" size={36} disabled={!canPrev} onPress={() => shift(-1)} />
        <Text variant="bodyStrong" accessibilityRole="header" style={{ flex: 1, textAlign: "center" }}>
          {date(dayToDate(first), { month: "long", year: "numeric" })}
        </Text>
        <IconButton icon={ChevronRight} label={t("rest.cal.next")} variant="ghost" size={36} disabled={!canNext} onPress={() => shift(1)} />
      </View>
      <View style={styles.week}>
        {heads.map((h, i) => (
          <Text key={i} variant="caption" color="fgSubtle" center numberOfLines={1} style={{ width: CELL, fontSize: h.length > 2 ? 9 : 11 }}>
            {h}
          </Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.week}>
          {w.map((day, di) => {
            if (!day) return <View key={di} style={{ width: CELL, height: CELL }} />;
            const selected = day === value;
            const disabled = off(day);
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={`${date(dayToDate(day), { weekday: "long", day: "numeric", month: "long" })}${busy?.(day) ? `, ${t("rest.cal.busy")}` : ""}`}
                disabled={disabled}
                onPress={() => onChange(day)}
                style={[styles.day, selected ? { backgroundColor: c.fg } : null]}
              >
                <Text style={ui(15, selected ? 600 : 400, 20)} rawColor={selected ? c.bg : disabled ? c.fgSubtle : c.fg} tabular>
                  {String(Number(day.slice(8)))}
                </Text>
                {busy?.(day) ? <View style={[styles.dot, { backgroundColor: selected ? c.bg : c.fgMuted }]} /> : day === today && !selected ? <View style={[styles.dot, { backgroundColor: c.line }]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A TextField-looking date row; tapping it unfolds the calendar underneath (no nested sheet). */
export function DateField({ label, value, onChange, min, max, isDisabled, busy, hint, placeholder }: { label: string; value: string | null; onChange: (day: string) => void; min?: string; max?: string; isDisabled?: (day: string) => boolean; busy?: (day: string) => boolean; hint?: string | null; placeholder?: string }) {
  const { c } = useTheme();
  const { date } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="metaStrong" color="fgMuted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${value ? `, ${date(dayToDate(value), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : ""}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, { borderColor: open ? c.fg : c.lineStrong, borderWidth: open ? 2 : 1, backgroundColor: c.bg }]}
      >
        <Text variant="body" color={value ? "fg" : "fgSubtle"} style={{ flex: 1 }}>
          {value ? date(dayToDate(value), { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : (placeholder ?? "")}
        </Text>
        <ChevronRight size={18} color={c.fgSubtle} strokeWidth={2} style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }} />
      </Pressable>
      {hint && !open ? (
        <Text variant="meta" color="fgMuted">
          {hint}
        </Text>
      ) : null}
      {open ? (
        <CalendarGrid
          value={value}
          min={min}
          max={max}
          isDisabled={isDisabled}
          busy={busy}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** Label left in grey, value right: the quiet two-column rows of an order summary. */
export function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.info}>
      <Text variant={strong ? "bodyStrong" : "body"} color={strong ? "fg" : "fgMuted"} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant={strong ? "bodyStrong" : "body"} tabular style={{ flexShrink: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cal: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 8, paddingBottom: 8, alignSelf: "stretch", alignItems: "center" },
  calHead: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", paddingVertical: 4 },
  week: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", paddingHorizontal: 4 },
  day: { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2 },
  field: { minHeight: 48, borderRadius: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  dow: { flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  info: { flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 4 },
});

/** "Mon to Fri", "Every day", or a short list ("Tue, Thu, Sat") in the app language. */
export function useDaysLabel() {
  const { t, date } = useLocale();
  const name = (dow: number) => date(dayToDate(addDays("2026-11-01", dow)), { weekday: "short" });
  return (days: number[]): string => {
    const d = [...new Set(days)].sort((a, b) => a - b);
    if (d.length === 7) return t("rest.tiffin.everyDay");
    const run = d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
    if (run) return t("rest.range", { from: name(d[0]!), to: name(d[d.length - 1]!) });
    return d.map(name).join(", ");
  };
}

/** Seven weekday marks: on = a day the plan runs. */
export function WeekdayDots({ days }: { days: number[] }) {
  const { c } = useTheme();
  const { date } = useLocale();
  const head = useWeekdayHead();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: 7 }, (_, dow) => {
        const on = days.includes(dow);
        const h = head(dow);
        return (
          <View key={dow} accessible accessibilityLabel={date(dayToDate(addDays("2026-11-01", dow)), { weekday: "long" })} accessibilityState={{ selected: on }} style={[styles.dow, { backgroundColor: on ? c.fg : c.bgSubtle }]}>
            <Text style={ui(h.length > 2 ? 11 : 13, 600, 17)} rawColor={on ? c.bg : c.fgSubtle} numberOfLines={1}>
              {h}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Status as a dot + word (Badge), one tone map for subscriptions, events and bookings. */
export function StatusBadge({ tone, children }: { tone: "success" | "danger" | "warning" | "neutral" | "info"; children: string }) {
  return <Badge tone={tone}>{children}</Badge>;
}

export type Tone = "success" | "danger" | "warning" | "neutral" | "info";
export const subTone = (s: string): Tone => (s === "active" ? "success" : s === "past_due" ? "danger" : s === "pending" ? "warning" : s === "paused" ? "info" : "neutral");
