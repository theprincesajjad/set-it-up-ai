import type { MessageKey, serviceApi } from "@ll/shared";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useLocale } from "../lib/i18n";
import { disp, useTheme } from "../theme";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Card } from "./Card";
import { Checkbox } from "./Checkbox";
import { Phone } from "./icons";
import { Text } from "./Text";
import { TextField } from "./TextField";

const SIGNATURE_THRESHOLD_CENTS = 20_000;
const TZ = "America/Toronto";

/**
 * QuoteApproval card (Figma M3 repair, M4 bridal). Typed full-name signature when total >= $200, otherwise an "I approve
 * this quote" checkbox (the API always records a name, so small quotes send the member's profile name). Shows what we found,
 * credited fees, the 10% price cap, the shop's terms and the deposit, in the person's language.
 */
export function QuoteApproval({
  quote,
  title,
  ticketNumber,
  shopName,
  shopPhone,
  defaultName,
  event,
  taxLabel,
  terms,
  promisedAt,
  onApprove,
  onDecline,
  busy,
  error,
}: {
  quote: serviceApi.QuoteDto;
  title: string;
  ticketNumber: number;
  shopName: string;
  shopPhone?: string | null;
  defaultName?: string | null;
  /** Set for a bridal or other event quote: the day's facts replace "what we found" and the cap line. */
  event?: serviceApi.PublicQuoteResponse["event"];
  taxLabel?: string | null;
  terms?: string | null;
  promisedAt?: string | null;
  onApprove: (signatureName: string) => void;
  onDecline: () => void;
  busy?: "approve" | "decline" | null;
  error?: string | null;
}) {
  const { c } = useTheme();
  const { t, money, date, number } = useLocale();
  const needsSignature = quote.totalCents >= SIGNATURE_THRESHOLD_CENTS;
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const signature = needsSignature ? name.trim() : defaultName?.trim() || "Approved in app";
  const valid = needsSignature ? signature.length >= 2 : agree;
  const expired = quote.status === "expired";
  const pct = quote.totalCents > 0 && quote.depositCents > 0 ? Math.round((quote.depositCents / quote.totalCents) * 100) : 0;
  const stamp = (iso: string) => date(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, TZ);
  const day = (d: string) => date(new Date(`${d}T12:00:00Z`), { weekday: "short", month: "short", day: "numeric" }, "UTC");
  const a = quote.authorizedBy;
  const balance = Math.max(0, quote.totalCents - quote.depositCents);
  const eventWord = event ? t((["bridal", "wedding"].includes(event.type) ? `sv.q.type.${event.type}` : "sv.q.type.event") as MessageKey) : "";

  return (
    <Card inset>
      <Text style={disp(26, 800, 30)}>{event ? t("sv.q.titleEvent", { event: eventWord }) : t("sv.q.title")}</Text>
      <Text variant="caption" color="fgMuted">{event ? t("sv.q.kickerEvent", { n: ticketNumber }) : t("sv.q.kicker", { n: ticketNumber, item: title })}</Text>

      {event ? (
        <View style={{ marginTop: 12, gap: 6 }}>
          <Text variant="bodyStrong">{t("sv.q.eventHeading")}</Text>
          {quote.diagnosis ? <Text color="fgMuted">{quote.diagnosis}</Text> : null}
          {([[t("sv.q.eventDate"), event.date ? day(event.date) : null], [t("sv.q.eventStart"), event.start], [t("sv.q.eventWhere"), event.where], [t("sv.q.eventTrial"), event.trial]] as const)
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <View key={k} style={styles.line}>
                <Text variant="bodySm" color="fgMuted" style={{ flex: 1 }}>{k}</Text>
                <Text variant="bodySm" style={{ flexShrink: 1, textAlign: "right" }}>{v}</Text>
              </View>
            ))}
        </View>
      ) : quote.diagnosis ? (
        <View style={{ marginTop: 12, gap: 4 }}>
          <Text variant="bodyStrong">{t("sv.q.whatWeFound")}</Text>
          <Text color="fgMuted">{quote.diagnosis}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: 12, gap: 6 }}>
        {quote.lineItems.map((li, i) => {
          const credit = li.totalCents < 0;
          return (
            <View key={i} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text variant="bodySm" rawColor={credit ? c.positive : undefined}>{li.quantity > 1 ? `${li.description} × ${number(li.quantity)}` : li.description}</Text>
                {credit ? <Text variant="caption" rawColor={c.positive}>{t("sv.q.credited")}</Text> : null}
              </View>
              <Text variant="bodySm" tabular rawColor={credit ? c.positive : undefined}>{money(li.totalCents)}</Text>
            </View>
          );
        })}
        <View style={[styles.line, styles.rule, { borderTopColor: c.border }]}>
          <Text variant="bodySm" color="fgMuted" style={{ flex: 1 }}>{t("cart.subtotal")}</Text>
          <Text variant="bodySm" tabular>{money(quote.subtotalCents)}</Text>
        </View>
        {quote.taxCents > 0 ? (
          <View style={styles.line}>
            <Text variant="bodySm" color="fgMuted" style={{ flex: 1 }}>{taxLabel ?? "HST"}</Text>
            <Text variant="bodySm" tabular>{money(quote.taxCents)}</Text>
          </View>
        ) : null}
        <View style={styles.line}>
          <Text variant="h3" style={{ flex: 1 }}>{t("cart.total")}</Text>
          <Text variant="h3" tabular>{money(quote.totalCents)}</Text>
        </View>
        {quote.depositCents > 0 ? (
          <View style={[styles.deposit, { backgroundColor: c.accentSubtle }]}>
            <Text variant="caption" rawColor={c.onAccentSubtle}>{quote.depositPaidAt ? t("sv.q.depositPaid") : t(event ? "sv.q.depositHold" : "sv.q.depositNow", { pct: `${pct}%` })}</Text>
            <Text style={disp(30, 800, 34)} rawColor={c.onAccentSubtle} tabular>{money(quote.depositCents)}</Text>
            <Text variant="caption" rawColor={c.onAccentSubtle}>
              {event ? (event.balanceDueOn ? t("sv.q.balanceDate", { amount: money(balance), date: day(event.balanceDueOn) }) : t("sv.q.balanceOnly", { amount: money(balance) })) : t("sv.q.balancePickup", { amount: money(balance) })}
              {!event && promisedAt ? ` ${t("sv.q.readyBy", { date: date(promisedAt, { weekday: "short", month: "short", day: "numeric" }, TZ) })}` : ""}
            </Text>
          </View>
        ) : null}
      </View>

      <Text variant="caption" color="fgMuted" style={{ marginTop: 12 }}>{event ? t("sv.q.changes", { shop: shopName }) : t("sv.q.cap", { amount: money(quote.maxAuthorizedCents) })}</Text>
      {terms ? (
        <View style={{ marginTop: 10, gap: 2 }}>
          <Text variant="caption" color="fgMuted">{t("sv.q.terms", { shop: shopName })}</Text>
          <Text variant="caption" color="fgMuted">{terms}</Text>
        </View>
      ) : null}

      {quote.status === "approved" ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="success">{a?.method === "phone" ? t("sv.q.approvedPhone", { name: a.name, when: stamp(a.at) }) : t("sv.q.approvedBy", { when: quote.respondedAt ? stamp(quote.respondedAt) : "", name: quote.signatureName ?? "" })}</Banner>
        </View>
      ) : quote.status === "declined" ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="neutral">{`${t("sv.q.declinedTitle")} ${t("sv.q.declinedBody", { shop: shopName })}`}</Banner>
        </View>
      ) : expired ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="neutral">{t("sv.q.expired", { date: quote.expiresAt ? date(quote.expiresAt, { month: "short", day: "numeric" }, TZ) : "", shop: shopName })}</Banner>
        </View>
      ) : quote.status === "superseded" ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="info">{t("sv.q.superseded", { shop: shopName })}</Banner>
        </View>
      ) : quote.status === "sent" ? (
        <View style={{ marginTop: 16, gap: 12 }}>
          {needsSignature ? (
            <TextField
              label={t("rc.ca.signLabel")}
              hint={t("sv.q.signHelp")}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              onBlur={() => setTouched(true)}
              error={touched && !valid ? t("rc.ca.signShort") : null}
            />
          ) : (
            <Checkbox checked={agree} onChange={setAgree} label={t("sv.q.approve")} />
          )}
          {error ? <Banner variant="danger">{error}</Banner> : null}
          <Button
            fullWidth
            loading={busy === "approve"}
            onPress={() => {
              setTouched(true);
              if (valid) onApprove(signature);
            }}
          >
            {quote.depositCents > 0 ? t("sv.q.approvePay", { amount: money(quote.depositCents) }) : t("sv.q.approve")}
          </Button>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {shopPhone ? (
              <Button variant="secondary" style={{ flex: 1 }} iconStart={Phone} onPress={() => Linking.openURL(event ? `sms:${shopPhone}` : `tel:${shopPhone}`)}>
                {event ? t("sv.q.message", { shop: shopName }) : t("rc.callShop", { shop: shopName })}
              </Button>
            ) : null}
            <Button variant="secondary" style={{ flex: 1 }} loading={busy === "decline"} onPress={onDecline}>{t("sv.q.decline")}</Button>
          </View>
          {quote.expiresAt ? <Text variant="caption" color="fgMuted" style={{ textAlign: "center" }}>{`${t("sv.q.valid", { date: date(quote.expiresAt, { month: "short", day: "numeric" }, TZ) })} ${quote.depositCents > 0 ? t("sv.q.payMethods") : ""}`.trim()}</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, marginTop: 4 },
  deposit: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, marginTop: 8, gap: 2 },
});
