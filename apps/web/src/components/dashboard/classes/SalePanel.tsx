"use client";
import { useState } from "react";
import type { classesApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/dashboard/calendar";
import { useAction } from "@/lib/dashboard/useApi";
import { useLocale } from "@/lib/i18n/client";

/** Sell a pack or an intro offer at the desk, paid by hand (cash, e-transfer or the card reader). Carries no platform fee. */
export function SalePanel({ open, onClose, packs, onSaved, who }: { open: boolean; onClose: () => void; packs: classesApi.ProductDto[]; onSaved: () => void | Promise<void>; /** Selling to the person at the door: no phone to type. */ who?: { memberCode: string; label: string } | null }) {
  const { api } = useMerchant();
  const { t } = useLocale();
  const toast = useToast();
  const act = useAction();
  const [productId, setProductId] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [method, setMethod] = useState("cash");
  const pid = productId || packs[0]?.id || "";
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={who ? t("counter.sale.sellTitle") : t("counter.sale.recordTitle")}
      subtitle={t("counter.sale.sub")}
      label={t("counter.sale.label")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("counter.cancel")}</Button>
          <Button
            loading={act.busy}
            disabled={!pid || (!who && phone.replace(/\D/g, "").length < 10)}
            onClick={async () => {
              const r = await act.run(() => api.classes.recordSale(who ? { productId: pid, memberCode: who.memberCode, method } : { productId: pid, phone, customerName: name.trim() || undefined, method }));
              if (r) {
                toast({ message: t("counter.sale.added", { product: r.name, who: who?.label ?? (name.trim() || t("counter.sale.theirCard")) }), tone: "success" });
                setPhone("");
                setName("");
                await onSaved();
                onClose();
              }
            }}
          >
            {t("counter.sale.record")}
          </Button>
        </div>
      }
    >
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="flex flex-col gap-4">
        <Select label={t("counter.sale.bought")} value={pid} onChange={(e) => setProductId(e.target.value)} options={packs.map((p) => ({ value: p.id, label: `${p.name}, ${money(p.priceCents)}` }))} />
        {who ? (
          <p className="rounded-input bg-bg-subtle px-3 py-2 text-body text-fg">{t("counter.sale.sellingTo", { who: who.label })}</p>
        ) : (
          <>
            <TextField label={t("counter.sale.phone")} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="416 555 0100" />
            <TextField label={t("counter.sale.name")} optionalLabel value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <Select label={t("counter.sale.paidBy")} value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: "cash", label: t("counter.sale.cash") }, { value: "etransfer", label: t("counter.sale.etransfer") }, { value: "card_reader", label: t("counter.sale.reader") }]} />
      </div>
    </SidePanel>
  );
}
