import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { useProfile } from "../../features/customer/queries";
import { displayPhone } from "../../lib/phone";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { View } from "react-native";
import { Banner, Button, ListRow, Screen, Text, TextField, useToast } from "../../ui";

/** 10.4 Edit profile. */
export default function EditProfile() {
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
      toast({ tone: "success", message: t("ok.saved") });
      router.back();
    } catch (e) {
      setError(isApiError(e) && e.status === 409 ? "That email is used by another account." : errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen back title="Edit profile" footer={<Button fullWidth loading={saving} onPress={save}>Save</Button>}>
      <TextField label="Name" value={name} onChangeText={setName} autoComplete="name" autoCapitalize="words" />
      <TextField label="Email" optionalLabel hint="For receipts and your data export." value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <TextField label="Postal code" optionalLabel value={postal} onChangeText={setPostal} autoCapitalize="characters" placeholder="M6R 2K3" />
      {/* Read-only facts as rows, not grey prose (polish-audit M35). */}
      <View>
        {profile.data?.birthday ? <ListRow title="Birthday" trailing={<Text color="fgMuted">{formatBirthday(profile.data.birthday)}</Text>} /> : null}
        <ListRow title="Phone" subtitle="To change your number, contact support." trailing={<Text color="fgMuted" tabular>{displayPhone(profile.data?.phone)}</Text>} divider={false} />
      </View>
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Screen>
  );
}

/** "2000-11-26" or "--11-26" → "November 26" (we never show or ask for the year). */
function formatBirthday(iso: string): string {
  const [m, d] = iso.slice(-5).split("-").map(Number);
  if (!m || !d) return iso;
  return new Date(2000, m - 1, d).toLocaleDateString("en-CA", { month: "long", day: "numeric" });
}
