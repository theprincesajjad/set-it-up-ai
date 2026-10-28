"use client";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ShopLogo } from "@/components/ui/ShopTile";
import { PaymentBox, pollUntil } from "./PaymentBox";

const TIPS = [0, 10, 15, 18] as const;
type TipChoice = (typeof TIPS)[number] | "custom";

/** /pay/split/<token>: a guest's share, tip picker, card payment and the paid state. */
export function SplitView({ token, initial }: { token: string; initial: restaurantApi.PublicSplitResponse }) {
  const { t, money, number: num } = useLocaleOrEnglish();
  const [data, setData] = useState(initial);
  const [choice, setChoice] = useState<TipChoice>(15);
  const [custom, setCustom] = useState("");
  const [payment, setPayment] = useState<restaurantApi.PaySplitResponse["payment"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = data.amountCents;
  const tipCents = choice === "custom" ? Math.min(100_000, Math.round((Number.parseFloat(custom.replace(/[^0-9.]/g, "")) || 0) * 100)) : Math.round((share * choice) / 100);
  const total = share + tipCents;
  const shop = data.merchant;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await browserApi.public.paySplit(token, tipCents);
      setData(r.split);
      setPayment(r.payment);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function paid() {
    await pollUntil(async () => {
      const fresh = await browserApi.public.split(token);
      setData(fresh);
      return fresh.status === "paid";
    });
    setPayment(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3 pt-2">
        <ShopLogo shop={{ name: shop.name, vertical: "restaurant", logoUrl: shop.logoUrl }} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-strong text-fg">{shop.name}</p>
          <p className="truncate text-meta text-fg-muted">
            {t("split.order", { n: num(data.orderNumber) })} · {data.label}
          </p>
        </div>
      </header>

      {data.status === "paid" ? (
        <Banner tone="success" title={t("split.paid")}>
          {t("split.paidBody", { shop: shop.name, label: data.label })}
        </Banner>
      ) : null}
      {data.status === "open" && !data.canPay ? <Banner tone="neutral">{t("split.closed", { shop: shop.name })}</Banner> : null}

      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">{data.status === "paid" ? t("split.paid") : t("split.title")}</p>
        <p className="display text-[48px] leading-none tabular-nums text-fg">{money(data.status === "paid" ? share + data.tipCents : share)}</p>
        {data.status === "paid" && data.tipCents > 0 ? <p className="text-meta text-fg-muted tabular-nums">{money(share)} + {money(data.tipCents)}</p> : null}
      </div>

      {data.lines.length ? (
        <section aria-label={t("split.items")} className="rounded-card border border-line px-4">
          <h2 className="pt-3 text-meta text-fg-muted">{t("split.items")}</h2>
          <ul>
            {data.lines.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0">
                <span>{l.name}</span>
                <span className="text-fg-muted tabular-nums">{l.quantity > 1 ? `× ${num(l.quantity)}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.status === "open" && data.canPay ? (
        <>
          {!payment ? (
            <section aria-label={t("split.tip")} className="flex flex-col gap-3">
              <h2 className="text-body-strong text-fg">{t("split.tip")}</h2>
              <div role="radiogroup" aria-label={t("split.tip")} className="grid grid-cols-5 gap-2">
                {([...TIPS, "custom"] as const).map((c) => {
                  const on = choice === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setChoice(c)}
                      className={cn("flex min-h-14 flex-col items-center justify-center rounded-card border px-1 text-center transition-colors focus-visible:focus-ring", on ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line bg-card text-fg hover:bg-bg-subtle")}
                    >
                      <span className="text-body-strong tabular-nums">{c === "custom" ? t("split.tipCustom") : c === 0 ? t("split.tipNone") : `${num(c)}%`}</span>
                      {typeof c === "number" && c > 0 ? <span className={cn("text-caption tabular-nums", on ? "text-trade-foreground/90 clear:text-primary-foreground/90" : "text-fg-muted")}>{money(Math.round((share * c) / 100))}</span> : null}
                    </button>
                  );
                })}
              </div>
              {choice === "custom" ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-meta text-fg-muted">{t("split.tipAmount")}</span>
                  <span className="relative flex items-center">
                    <span aria-hidden className="pointer-events-none absolute start-4 text-body text-fg-muted">$</span>
                    <input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" dir="ltr" className="h-12 w-full rounded-input border border-line bg-bg ps-8 pe-4 text-body tabular-nums text-start focus-visible:focus-ring" />
                  </span>
                </label>
              ) : null}
              <dl className="flex items-baseline justify-between border-t border-line pt-3">
                <dt className="text-body-strong text-fg">{t("split.total")}</dt>
                <dd className="text-title tabular-nums text-fg">{money(total)}</dd>
              </dl>
            </section>
          ) : null}

          {error ? <Banner tone="danger">{error}</Banner> : null}
          {payment ? (
            <div className="flex flex-col gap-3">
              <PaymentBox paymentIntentId={payment.paymentIntentId} clientSecret={payment.clientSecret} amountCents={payment.amountCents} label={t("split.pay", { amount: money(payment.amountCents) })} onPaid={paid} />
              <Button variant="ghost" onClick={() => setPayment(null)}>
                {t("rc.back")}
              </Button>
            </div>
          ) : (
            <Button size="lg" fullWidth loading={busy} onClick={start}>
              {t("split.pay", { amount: money(total) })}
            </Button>
          )}
        </>
      ) : null}

      <p className="text-center text-meta text-fg-muted">{t("split.secure")}</p>
    </div>
  );
}
