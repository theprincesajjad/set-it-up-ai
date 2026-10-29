"use client";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { PLANS, type appointmentsApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Panel, Segmented, SidePanel, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { useShopVertical } from "@/components/dashboard/useShopVertical";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { durationText } from "@/lib/booking";
import { addOnExamples, dollars, toCents } from "@/lib/dashboard/add-ons";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

type AddOn = appointmentsApi.AddOnDto;
type Service = appointmentsApi.ServiceDto;

/**
 * phase-pro P5 · Services page, second section: add-ons (nail art, removal, a French tip) with a price, extra minutes and the
 * services that offer them. A Free shop can set them up; the plan line says the booking page offers them on Pro.
 * Desktop: a table; phone: list rows with the services as chips.
 */
export function AddOnsEditor({ services, manager }: { services: Service[]; manager: boolean }) {
  const { api, base } = useMerchant();
  const { t, money } = useLocaleOrEnglish();
  const vertical = useShopVertical();
  const list = useApi(() => api.appointments.addOns(), [api]);
  const [edit, setEdit] = useState<AddOn | "new" | null>(null);
  const dur = (min: number) => durationText(t as never, min);
  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? "";
  const offered = list.data?.offered ?? true;

  const chips = (a: AddOn) =>
    a.offeredWith.length === 0 ? (
      <span className="text-fg-muted">{t("addon.allServices")}</span>
    ) : (
      <span className="flex min-w-0 flex-wrap gap-1">
        {a.offeredWith.map(nameOf).filter(Boolean).map((n) => (
          <Tag key={n}>{n}</Tag>
        ))}
      </span>
    );

  const columns: Column<AddOn>[] = [
    { key: "name", header: t("addon.col.name"), mobile: "title", sortValue: (a) => a.name.toLowerCase(), cell: (a) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-body text-fg">{a.name}</span>
        {!a.active ? <Tag>{t("addon.hidden")}</Tag> : null}
      </span>
    ) },
    { key: "time", header: t("addon.col.time"), mobile: "subtitle", sortValue: (a) => a.durationMin, cell: (a) => <span className="tabular text-fg-muted">{a.durationMin ? t("addon.plusTime", { duration: dur(a.durationMin) }) : t("addon.noTime")}</span> },
    { key: "offered", header: t("addon.col.offered"), mobile: "subtitle", cell: chips },
    { key: "price", header: t("addon.col.price"), align: "end", mobile: "trailing", sortValue: (a) => a.priceCents, cell: (a) => <span className="tabular">{t("addon.plusPrice", { price: money(a.priceCents) })}</span> },
  ];

  return (
    <Panel
      title={t("addon.section.title")}
      description={t("addon.section.sub")}
      action={manager ? <Button size="sm" variant="secondary" iconStart={Plus} onClick={() => setEdit("new")}>{t("addon.add")}</Button> : null}
    >
      <div className="flex flex-col gap-4" data-testid="add-ons">
        {!offered ? (
          <div data-testid="add-ons-plan-line">
          <PlanLine href={`${base}/billing?plan=plus`} linkLabel={t("promo.planCta", { plan: PLANS.plus.name })} className="text-meta">
            {t("addon.planLine", { examples: addOnExamples(t, vertical), plan: PLANS.plus.name })}
          </PlanLine>
          </div>
        ) : null}
        <DataTable
          caption={t("addon.section.title")}
          columns={columns}
          rows={list.data?.items ?? []}
          rowKey={(a) => a.id}
          loading={list.loading && !list.data}
          error={list.error}
          onRetry={list.reload}
          onRowClick={manager ? (a) => setEdit(a) : undefined}
          empty={<span className="text-fg-muted">{t("addon.empty", { examples: addOnExamples(t, vertical) })}</span>}
        />
      </div>
      {manager ? <AddOnPanel open={!!edit} addOn={edit && edit !== "new" ? edit : null} services={services} onClose={() => setEdit(null)} onSaved={list.reload} /> : null}
    </Panel>
  );
}

