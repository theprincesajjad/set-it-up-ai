"use client";
/**
 * Step 6, "Create your account" (mobile, email, password, the terms), asked last once the owner has made their card. On phones a slim
 * summary of the card they are making sits on top (the desktop has the live card beside the form).
 */
import { Check, Circle, Eye, EyeOff, Gift } from "lucide-react";
import { useState, type ReactNode } from "react";
import { TRIAL_DAYS, unitWord, type Locale } from "@ll/shared";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { shopColorProps } from "@/lib/shopColor";
import { Banner } from "@/components/ui/Banner";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { cardFor, type SignupDraft, type StepErrors } from "./draft";
import { StepFrame } from "./Shell";

// ---------------------------------------------------------------------------
// 6. Create your account
// ---------------------------------------------------------------------------
export interface AccountStepProps {
  draft: SignupDraft;
  update: (patch: Partial<SignupDraft>) => void;
  registered: boolean;
  busy: boolean;
  banner: ReactNode;
  errors: StepErrors;
  onCreate: (password: string) => void;
  /** "By continuing you agree to the Terms and Privacy Policy." with links. */
  terms: ReactNode;
  /** The card's colour, for the summary chip (the same one the preview wears). */
  brandColor?: string | null;
}

export function AccountStep({ draft, update, registered, busy, banner, errors, onCreate, terms, brandColor }: AccountStepProps) {
  const { t, locale } = useLocaleOrEnglish();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const card = cardFor(draft.vertical, draft.card);
  const unit = unitWord(locale as Locale, card.terminology);
  const pwOk = password.length >= 8;
  const logo = draft.link === "read" ? (draft.accepted?.logoPreview ?? null) : null;
  return (
    <StepFrame
      id="account"
      title={registered ? t("sf.acct.titleSignedIn") : t("sf.acct.title")}
      body={registered ? t("sf.acct.bodySignedIn") : t("sf.acct.body")}
      onSubmit={() => onCreate(password)}
      primary={busy ? t("sf.acct.creating") : t("su.create")}
      busy={busy}
      note={
        <>
          {t("su.later")} {terms}
        </>
      }
    >
      {/* Phones: what they are making, in one line (desktop has the live card beside the form). */}
      <div {...shopColorProps({ vertical: draft.vertical || null, brandColor: brandColor ?? null })} className="flex items-center gap-3 rounded-r4 border border-border bg-card p-3 shadow-sm lg:hidden" data-account-summary>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full border border-border bg-card object-cover" />
        ) : (
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-trade text-[17px] font-[650] text-trade-foreground">
            {(draft.name.trim().charAt(0) || "?").toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-caption text-fg-muted">{t("sf.acct.making")}</span>
          <span className="block text-pretty break-words text-body font-[600] text-fg">
            <bdi>{draft.name}</bdi>
          </span>
          <span className="flex items-center gap-1.5 text-meta text-fg-muted">
            <Gift aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
            <span className="min-w-0 text-pretty">{t("sf.card.rule", { goal: card.goal, unit, reward: card.reward.trim() || t("sf.card.rewardBlank") })}</span>
          </span>
        </span>
      </div>
      {banner ? <Banner tone="warning">{banner}</Banner> : null}
      <PhoneField label={t("su.phone")} hint={t("su.phoneHint")} value={draft.phone} onChangeDigits={(d) => update({ phone: d })} error={errors.phone} />
      {!registered ? (
        <>
          <TextField name="email" label={t("su.email")} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={draft.email} onChange={(e) => update({ email: e.target.value })} error={errors.email} dir="ltr" />
          <div className="relative">
            <TextField
              name="password"
              label={t("su.password")}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              hint={
                <span className={cn("inline-flex items-center gap-1.5 transition-colors duration-200", pwOk && "text-positive-text")} data-pw-ok={pwOk || undefined}>
                  {pwOk ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <Circle aria-hidden className="size-3.5" strokeWidth={2} />}
                  {t("sf.acct.pwOk")}
                </span>
              } value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} error={errors.password} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? t("sf.acct.hide") : t("sf.acct.show")} className="absolute end-1 top-7.5 grid size-11 place-items-center rounded-r2 text-fg-muted hover:text-fg focus-visible:focus-ring">
              {show ? <EyeOff aria-hidden className="size-5" strokeWidth={1.75} /> : <Eye aria-hidden className="size-5" strokeWidth={1.75} />}
            </button>
          </div>
        </>
      ) : null}
      <p className="flex items-start gap-3 rounded-r4 border border-border bg-bg-subtle px-4 py-3 text-meta text-fg">
        <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-positive text-bg">
          <Check className="size-3" strokeWidth={3} />
        </span>
        {t("sf.acct.trial", { days: TRIAL_DAYS })}
      </p>
    </StepFrame>
  );
}

// "You're live" lives in ./LiveStep (loaded on demand). The type stays importable from here.
export type { NextStep } from "./LiveStep";
