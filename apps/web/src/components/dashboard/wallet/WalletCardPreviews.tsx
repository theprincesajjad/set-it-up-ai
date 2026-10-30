"use client";
/**
 * Live previews of the shop card as Apple Wallet and Google Wallet lay it out, drawn from the same model the API builds the
 * pass from (walletApi.ShopPassModel), with the real stamp strip image from /v1/wallet/strip.png. docs/engineering/wallet.md.
 *
 * Apple storeCard: logo + logoText, header field on the right (Stamps 4 of 6), the strip, secondary fields (next reward,
 * member), auxiliary (next visit), the QR. Back: the back fields. Google loyalty: logo + issuer name, the member, the points
 * row, the QR, the hero image (the strip) at the bottom; text modules and links under the card.
 */
import { useState } from "react";
import { unitLabel, unitWord, type walletApi } from "@ll/shared";
import { QrCode } from "@/components/ui/QrCode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

type Model = walletApi.ShopPassModel;

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

export function stripUrl(m: Pick<Model, "kind" | "filled" | "goal" | "colors">, apiUrl = env.apiUrl): string {
  const q = new URLSearchParams({ k: m.kind, n: String(m.filled), g: String(m.goal), bg: m.colors.background.slice(1), fg: m.colors.foreground.slice(1) });
  return `${apiUrl}/v1/wallet/strip.png?${q.toString()}`;
}

