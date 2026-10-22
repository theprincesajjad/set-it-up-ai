import type { serviceApi } from "@ll/shared";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { formatMoney } from "../lib/award";
import { formatDate, formatShortDate, formatTime } from "../lib/format";
import { useTheme } from "../theme";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Card } from "./Card";
import { Checkbox } from "./Checkbox";
import { Phone } from "./icons";
import { Text } from "./Text";
import { TextField } from "./TextField";

const SIGNATURE_THRESHOLD_CENTS = 20_000;

/**
 * QuoteApproval card (system.md). Typed full-name signature when total >= $200,
 * otherwise an "I approve this quote" checkbox. The API always records a
 * signature name, so for small quotes we send the member's profile name.
 */
export function QuoteApproval({
  quote,
  title,
  ticketNumber,
  shopName,
  shopPhone,
  defaultName,
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
  onApprove: (signatureName: string) => void;
  onDecline: () => void;
  busy?: "approve" | "decline" | null;
  error?: string | null;
}) {
  const { c } = useTheme();
  const needsSignature = quote.totalCents >= SIGNATURE_THRESHOLD_CENTS;
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const signature = needsSignature ? name.trim() : (defaultName?.trim() || "Approved in app");
  const valid = needsSignature ? signature.length >= 2 : agree;
  const expired = quote.status === "expired";

  return (
    <Card inset>
      <Text variant="h3">{`Quote for ${title}`}</Text>
      <Text variant="caption" color="fgMuted">{`Ticket #${ticketNumber}`}</Text>
      <View style={{ marginTop: 12, gap: 6 }}>
        {quote.lineItems.map((li, i) => (
          <View key={i} style={styles.line}>
            <Text variant="bodySm" style={{ flex: 1 }}>
              {li.quantity > 1 ? `${li.description} × ${li.quantity}` : li.description}
            </Text>
            <Text variant="bodySm" tabular>
              {formatMoney(li.totalCents)}
            </Text>
          </View>
        ))}
        <View style={[styles.line, styles.rule, { borderTopColor: c.border }]}>
          <Text variant="bodySm" color="fgMuted" style={{ flex: 1 }}>
            Subtotal
          </Text>
          <Text variant="bodySm" tabular>
            {formatMoney(quote.subtotalCents)}
          </Text>
        </View>
        <View style={styles.line}>
          <Text variant="bodySm" color="fgMuted" style={{ flex: 1 }}>
            HST
          </Text>
          <Text variant="bodySm" tabular>
            {formatMoney(quote.taxCents)}
          </Text>
        </View>
        <View style={styles.line}>
          <Text variant="h3" style={{ flex: 1 }}>
            Total
          </Text>
          <Text variant="h3" tabular>
            {formatMoney(quote.totalCents)}
          </Text>
        </View>
        {quote.depositCents > 0 ? (
          <View style={[styles.line, styles.deposit, { backgroundColor: c.accentSubtle }]}>
            <Text variant="bodyStrong" rawColor={c.onAccentSubtle} style={{ flex: 1 }}>
              Deposit due on approval
            </Text>
            <Text variant="bodyStrong" rawColor={c.onAccentSubtle} tabular>
              {formatMoney(quote.depositCents)}
            </Text>
          </View>
        ) : null}
      </View>
      {quote.diagnosis ? (
        <View style={[styles.note, { borderLeftColor: c.border }]}>
          <Text variant="body">{quote.diagnosis}</Text>
        </View>
      ) : null}

      {quote.status === "approved" ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="success">{`Approved ${quote.respondedAt ? `${formatShortDate(quote.respondedAt)}, ${formatTime(quote.respondedAt)}` : ""}${quote.signatureName ? ` by ${quote.signatureName}` : ""}`}</Banner>
        </View>
      ) : quote.status === "declined" ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="neutral">{`You declined this quote. Changed your mind? Call ${shopName}.`}</Banner>
        </View>
      ) : expired ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="neutral">{`This quote expired on ${quote.expiresAt ? formatDate(quote.expiresAt) : "its end date"}. Ask ${shopName} for a new one.`}</Banner>
        </View>
      ) : quote.status === "superseded" ? (
        <View style={{ marginTop: 12 }}>
          <Banner variant="info">There's a newer quote for this repair.</Banner>
        </View>
      ) : quote.status === "sent" ? (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Text variant="caption" color="fgMuted">
            By approving you agree to the work above. Your approval is recorded with your name, time and device.
          </Text>
          {needsSignature ? (
            <TextField
              label="Type your name to sign"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              onBlur={() => setTouched(true)}
              error={touched && !valid ? "Type your full name to approve." : null}
            />
          ) : (
            <Checkbox checked={agree} onChange={setAgree} label="I approve this quote" />
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
            {quote.depositCents > 0 ? `Approve and pay ${formatMoney(quote.depositCents)} deposit` : "Approve quote"}
          </Button>
          <Button variant="secondary" fullWidth loading={busy === "decline"} onPress={onDecline}>
            Decline
          </Button>
          {shopPhone ? (
            <Button variant="ghost" iconStart={Phone} onPress={() => Linking.openURL(`tel:${shopPhone}`)}>
              {`Call ${shopName}`}
            </Button>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, marginTop: 4 },
  deposit: { paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8, marginTop: 4 },
  note: { borderLeftWidth: 3, paddingLeft: 12, marginTop: 12 },
});
