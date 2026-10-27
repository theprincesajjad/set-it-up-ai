"use client";
import { useEffect, useState } from "react";
import { classesApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

const KINDS = [
  { value: "membership", label: "Membership (billed every month)" },
  { value: "pack", label: "Class pack" },
  { value: "drop_in", label: "Drop-in (single class)" },
];
const TERMS = [
  { value: "", label: "Month to month" },
  ...[3, 6, 12].map((n) => ({ value: String(n), label: `${n}-month term` })),
];

/** Create or edit an offer. A pack can be an intro offer for new students. Ontario caps a term and a pack's validity at a year, so the form does too. */
export function OfferPanel({ open, onClose, offer, canMemberships, onSaved }: { open: boolean; onClose: () => void; offer: classesApi.ProductDto | null; canMemberships: boolean; onSaved: () => void | Promise<void> }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [kind, setKind] = useState<classesApi.ClassProductKind>("membership");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [credits, setCredits] = useState("10");
  const [days, setDays] = useState("90");
  const [intro, setIntro] = useState(false);
  const [term, setTerm] = useState("");
  const [perMonth, setPerMonth] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    // Load the offer (or a blank one) into the form each time the panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind(offer?.kind ?? (canMemberships ? "membership" : "pack"));
    setName(offer?.name ?? "");
    setPrice(offer ? String(offer.priceCents / 100) : "");
    setCredits(String(offer?.credits ?? 10));
    setDays(String(offer?.validDays ?? 90));
    setIntro(offer?.introOnly ?? false);
    setTerm(offer?.termMonths ? String(offer.termMonths) : "");
    setPerMonth(offer?.classesPerMonth ? String(offer.classesPerMonth) : "");
    setActive(offer?.active ?? true);
  }, [open, offer, canMemberships]);
  const valid = name.trim().length > 0 && price.trim() !== "" && Number(price) >= 0;
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={offer ? "Edit offer" : "New offer"}
      subtitle="Prices are before tax. HST is added at checkout if your shop is registered."
      label="Offer"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            disabled={!valid}
            onClick={async () => {
              const body: Record<string, unknown> = { name: name.trim(), priceCents: Math.round(Number(price) * 100), active };
              if (!offer) body.kind = kind;
              if (kind === "pack") Object.assign(body, { credits: Number(credits) || 1, validDays: Math.min(Number(days) || 90, classesApi.MAX_PACK_VALID_DAYS), introOnly: intro });
              if (kind === "membership") Object.assign(body, { termMonths: term ? Number(term) : null, classesPerMonth: perMonth ? Number(perMonth) : null });
              const r = await act.run(() => (offer ? api.classes.updateProduct(offer.id, body) : api.classes.createProduct(body)));
              if (r) {
                toast({ message: "Offer saved", tone: "success" });
                await onSaved();
                onClose();
              }
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="flex flex-col gap-4">
        <Select label="Type" value={kind} disabled={!!offer} onChange={(e) => setKind(e.target.value as classesApi.ClassProductKind)} options={KINDS.filter((k) => canMemberships || k.value !== "membership")} />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "membership" ? "Unlimited monthly" : kind === "pack" ? "10-class pack" : "Drop-in"} />
        <TextField label={kind === "membership" ? "Price each month" : "Price"} type="number" min={0} step="0.01" prefix="$" value={price} onChange={(e) => setPrice(e.target.value)} />
        {kind === "pack" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Classes included" type="number" min={1} max={200} value={credits} onChange={(e) => setCredits(e.target.value)} />
              <TextField label="Valid for (days)" type="number" min={1} max={classesApi.MAX_PACK_VALID_DAYS} value={days} onChange={(e) => setDays(e.target.value)} hint="At most 365." />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-body text-fg">Intro offer</p>
                <p className="text-meta text-fg-muted">Only for someone with no earlier pack, membership or class here.</p>
              </div>
              <SwitchControl checked={intro} onChange={setIntro} ariaLabel="Intro offer" />
            </div>
          </>
        ) : null}
        {kind === "membership" ? (
          <>
            <Select label="Contract" value={term} disabled={!!offer} onChange={(e) => setTerm(e.target.value)} options={TERMS} />
            <TextField label="Classes each month" optionalLabel type="number" min={1} max={60} value={perMonth} onChange={(e) => setPerMonth(e.target.value)} hint="Leave empty for unlimited." />
            <p className="rounded-input bg-bg-subtle px-3 py-2 text-meta text-fg-muted">
              {term ? "A fixed-term membership gets a renewal notice before it ends and only renews after one. The member can say no in the app." : "A month-to-month membership ends after the paid month when the member cancels."} Every member can cancel for a full refund in the first 10 days.
            </p>
          </>
        ) : null}
        {offer ? (
          <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
            <p className="text-body text-fg">On sale</p>
            <SwitchControl checked={active} onChange={setActive} ariaLabel="On sale" />
          </div>
        ) : null}
      </div>
    </SidePanel>
  );
}