function useLines(m: Model) {
  const { t, locale } = useLocaleOrEnglish();
  const unit = cap(unitWord(locale, m.terminology));
  const balance = m.kind === "stamps" ? t("sh.wcard.ofGoal", { n: m.filled, goal: m.goal }) : unitLabel(locale, m.terminology, m.balance);
  const reward = !m.nextReward ? t("sh.wcard.noReward") : m.nextReward.left <= 0 || (m.kind === "stamps" && m.filled >= m.goal) ? t("sh.wcard.ready", { reward: m.nextReward.name }) : t("sh.wcard.toGo", { reward: m.nextReward.name, n: m.nextReward.left });
  const visit = m.nextAppointment ? new Intl.DateTimeFormat(locale === "en" ? "en-CA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: m.timezone }).format(new Date(m.nextAppointment.startsAt)) : null;
  return { t, locale, unit, balance, reward, visit };
}

function Logo({ m, size, round }: { m: Model; size: number; round?: boolean }) {
  if (m.logoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.logoUrl} alt="" width={size} height={size} className={cn("shrink-0 object-contain", round ? "rounded-full bg-[#FFFFFF]" : "rounded-[4px]")} style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center font-semibold", round ? "rounded-full" : "rounded-[6px]")} style={{ width: size, height: size, background: m.colors.foreground, color: m.colors.background, fontSize: size * 0.42 }}>
      {m.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Field({ label, value, color, align = "start" }: { label: string; value: string; color: Model["colors"]; align?: "start" | "end" }) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-end")}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: color.label }}>
        {label}
      </p>
      <p className="truncate text-[15px] leading-tight" style={{ color: color.foreground }}>
        {value}
      </p>
    </div>
  );
}

/** Apple Wallet store card, front or back. */
export function AppleCardPreview({ m, side = "front" }: { m: Model; side?: "front" | "back" }) {
  const { t, locale, unit, balance, reward, visit } = useLines(m);
  const c = m.colors;
  if (side === "back")
    return (
      <div data-testid="apple-card-back" className="w-full max-w-[340px] overflow-hidden rounded-[14px] border border-line bg-bg shadow-sm">
        <dl className="divide-y divide-line text-[13px]">
          {[
            visit ? [t("sh.wcard.nextVisit"), m.nextAppointment!.label ? `${visit} · ${m.nextAppointment!.label}` : visit] : null,
            m.hours ? [t("sh.wcard.hours"), m.hours] : null,
            m.bookingUrl ? [t("sh.wcard.book"), m.bookingUrl] : null,
            m.place ? [t("sh.wcard.where"), m.place] : null,
            [t("sh.pass.howLabel"), t("sh.wcard.how", { shop: m.name, unit: unitWord(locale, m.terminology) })],
            m.terms ? [t("sh.pass.terms"), m.terms] : null,
            [t("sh.pass.codeLabel"), m.memberCode],
          ]
            .filter((x): x is string[] => !!x)
            .map(([k, v]) => (
              <div key={k} className="px-4 py-2.5">
                <dt className="text-meta text-fg-muted">{k}</dt>
                <dd className="whitespace-pre-line text-fg">{v}</dd>
              </div>
            ))}
        </dl>
      </div>
    );
  return (
    <div data-testid="apple-card" className="w-full max-w-[340px] overflow-hidden rounded-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.18)]" style={{ background: c.background, color: c.foreground }}>
      <div className="flex items-center justify-between gap-3 px-3.5 pb-2 pt-3">
        <span className="flex min-w-0 items-center gap-2">
          <Logo m={m} size={28} />
          <span className="truncate text-[15px] font-medium">{m.name}</span>
        </span>
        <Field label={unit} value={balance} color={c} align="end" />
      </div>
      {m.strip === "stamps" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stripUrl(m)} alt={`${unit}: ${balance}`} className="block aspect-[375/123] w-full" />
      ) : (
        <div className="px-3.5 pb-1 pt-2">
          <Field label={m.kind === "stamps" ? unit : t("sh.wcard.nextReward")} value={m.kind === "stamps" ? balance : reward} color={c} />
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-3 px-3.5 pt-2.5">
        <Field label={t("sh.wcard.nextReward")} value={reward} color={c} />
        <Field label={t("sh.wcard.member")} value={m.memberName ?? m.memberCode} color={c} align="end" />
      </div>
      {visit ? (
        <div className="px-3.5 pt-2">
          <Field label={t("sh.wcard.nextVisit")} value={visit} color={c} />
        </div>
      ) : null}
      <div className="flex justify-center px-3.5 pb-4 pt-4">
        <div className="flex flex-col items-center rounded-[8px] bg-[#FFFFFF] p-2.5 text-[#000000]">
          <QrCode value={m.qrValue} size={112} label={m.memberCode} />
          <span className="mt-1 text-[11px] tabular-nums">{m.memberCode}</span>
        </div>
      </div>
    </div>
  );
}

/** Google Wallet loyalty card (the card, then its details as the app lists them). */
export function GoogleCardPreview({ m }: { m: Model }) {
  const { t, unit, balance, reward, visit } = useLines(m);
  const c = m.colors;
  return (
    <div className="flex w-full max-w-[340px] flex-col gap-3">
      <div data-testid="google-card" className="overflow-hidden rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.18)]" style={{ background: c.background, color: c.foreground }}>
        <div className="flex items-center gap-2.5 px-4 pt-4">
          <Logo m={m} size={32} round />
          <span className="truncate text-[14px]">{m.name}</span>
        </div>
        <p className="px-4 pt-3 text-[20px] leading-tight">{cap(t("sh.wcard.description", { shop: "" }).trim())}</p>
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          <Field label={t("sh.wcard.member")} value={m.memberName ?? m.memberCode} color={{ ...c, label: c.foreground }} />
          <Field label={unit} value={balance} color={{ ...c, label: c.foreground }} align="end" />
        </div>
        <div className="flex justify-center px-4 pb-4 pt-4">
          <div className="flex flex-col items-center rounded-[12px] bg-[#FFFFFF] p-3 text-[#000000]">
            <QrCode value={m.qrValue} size={112} label={m.memberCode} />
            <span className="mt-1 text-[11px] tabular-nums">{m.memberCode}</span>
          </div>
        </div>
        {m.strip === "stamps" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={stripUrl(m)} alt={`${unit}: ${balance}`} className="block aspect-[375/123] w-full" />
        ) : null}
      </div>
      <dl className="divide-y divide-line rounded-[14px] border border-line bg-bg text-[13px]">
        {[[t("sh.wcard.nextReward"), reward], visit ? [t("sh.wcard.nextVisit"), m.nextAppointment!.label ? `${visit}\n${m.nextAppointment!.label}` : visit] : null, m.hours ? [t("sh.wcard.hours"), m.hours] : null, m.place ? [t("sh.wcard.where"), m.place] : null]
          .filter((x): x is string[] => !!x)
          .map(([k, v]) => (
            <div key={k} className="px-4 py-2.5">
              <dt className="text-meta text-fg-muted">{k}</dt>
              <dd className="whitespace-pre-line text-fg">{v}</dd>
            </div>
          ))}
        {m.bookingUrl ? (
          <div className="px-4 py-2.5">
            <dd className="text-fg underline">{t("sh.wcard.book")}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** Both previews side by side (stacked on a phone), with a front/back switch for Apple. */
export function WalletCardPreviews({ m }: { m: Model }) {
  const { t } = useLocaleOrEnglish();
  const [side, setSide] = useState<"front" | "back">("front");
  return (
    <div data-testid="wallet-card-previews" className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full max-w-[340px] items-center justify-between gap-2">
          <p className="text-body-strong text-fg">Apple Wallet</p> {/* l10n-ok: product name */}
          <SegmentedControl<"front" | "back"> size="sm" label="Apple Wallet" options={[{ value: "front", label: t("dw.wcard.front") }, { value: "back", label: t("dw.wcard.backShort") }]} value={side} onChange={setSide} />
        </div>
        <AppleCardPreview m={m} side={side} />
      </div>
      <div className="flex flex-col items-center gap-3">
        <p className="w-full max-w-[340px] text-body-strong text-fg">Google Wallet</p> {/* l10n-ok: product name */}
        <GoogleCardPreview m={m} />
      </div>
    </div>
  );
}
