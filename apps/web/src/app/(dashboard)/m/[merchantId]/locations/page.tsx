"use client";
import { Copy, MapPin, Pencil, Plus, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { HoursEditor } from "@/components/dashboard/HoursEditor";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Locations & QR kit"
        description="Unlimited locations, always free. Each has its own counter QR."
        actions={
          <Button iconStart={Plus} onClick={() => setEdit({ name: "", address: "", city: "Toronto", postalCode: "", phone: null, hours: hoursDraft(null) })}>
            Add location
          </Button>
        }
      />
      <Async state={state}>
        {(d) => (
          <ul className="grid gap-4 lg:grid-cols-2">
            {d.items.map((l) => (
              <li key={l.id}>
                <Card padding="lg" className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 rounded-input bg-qr-bg p-2 ">
                      <QrCode value={l.joinUrl} size={96} label={`Join QR for ${l.name}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="flex flex-wrap items-center gap-2 text-title text-fg">
                        {l.name} {!l.active ? <Badge>Inactive</Badge> : null}
                      </h2>
                      <p className="flex items-start gap-1 text-meta text-fg-muted">
                        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                        {l.address}, {l.city}
                      </p>
                      <p className="text-meta text-fg-muted">{hoursSummary(l.hours)}</p>
                      {l.phone ? <p className="text-meta text-fg-muted">{formatE164(l.phone)}</p> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-input bg-bg-subtle px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-meta text-fg">{l.joinUrl.replace(/^https?:\/\//, "")}</span>
                    <IconButton icon={Copy} label="Copy join link" size={40} onClick={async () => {
                      await navigator.clipboard?.writeText(l.joinUrl).catch(() => undefined);
                      toast("Join link copied");
                    }} />
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button iconStart={Printer} href={`${base}/locations/kit?location=${l.id}`}>
                      Print QR kit
                    </Button>
                    <Button variant="secondary" iconStart={Pencil} onClick={() => setEdit({ id: l.id, name: l.name, address: l.address, city: l.city, postalCode: l.postalCode ?? "", phone: l.phone, hours: hoursDraft(l.hours) })}>
                      Edit
                    </Button>
                    <Button variant="ghost" iconStart={RefreshCw} onClick={() => setRotate(l)}>
                      New QR code
                    </Button>
                    {d.items.filter((x) => x.active).length > 1 && l.active ? (
                      <Button variant="ghost" onClick={() => setRemove(l)}>
                        Deactivate
                      </Button>
                    ) : null}
                  </div>
                </Card>
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