function AddOnPanel({ open, addOn, services, onClose, onSaved }: { open: boolean; addOn: AddOn | null; services: Service[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { api } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [minutes, setMinutes] = useState("0");
  const [scope, setScope] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [taxable, setTaxable] = useState(true);
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Load the chosen add-on (or blanks) each time the panel opens.
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(addOn?.name ?? "");
    setPrice(dollars(addOn?.priceCents ?? 0));
    setMinutes(String(addOn?.durationMin ?? 0));
    setScope(addOn?.offeredWith.length ? "pick" : "all");
    setPicked(addOn?.offeredWith ?? []);
    setActive(addOn?.active ?? true);
    setTaxable(addOn?.taxable ?? true);
    setTried(false);
    act.setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, addOn?.id]);

  const errs = {
    name: !name.trim() ? t("addon.edit.nameRequired") : undefined,
    price: price === "" || Number.isNaN(Number(price)) ? t("addon.edit.priceRequired") : undefined,
    minutes: Number(minutes) > 240 ? t("addon.edit.minutesMax") : undefined,
    picked: scope === "pick" && !picked.length ? t("addon.edit.pickNone") : undefined,
  };

  async function save() {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    const body = { name: name.trim(), priceCents: toCents(price), durationMin: Number(minutes || 0), active, taxable, offeredWith: scope === "all" ? [] : picked };
    const r = await act.run(() => (addOn ? api.appointments.updateAddOn(addOn.id, body) : api.appointments.createAddOn(body)));
    if (r) {
      toast({ message: t("addon.edit.saved"), tone: "success" });
      await onSaved();
      onClose();
    }
  }

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label={addOn ? t("addon.edit.title") : t("addon.edit.new")}
      title={addOn ? addOn.name : t("addon.edit.new")}
      subtitle={t("addon.edit.sub")}
      footer={
        <>
          {addOn ? <Button variant="ghost" onClick={() => setDel(true)} className="me-auto">{t("addon.edit.delete")}</Button> : null}
          <Button variant="secondary" onClick={onClose}>{t("addon.edit.cancel")}</Button>
          <Button loading={act.busy} onClick={save}>{t("addon.edit.save")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label={t("addon.col.name")} value={name} onChange={(e) => setName(e.target.value)} error={tried ? errs.name : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t("addon.col.price")} inputMode="decimal" prefix="$" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} error={tried ? errs.price : undefined} />
          <TextField label={t("addon.col.time")} inputMode="numeric" suffix={t("addon.edit.min")} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} error={tried ? errs.minutes : undefined} />
        </div>
        <p className="-mt-2 text-caption text-fg-muted">{t("addon.edit.minutesHint")}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-meta-strong text-fg">{t("addon.col.offered")}</legend>
          <Segmented label={t("addon.col.offered")} value={scope} onChange={setScope} options={[{ value: "all", label: t("addon.allServices") }, { value: "pick", label: t("addon.edit.pick") }]} />
          {scope === "pick" ? (
            <div role="group" aria-label={t("addon.edit.pick")} className="flex flex-wrap gap-2 pt-1">
              {services.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setPicked((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))} className="min-h-11 rounded-full border border-line px-4 text-body text-fg hover:bg-bg-subtle focus-visible:focus-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
                    <bdi>{s.name}</bdi>
                  </button>
                );
              })}
            </div>
          ) : null}
          {tried && errs.picked ? <p className="text-meta text-destructive-text">{errs.picked}</p> : null}
        </fieldset>
        <Switch label={t("addon.edit.taxable")} checked={taxable} onChange={setTaxable} />
        <Switch label={active ? t("addon.edit.active") : t("addon.hidden")} checked={active} onChange={setActive} />
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      </div>
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title={t("addon.edit.deleteTitle", { name: addOn?.name ?? "" })}
        body={t("addon.edit.deleteBody")}
        confirmLabel={t("addon.edit.delete")}
        danger
        onConfirm={async () => {
          if (!addOn) return;
          await api.appointments.deleteAddOn(addOn.id);
          toast({ message: t("addon.edit.deleted"), tone: "success" });
          await onSaved();
          onClose();
        }}
      />
    </SidePanel>
  );
}
