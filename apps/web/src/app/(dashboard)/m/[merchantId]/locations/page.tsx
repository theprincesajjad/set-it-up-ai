"use client";
import { Copy, Plus, Printer } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { HoursEditor } from "@/components/dashboard/HoursEditor";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Dot, PageHeader } from "@/components/dashboard/kit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { QrCode } from "@/components/ui/QrCode";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatE164 } from "@/lib/phone";
import { hoursDraft, hoursFromDraft, hoursSummary, type HoursDraft } from "@/lib/dashboard/hours";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Edit = { id?: string; name: string; address: string; city: string; postalCode: string; phone: string | null; hours: HoursDraft };

export default function LocationsPage() {
  const { api, base, refresh } = useMerchant();
  const toast = useToast();
  const state = useApi(() => api.locations(), [api]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [rotate, setRotate] = useState<merchantApi.Location | null>(null);
  const [remove, setRemove] = useState<merchantApi.Location | null>(null);
  const act = useAction();

  async function saveEdit() {
    if (!edit) return;
    if (!edit.name.trim() || edit.address.trim().length < 3) return act.setError("Add a name and street address.");
    const body = { name: edit.name.trim(), address: edit.address.trim(), city: edit.city.trim() || undefined, postalCode: edit.postalCode.trim() || null, phone: edit.phone, hours: hoursFromDraft(edit.hours) };
    const r = await act.run(() => (edit.id ? api.updateLocation(edit.id, body) : api.createLocation(body)));
    if (r) {
      setEdit(null);
      toast({ message: "Saved", tone: "success" });
      await state.reload();
      await refresh();
    }
  }

  return (
    <div>
      <PageHeader
        title="Locations & QR kit"
        description="Unlimited locations, always free. Each has its own counter QR."
        actions={
          <>
            <Button variant="secondary" size="sm" iconStart={Plus} onClick={() => setEdit({ name: "", address: "", city: "Toronto", postalCode: "", phone: null, hours: hoursDraft(null) })}>
              Add location
            </Button>
            {state.data?.items[0] ? (
              <Button size="sm" iconStart={Printer} href={`${base}/locations/kit?location=${state.data.items[0].id}`}>
                Print QR kit
              </Button>
            ) : null}
          </>
        }
      />
      <Async state={state}>
        {(d) => (
          <ul className="divide-y divide-line border-y border-line">
            {d.items.map((l) => (
              <li key={l.id}>
                <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
                  <div className="shrink-0 self-start rounded-input border border-line bg-qr-bg p-1.5">
                    <QrCode value={l.joinUrl} size={88} label={`Join QR for ${l.name}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="flex flex-wrap items-center gap-3 text-body-strong text-fg">
                      {l.name} {!l.active ? <Dot>Inactive</Dot> : null}
                    </h2>
                    <p className="text-meta text-fg-muted">
                      {l.address}, {l.city}
                    </p>
                    <p className="text-meta text-fg-muted">{hoursSummary(l.hours)}{l.phone ? ` · ${formatE164(l.phone)}` : ""}</p>
                    <div className="mt-3 flex max-w-[460px] items-center gap-2 rounded-input border border-line ps-3">
                      <span className="min-w-0 flex-1 truncate font-mono text-meta text-fg">{l.joinUrl.replace(/^https?:\/\//, "")}</span>
                      <button
                        type="button"
                        aria-label="Copy join link"
                        onClick={async () => {
                          await navigator.clipboard?.writeText(l.joinUrl).catch(() => undefined);
                          toast("Join link copied");
                        }}
                        className="inline-flex h-8 items-center gap-1.5 border-s border-line px-3 text-meta text-fg-muted hover:text-fg"
                      >
                        <Copy aria-hidden className="size-3.5" /> Copy
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {d.items.length > 1 ? (
                      <Button variant="secondary" size="sm" href={`${base}/locations/kit?location=${l.id}`}>
                        Print QR kit
                      </Button>
                    ) : null}
                    <Button variant="secondary" size="sm" onClick={() => setEdit({ id: l.id, name: l.name, address: l.address, city: l.city, postalCode: l.postalCode ?? "", phone: l.phone, hours: hoursDraft(l.hours) })}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRotate(l)}>
                      New QR code
                    </Button>
                    {d.items.filter((x) => x.active).length > 1 && l.active ? (
                      <Button variant="ghost" size="sm" onClick={() => setRemove(l)}>
                        Deactivate
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Async>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit location" : "Add location"}
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button loading={act.busy} onClick={saveEdit}>
              Save location
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="flex flex-col gap-4">
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Roncesvalles" />
            <TextField label="Street address" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} autoComplete="street-address" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="City" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
              <TextField label="Postal code" optionalLabel value={edit.postalCode} onChange={(e) => setEdit({ ...edit, postalCode: e.target.value.toUpperCase() })} />
            </div>
            <PhoneField key={edit.id ?? "new"} label="Phone" defaultValue={edit.phone?.replace(/^\+1/, "") ?? ""} onChangeE164={(p) => setEdit((x) => (x ? { ...x, phone: p } : x))} />
            <HoursEditor value={edit.hours} onChange={(h) => setEdit({ ...edit, hours: h })} />
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={!!rotate}
        onClose={() => setRotate(null)}
        title="Make a new QR code?"
        body="The old stand stops working right away. Print and put out the new one before you do this."
        confirmLabel="Make new code"
        danger
        onConfirm={async () => {
          await api.rotateQr(rotate!.id);
          await state.reload();
          toast("New QR code ready. Print it now.");
        }}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={`Deactivate ${remove?.name ?? "this location"}?`}
        body="Its QR stops working. Past visits stay in your reports."
        confirmLabel="Deactivate"
        danger
        onConfirm={async () => {
          await api.deleteLocation(remove!.id);
          await state.reload();
          await refresh();
        }}
      />
    </div>
  );
}
