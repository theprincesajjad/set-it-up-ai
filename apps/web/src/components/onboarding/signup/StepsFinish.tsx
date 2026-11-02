"use client";
/**
 * Step 6, "Create your account" (mobile, email, password, the terms), asked last once the owner has made their card; and the
 * "You're live" moment: their card, the join QR and link, two or three next steps, then the dashboard.
 */
import { ArrowRight, Check, Copy, Eye, EyeOff, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TRIAL_DAYS } from "@ll/shared";
import type { Icon3dName } from "@ll/design-tokens";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClasses } from "@/components/ui/Button";
import { celebrate } from "@/components/ui/Celebrate";
import { Icon3d } from "@/components/ui/Icon3d";
import { PhoneField } from "@/components/ui/PhoneField";
import { QrCode } from "@/components/ui/QrCode";
import { TextField } from "@/components/ui/TextField";
import { CardPreview } from "./CardPreview";
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
}

export function AccountStep({ draft, update, registered, busy, banner, errors, onCreate, terms }: AccountStepProps) {
  const { t } = useLocaleOrEnglish();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
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
      {banner ? <Banner tone="warning">{banner}</Banner> : null}
      <PhoneField label={t("su.phone")} hint={t("su.phoneHint")} value={draft.phone} onChangeDigits={(d) => update({ phone: d })} error={errors.phone} />
      {!registered ? (
        <>
          <TextField name="email" label={t("su.email")} type="email" autoComplete="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} error={errors.email} dir="ltr" />
          <div className="relative">
            <TextField name="password" label={t("su.password")} type={show ? "text" : "password"} autoComplete="new-password" hint={t("su.passwordHint")} value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} error={errors.password} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? t("sf.acct.hide") : t("sf.acct.show")} className="absolute end-1 top-7.5 grid size-11 place-items-center rounded-r2 text-fg-muted hover:text-fg focus-visible:focus-ring">
              {show ? <EyeOff aria-hidden className="size-5" strokeWidth={1.75} /> : <Eye aria-hidden className="size-5" strokeWidth={1.75} />}
            </button>
          </div>
        </>
      ) : null}
      <p className="flex items-start gap-2 rounded-r4 bg-bg-subtle px-4 py-3 text-meta text-fg">
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" strokeWidth={2.5} />
        {t("sf.acct.trial", { days: TRIAL_DAYS })}
      </p>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------
// You're live
// ---------------------------------------------------------------------------
export interface NextStep {
  icon: Icon3dName;
  title: string;
  body: string;
  href: string;
}

export function LiveStep({ draft, nextSteps, primaryHref, primaryLabel, onLeave }: { draft: SignupDraft; nextSteps: NextStep[]; primaryHref: string; primaryLabel: string; onLeave: () => void }) {
  const { t } = useLocaleOrEnglish();
  const shop = draft.created!;
  const card = cardFor(shop.vertical, draft.card);
  const [copied, setCopied] = useState(false);
  // Rendered on the client only (the flow waits for the saved answers), so the browser can be asked directly.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const link = shop.joinUrl;
  // Kit (wave Q): one confetti burst from the check mark in the shop's colours (lazy canvas-confetti; nothing under reduced motion).
  const check = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => void celebrate({ origin: check.current }), 350);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col px-4 pb-36 pt-8 md:px-6 md:pb-16 md:pt-12" data-step="live">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <div className="flex flex-col animate-in fade-in-0 slide-in-from-bottom-3 duration-500 motion-reduce:animate-none">
          <span ref={check} aria-hidden className="grid size-14 place-items-center rounded-full bg-trade text-trade-foreground animate-in zoom-in-50 duration-500 motion-reduce:animate-none">
            <Check className="size-7" strokeWidth={3} />
          </span>
          <h1 tabIndex={-1} data-autofocus className="mt-5 text-balance text-[30px] font-[700] leading-9 tracking-[-0.02em] text-fg outline-none md:text-[40px] md:leading-11.5">
            {t("sf.live.title", { name: shop.name })}
          </h1>
          <p className="mt-3 text-[15px] leading-5.5 text-fg-muted">{t("sf.live.body", { days: TRIAL_DAYS })}</p>
          <div className="mt-8 lg:hidden">
            <CardPreview name={shop.name} vertical={shop.vertical} brandColor={shop.brandColor} logo={shop.logo} card={card} className="animate-in zoom-in-95 fade-in-0 duration-500 motion-reduce:animate-none" />
          </div>
          <h2 className="mt-10 text-headline text-fg">{t("sf.live.next")}</h2>
          <ol className="mt-3 flex flex-col divide-y divide-border overflow-hidden rounded-r4 border border-border bg-card" data-live-next>
            {nextSteps.map((s) => (
              <li key={s.href + s.title}>
                <Link href={s.href} onClick={onLeave} className="flex min-h-[72px] items-center gap-4 px-4 py-3 hover:bg-bg-subtle focus-visible:focus-ring">
                  <Icon3d name={s.icon} size={40} trade="inherit" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-[550] text-fg">{s.title}</span>
                    <span className="block text-meta text-fg-muted">{s.body}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-fg-muted rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ol>
          <div className="z-sticky mt-8 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:mt-0 max-md:border-t max-md:border-border max-md:bg-bg/95 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur-md" data-flow-footer>
            <Link href={primaryHref} onClick={onLeave} className={buttonClasses({ size: "lg", fullWidth: true })} data-live-primary>
              <span>{primaryLabel}</span>
              <ArrowRight aria-hidden className="size-[var(--icon)] shrink-0 rtl:rotate-180" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="hidden lg:block">
            <CardPreview name={shop.name} vertical={shop.vertical} brandColor={shop.brandColor} logo={shop.logo} card={card} className="animate-in zoom-in-95 fade-in-0 duration-500 motion-reduce:animate-none" />
          </div>
          {link ? (
            <section className="flex flex-col items-center gap-4 rounded-r4 border border-border bg-card p-5 text-center" aria-labelledby="live-qr" data-live-share>
              <h2 id="live-qr" className="text-body font-[550] text-fg">
                {t("sf.live.qr")}
              </h2>
              <div className="rounded-r3 bg-card p-3 ring-1 ring-border">
                <QrCode value={link} size={168} label={t("sf.live.qrLabel", { name: shop.name })} />
              </div>
              <p dir="ltr" className="max-w-full truncate text-meta text-fg-muted">
                <bdi>{link.replace(/^https?:\/\//, "")}</bdi>
              </p>
              <div className={cn("grid w-full gap-2", canShare ? "grid-cols-2" : "grid-cols-1")}>
                <Button
                  variant="secondary"
                  iconStart={copied ? Check : Copy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      // Clipboard blocked: the link is on screen to copy by hand.
                    }
                  }}
                >
                  {copied ? t("sf.live.copied") : t("sf.live.copy")}
                </Button>
                {canShare ? (
                  <Button variant="secondary" iconStart={Share2} onClick={() => navigator.share({ title: shop.name, url: link }).catch(() => undefined)}>
                    {t("sf.live.share")}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
