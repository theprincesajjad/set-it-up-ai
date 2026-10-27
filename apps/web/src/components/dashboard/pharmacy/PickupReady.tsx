"use client";
import { useState } from "react";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Panel } from "@/components/dashboard/kit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { PhoneField } from "@/components/ui/PhoneField";
import { errorMessage } from "@/lib/api/errors";

/**
 * Pickup ready (pharmacy, docs/research/pharmacies-wellness.md frame 06): one fixed text, no free text, no medication, no name.
 * The customer asked for it at the counter (the tick), so it is a transactional notice, not marketing.
 */
export function PickupReady() {
  const { api, detail } = useMerchant();
  const [phone, setPhone] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function send() {
    if (!phone || !asked) return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const r = await api.pharmacy.pickupReady({ phone, customerAsked: true });
      setSent(r.sent ? `Sent to ${r.to}` : `Not sent to ${r.to}: they may have opted out of texts`);
      setAsked(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Pickup ready" description="Text a customer that their order is ready. The text is fixed.">
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]" data-testid="pickup-ready">
        <div className="flex flex-col gap-4">
          <PhoneField label="Mobile number" onChangeE164={setPhone} />
          <div className="rounded-input bg-bg-subtle p-3">
            <Checkbox checked={asked} onChange={setAsked} label="The customer asked for a text when their order is ready" caption="Saved as their consent for this one kind of text. It is not marketing." />
          </div>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          {sent ? <p role="status" className="text-meta text-fg-muted">{sent}</p> : null}
          <div>
            <Button onClick={send} loading={busy} disabled={!phone || !asked}>Send pickup text</Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-meta-strong text-fg">What the customer gets</p>
            <p className="mt-2 rounded-card bg-bg-subtle p-4 text-[14px] text-fg">{detail.merchant.name}: your order is ready for pickup. Reply STOP to opt out.</p>
            <p className="mt-1 text-meta text-fg-muted">In the customer&apos;s language: English, Hindi, Urdu or Punjabi.</p>
          </div>
          <div>
            <p className="text-meta-strong text-fg">The text never says</p>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-meta text-fg-muted">
              <li>What is in the order, or that it is a prescription</li>
              <li>The customer&apos;s name</li>
              <li>A price, a reward or an offer</li>
            </ul>
          </div>
        </div>
      </div>
    </Panel>
  );
}
