"use client";
/**
 * How you get paid: the shop-level settings tiffin, catering and banquet share. Methods (card, bank debit, Interac
 * e-transfer, cash) with the e-transfer email and words customers see, grace days and start-on-trust; GST/HST status;
 * food safety dates (optional, never blocks selling).
 */
import { useState } from "react";
import type { paymentsManualApi } from "@ll/shared";
import { PageHeader } from "@/components/dashboard";
import { Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { TaxStatus } from "@/components/dashboard/TaxStatus";
import { Loader, NumberField, todayISO } from "@/components/dashboard/restaurant/common";

export default function PaymentsSettingsPage() {
  const { role } = useMerchant();
  const owner = role === "owner";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="How you get paid" description="Choose how tiffin subscribers, caterers' customers and hall bookings can pay you. Payments you record by hand carry no platform fee." />
      {!owner ? <Banner tone="info">Only the shop owner can change these. You can see what is set.</Banner> : null}
      <div className="grid max-w-[880px] gap-6">
        <PaymentMethods owner={owner} />
        <TaxStatus owner={owner} />
        <FoodSafety owner={owner} />
      </div>
    </div>
  );
}

function PaymentMethods({ owner }: { owner: boolean }) {
  const { api } = useMerchant();
  const state = useApi(() => api.settings.payment(), [api]);
  return <Loader state={state} rows={4}>{(d) => <MethodsForm d={d} owner={owner} reload={() => void state.reload()} api={api} />}</Loader>;
}

