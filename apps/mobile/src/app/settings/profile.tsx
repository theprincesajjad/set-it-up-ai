import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { errorMessage, isApiError } from "../../api/client";
import { useProfile } from "../../features/customer/queries";
import { useLocale } from "../../lib/i18n";
import { displayPhone } from "../../lib/phone";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { View } from "react-native";
import { Banner, Button, ListRow, Screen, Text, TextField, useToast } from "../../ui";

/** 10.4 Edit profile. */
export default function EditProfile() {
  const { t, locale, date } = useLocale();
  const profile = useProfile();
  const { refreshMe } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [postal, setPostal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name ?? "");
      setEmail(profile.data.email ?? "");
      setPostal(profile.data.postalCode ?? "");
    }
  }, [profile.data]);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.me.updateProfile({ name: name.trim() || null, email: email.trim() || null, postalCode: postal.trim() || null });
      qc.setQueryData(qk.me, res);
      void refreshMe();
      toast({ tone: "success", message: t("cp.ok.saved") });
      router.back();
    } catch (e) {
      setError(isApiError(e) && e.status === 409 ? t("ms.profile.emailTaken") : errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen back title={t("ms.profile.edit")} footer={<Button fullWidth loading={saving} onPress={save}>{t("sh.priv.save")}</Button>}>
      <TextField label={t("sh.priv.name")} value={name} onChangeText={setName} autoComplete="name" autoCapitalize="words" />
      <TextField label={t("sh.priv.email")} optionalLabel hint={t("ms.profile.emailHint")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <TextField label={t("rc.tf.postal")} optionalLabel value={postal} onChangeText={setPostal} autoCapitalize="characters" placeholder="M6R 2K3" />
      {/* Read-only facts as rows, not grey prose (polish-audit M35). */}
      <View>
        {profile.data?.birthday ? <ListRow title={t("auth.m.name.birthday")} trailing={<Text color="fgMuted">{formatBirthday(profile.data.birthday, locale, date)}</Text>} /> : null}
        <ListRow title={t("ms.phone")} subtitle={t("ms.profile.phoneHint")} trailing={<Text color="fgMuted" tabular>{displayPhone(profile.data?.phone)}</Text>} divider={false} />
      </View>
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Screen>
  );
}

/** "11-26" (or a legacy "2000-11-26") → "November 26" (we never show or ask for the year). */
function formatBirthday(iso: string, locale: string, date: (d: Date, opts?: Intl.DateTimeFormatOptions, tz?: string) => string): string {
  const [m, d] = iso.slice(-5).split("-").map(Number);
  if (!m || !d) return iso;
  return locale === "en" ? new Date(2000, m - 1, d).toLocaleDateString("en-CA", { month: "long", day: "numeric" }) : date(new Date(2000, m - 1, d, 12), { month: "long", day: "numeric" });
}
