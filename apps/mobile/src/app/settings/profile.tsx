import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, View, type TextInputInstance } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { SUPPORT_EMAIL } from "../../config";
import { BirthdayField } from "../../features/customer/BirthdayField";
import { useProfile } from "../../features/customer/queries";
import { emailOtpStartBodySafe } from "../../features/staffAuth";
import { birthdayValue, parseBirthday, type Birthday } from "../../lib/birthday";
import { fieldErrors } from "../../lib/fieldErrors";
import { useLocale } from "../../lib/i18n";
import { displayPhone } from "../../lib/phone";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { Banner, Button, ListRow, Screen, Text, TextField, useToast } from "../../ui";

type Field = "name" | "email" | "postalCode" | "birthday";

/** 10.4 Edit profile. */
export default function EditProfile() {
  const { t, ltr, locale } = useLocale();
  const profile = useProfile();
  const { refreshMe } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [postal, setPostal] = useState("");
  const [birthday, setBirthday] = useState<Birthday>({ month: null, day: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const nameRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const postalRef = useRef<TextInputInstance>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name ?? "");
      setEmail(profile.data.email ?? "");
      setPostal(profile.data.postalCode ?? "");
      setBirthday(parseBirthday(profile.data.birthday));
    }
  }, [profile.data]);

  /** Name each bad field, say how to fix it, and focus the first one. */
  const reject = (next: Partial<Record<Field, string>>) => {
    setErrors(next);
    if (next.name) nameRef.current?.focus();
    else if (next.email) emailRef.current?.focus();
    else if (next.postalCode) postalRef.current?.focus();
  };

  const save = async () => {
    if (inFlight.current) return;
    const local: Partial<Record<Field, string>> = {};
    // The name is how staff greet the member: it cannot be saved empty.
    if (!name.trim()) local.name = t("auth.err.required", { field: t("sh.priv.name") });
    if (email.trim() && !emailOtpStartBodySafe(email)) local.email = t("mf.field.email");
    if (Object.keys(local).length) return reject(local);
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setErrors({});
    try {
      const bd = birthdayValue(birthday);
      const was = profile.data;
      // Only what changed: an old value the server would no longer accept (a postal code saved before the rule) must not block a new name.
      const res = await api.me.updateProfile({
        ...(name.trim() !== (was?.name ?? "") ? { name: name.trim() } : {}),
        ...(email.trim() !== (was?.email ?? "") ? { email: email.trim() || null } : {}),
        ...(postal.trim() !== (was?.postalCode ?? "") ? { postalCode: postal.trim() || null } : {}),
        ...(bd && bd !== (was?.birthday ? birthdayValue(parseBirthday(was.birthday)) : undefined) ? { birthday: bd } : {}),
      });
      qc.setQueryData(qk.me, res);
      void refreshMe();
      toast({ tone: "success", message: t("cp.ok.saved") });
      // Opened cold (a reload, a link) there is nothing to go back to: land on the profile page.
      if (router.canGoBack()) router.back();
      else router.replace("/you");
    } catch (e) {
      const fe = fieldErrors(e, t, locale) as Partial<Record<Field, string>>;
      if (isApiError(e) && e.status === 409) reject({ email: t("ms.profile.emailTaken") });
      else if (fe.name || fe.email || fe.postalCode || fe.birthday) reject({ name: fe.name, email: fe.email, postalCode: fe.postalCode, birthday: fe.birthday });
      else setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  const mailSupport = SUPPORT_EMAIL ? () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`) : undefined;
  return (
    <Screen back title={t("ms.profile.edit")} footer={<Button fullWidth loading={saving} onPress={save}>{t("sh.priv.save")}</Button>}>
      <TextField ref={nameRef} label={t("sh.priv.name")} value={name} onChangeText={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} autoComplete="name" autoCapitalize="words" error={errors.name} />
      <TextField ref={emailRef} label={t("sh.priv.email")} optionalLabel hint={t("ms.profile.emailHint")} value={email} onChangeText={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} />
      <TextField ref={postalRef} label={t("rc.tf.postal")} optionalLabel value={postal} onChangeText={(v) => { setPostal(v); setErrors((x) => ({ ...x, postalCode: undefined })); }} autoCapitalize="characters" placeholder="M6R 2K3" error={errors.postalCode} />
      <BirthdayField value={birthday} onChange={(b) => { setBirthday(b); setErrors((x) => ({ ...x, birthday: undefined })); }} error={errors.birthday} />
      {/* The number is the member's login and how shops find the card: changing it goes through support. */}
      <View>
        <ListRow title={t("ms.phone")} subtitle={mailSupport ? t("ms.profile.phoneHint") : undefined} trailing={<Text color="fgMuted" tabular>{ltr(displayPhone(profile.data?.phone))}</Text>} chevron={!!mailSupport} onPress={mailSupport} divider={false} />
      </View>
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Screen>
  );
}