function MethodsForm({ d, owner, reload, api }: { d: paymentsManualApi.PaymentSettingsDto; owner: boolean; reload: () => void; api: ReturnType<typeof useMerchant>["api"] }) {
  const toast = useToast();
  const act = useAction();
  const [s, setS] = useState<paymentsManualApi.PaymentSettingsDto>(d);
  const dirty = JSON.stringify(s) !== JSON.stringify(d);
  const emailBad = s.etransferEnabled && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.etransferEmail ?? "");
  const save = async () => {
    const r = await act.run(() => api.settings.savePayment({ etransferEnabled: s.etransferEnabled, etransferEmail: s.etransferEmail, instructions: s.instructions, cashEnabled: s.cashEnabled, graceDays: s.graceDays, startOnTrust: s.startOnTrust, cardEnabled: s.cardEnabled, padEnabled: s.padEnabled }));
    if (r) {
      toast({ message: "Payment settings saved", tone: "success" });
      reload();
    }
  };
  return (
    <Panel
      title="Ways customers can pay"
      description="Card and bank debit go through Stripe. E-transfer and cash are recorded by you when the money arrives."
      footer={owner ? <Button loading={act.busy} disabled={!dirty || emailBad} onClick={() => void save()}>Save</Button> : undefined}
    >
      {(
        <>
          {(
            <div className="flex flex-col gap-1">
              {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
              <Switch label="Card" description={s.stripeReady ? "Visa, Mastercard and Amex through your Stripe account." : "Needs a Stripe account. Connect one in Billing to turn this on."} checked={s.stripeReady && s.cardEnabled} disabled={!owner || !s.stripeReady} onChange={(v) => setS({ ...s, cardEnabled: v })} />
              <Switch label="Bank debit (PAD)" description={s.stripeReady ? "Pre-authorized debit from a Canadian bank account." : "Needs a Stripe account."} checked={s.stripeReady && s.padEnabled} disabled={!owner || !s.stripeReady} onChange={(v) => setS({ ...s, padEnabled: v })} />
              <Switch label="Interac e-transfer" description="Customers send money to your email and put a reference code in the message." checked={s.etransferEnabled} disabled={!owner} onChange={(v) => setS({ ...s, etransferEnabled: v })} />
              {s.etransferEnabled ? (
                <div className="ms-0 flex flex-col gap-3 border-s-2 border-line ps-4 sm:ms-2">
                  <TextField label="E-transfer email" type="email" value={s.etransferEmail ?? ""} readOnly={!owner} onChange={(e) => setS({ ...s, etransferEmail: e.target.value })} error={emailBad ? "Enter the email address your bank uses for e-transfers" : null} hint="Turn on auto-deposit with your bank so you don't need to answer a security question." />
                  <TextField label="Words customers see" type="textarea" optionalLabel readOnly={!owner} maxLength={500} showCount value={s.instructions ?? ""} onChange={(e) => setS({ ...s, instructions: e.target.value })} placeholder="Auto-deposit is on. Please put your reference code in the message." />
                </div>
              ) : null}
              <Switch label="Cash" description="Subscribers pay you in cash, for example at the first delivery." checked={s.cashEnabled} disabled={!owner} onChange={(v) => setS({ ...s, cashEnabled: v })} />
              {s.etransferEnabled || s.cashEnabled ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-line pt-4">
                  <p className="text-meta-strong text-fg">When money is late</p>
                  <div className="w-40"><NumberField label="Grace days" value={String(s.graceDays)} suffix="days" onChange={(v) => setS({ ...s, graceDays: Math.min(14, Number(v || 0)) })} hint="After this, meals go on hold (0 to 14)" disabled={!owner} /></div>
                  <Switch label="Start meals before the first payment" description="Off by default: a new e-transfer subscriber waits until you record their payment. Turn on to trust regulars for the grace days." checked={s.startOnTrust} disabled={!owner} onChange={(v) => setS({ ...s, startOnTrust: v })} />
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function FoodSafety({ owner }: { owner: boolean }) {
  const { api } = useMerchant();
  const state = useApi(() => api.settings.foodSafety(), [api]);
  return <Loader state={state} rows={3}>{(d) => <FoodForm x={d} owner={owner} reload={() => void state.reload()} api={api} />}</Loader>;
}

function FoodForm({ x, owner, reload, api }: { x: paymentsManualApi.FoodSafetyDto; owner: boolean; reload: () => void; api: ReturnType<typeof useMerchant>["api"] }) {
  const toast = useToast();
  const act = useAction();
  const [f, setF] = useState({ expiry: x.foodHandlerExpiry ?? "", unit: x.healthUnit ?? "", notified: x.healthUnitNotifiedOn ?? "", badge: x.foodHandlerBadge });
  const dirty = f.expiry !== (x.foodHandlerExpiry ?? "") || f.unit !== (x.healthUnit ?? "") || f.notified !== (x.healthUnitNotifiedOn ?? "") || f.badge !== x.foodHandlerBadge;
  return (
    <Panel
      title="Food safety"
      description="Your own reminders. We never block selling and never say a kitchen is approved. Peel no longer runs its own course: use a Ministry-approved food handler training provider."
      footer={owner ? <Button loading={act.busy} disabled={!dirty} onClick={async () => { const r = await act.run(() => api.settings.saveFoodSafety({ foodHandlerExpiry: f.expiry || null, healthUnit: f.unit.trim() || null, healthUnitNotifiedOn: f.notified || null, foodHandlerBadge: f.badge && !!f.expiry })); if (r) { toast({ message: "Food safety saved", tone: "success" }); reload(); } }}>Save</Button> : undefined}
    >
      {(
        <>
          {(
          <div className="flex flex-col gap-4">
            {x.daysToExpiry !== null && x.daysToExpiry <= 60 ? (
              <Banner tone="warning" title={x.daysToExpiry < 0 ? "Your food handler certificate has expired" : `Your food handler certificate expires in ${x.daysToExpiry} ${x.daysToExpiry === 1 ? "day" : "days"}`}>
                Renew it with a Ministry-approved provider. Selling is not affected.
              </Banner>
            ) : null}
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField type="date" label="Food handler certificate expires" optionalLabel value={f.expiry} min={todayISO().slice(0, 4) + "-01-01"} readOnly={!owner} onChange={(e) => setF({ ...f, expiry: e.target.value })} />
              <TextField label="Public health unit" optionalLabel placeholder="Peel, Toronto, or another" value={f.unit} readOnly={!owner} onChange={(e) => setF({ ...f, unit: e.target.value })} />
              <TextField type="date" label="Health unit notified on" optionalLabel value={f.notified} max={todayISO()} readOnly={!owner} onChange={(e) => setF({ ...f, notified: e.target.value })} />
            </div>
            <Switch label="Show a “Certified food handler” badge on my pages" description="Off by default. Only available when you have entered an expiry date. This is your own statement, not ours." checked={f.badge && !!f.expiry} disabled={!owner || !f.expiry} onChange={(v) => setF({ ...f, badge: v })} />
          </div>
          )}
        </>
      )}
    </Panel>
  );
}
