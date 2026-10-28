"use client";
/**
 * Customer side of hand-paid money: the radio cards for "How will you pay?" (design M2), the info-blue box
 * that tells them exactly what to send, where, and which reference code to put in the message (M2, M3, C3),
 * with copy buttons. Money is sent by Interac e-transfer to the shop's own email; the shop records it when it lands.
 */
import { useState } from "react";
import type { paymentsManualApi, tiffinApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { copyText } from "@/components/dashboard/restaurant/common";
import { offeredMethods } from "@/lib/restaurant/tcb";
import { useFmt } from "./ui";

export { offeredMethods };

type Method = tiffinApi.TiffinPaymentMethod;

export function PayOptions({ shop, methods, value, onChange, etransfer, amountCents }: { shop: string; methods: Method[]; value: Method; onChange: (m: Method) => void; etransfer: { email: string; instructions: string } | null; amountCents: number }) {
  const { t, money } = useFmt();
  if (methods.length < 2 && !(methods.length === 1 && methods[0] !== "card")) return null;
  const copy: Record<Method, [string, string]> = {
    card: [t("tcb.pay.card"), t("tcb.pay.cardBody")],
    pad: [t("tcb.pay.pad"), t("tcb.pay.padBody")],
    etransfer: [t("tcb.pay.etransfer"), t("tcb.pay.etransferBody", { shop })],
    cash: [t("tcb.pay.cash"), t("tcb.pay.cashBody", { shop })],
  };
  return (
    <div role="radiogroup" aria-label={t("tcb.pay.title")} className="flex flex-col gap-3">
      <p className="text-meta-strong text-fg">{t("tcb.pay.title")}</p>
      {methods.map((m) => {
        const on = m === value;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m)}
            className={cn("flex w-full flex-col gap-1.5 rounded-card border p-4 text-start focus-visible:focus-ring", on ? "border-2 border-fg" : "border-line hover:bg-bg-subtle")}
          >
            <span className="flex items-center gap-3 text-body-strong text-fg">
              <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]", on ? "border-fg" : "border-line-strong")}>
                {on ? <span className="size-2.5 rounded-full bg-trade clear:bg-primary" /> : null}
              </span>
              {copy[m][0]}
            </span>
            <span className="ps-8 text-meta text-fg-muted">{copy[m][1]}</span>
            {on && m === "etransfer" && etransfer ? (
              <span className="ms-8 mt-1 block rounded-card bg-location/10 p-3 text-meta text-fg">
                <span className="block text-meta-strong">{t("tcb.pay.after")}</span>
                <span className="mt-1 block">{t("tcb.pay.sendTo", { amount: money(amountCents), email: etransfer.email })}</span>
                {etransfer.instructions ? <span className="mt-1 block text-fg-muted">{etransfer.instructions}</span> : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** What to send and where: the title, the sentence, the copy buttons. Used on My tiffin and right after subscribing. */
export function ManualDue({ manual, shop, method = "etransfer", dueOn, partial, className }: { manual: paymentsManualApi.ManualInstructions; shop: string; method?: Method; dueOn?: string | null; partial?: number; className?: string }) {
  const { t, money, date } = useFmt();
  const [copied, setCopied] = useState<"email" | "ref" | null>(null);
  const cash = method === "cash" || !manual.email;
  const doCopy = async (what: "email" | "ref") => {
    if (await copyText(what === "email" ? manual.email : manual.referenceCode)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    }
  };
  return (
    <section aria-label={t("tcb.due.title")} className={cn("flex flex-col gap-2 rounded-card bg-location/10 p-4", className)}>
      <p className="text-body-strong text-fg">{dueOn ? t("tcb.due.titleOn", { date: date(new Date(`${dueOn}T12:00:00Z`), { weekday: "short", month: "short", day: "numeric" }, "UTC") }) : t("tcb.due.title")}</p>
      <p className="text-meta text-fg-muted">
        {cash ? t("tcb.due.cash", { shop, amount: money(manual.amountCents), ref: manual.referenceCode }) : t("tcb.due.send", { amount: money(manual.amountCents), email: manual.email, ref: manual.referenceCode })}
      </p>
      {!cash && manual.instructions ? <p className="text-meta text-fg-muted">{manual.instructions}</p> : null}
      {partial ? <p className="text-meta text-fg-muted">{t("tcb.due.partial", { amount: money(partial) })}</p> : null}
      <div className="mt-1 flex flex-wrap gap-2">
        {!cash ? (
          <Button size="sm" variant="secondary" onClick={() => void doCopy("email")}>
            {copied === "email" ? t("tcb.due.copied") : t("tcb.due.copyEmail")}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => void doCopy("ref")}>
          {copied === "ref" ? t("tcb.due.copied") : t("tcb.due.copyRef")}
        </Button>
      </div>
    </section>
  );
}
