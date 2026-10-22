"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { EmptyState, Row, RowList, SidePanel as Sheet } from "@/components/dashboard/kit";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { FormGrid, Loader } from "../common";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };

export function RoutesTab({ gate }: { gate: Gate }) {
  const { api, role } = useMerchant();
  const state = useApi(() => api.tiffin.routes(), [api]);
  const [edit, setEdit] = useState<tiffinApi.RouteDto | "new" | null>(null);
  const canEdit = role === "owner" || role === "manager";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{canEdit ? <Button size="sm" iconStart={Plus} onClick={() => setEdit("new")}>New route</Button> : null}</div>
      <Loader state={state} gate={gate}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState
              title="No routes yet"
              description="A route is one driver's run. List the postal code prefixes it covers, like L4T or L5N, and new subscribers land on the right one."
              action={canEdit ? <Button size="sm" onClick={() => setEdit("new")}>Add your first route</Button> : undefined}
            />
          ) : (
            <RowList label="Delivery routes">
              {d.items.map((r) => (
                <Row
                  key={r.id}
                  title={r.name}
                  meta={`${r.areas.length ? r.areas.join(", ") : "No postal prefixes yet"}${r.driverName ? ` · ${r.driverName}` : ""}`}
                  trailing={`${r.stops} ${r.stops === 1 ? "stop" : "stops"}`}
                  onClick={canEdit ? () => setEdit(r) : undefined}
                />
              ))}
            </RowList>
          )
        }
      </Loader>
      {edit ? <RouteSheet route={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void state.reload(); }} /> : null}
    </div>
  );
}

function RouteSheet({ route, onClose, onSaved }: { route: tiffinApi.RouteDto | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState(route?.name ?? "");
  const [driver, setDriver] = useState(route?.driverName ?? "");
  const [phone, setPhone] = useState(route?.driverPhone ?? "");
  const [areas, setAreas] = useState((route?.areas ?? []).join(", "));
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    if (!name.trim()) return setNameErr("Give the route a name");
    setNameErr(null);
    const body: tiffinApi.CreateRouteBody = {
      name: name.trim(),
      driverName: driver.trim() || null,
      driverPhone: phone.trim() || null,
      areas: areas.split(/[\s,]+/).map((a) => a.trim().toUpperCase()).filter(Boolean),
    };
    const r = await act.run(() => (route ? api.tiffin.updateRoute(route.id, body) : api.tiffin.createRoute(body)));
    if (r) {
      toast({ message: route ? "Route saved" : "Route added", tone: "success" });
      onSaved();
    }
  };
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        label={route ? "Edit route" : "New route"}
        title={route ? route.name : "New route"}
        subtitle={route ? `${route.stops} ${route.stops === 1 ? "stop" : "stops"}` : "One driver, one run."}
        footer={
          <>
            {route ? <Button variant="ghost" className="me-auto" onClick={() => setConfirm(true)}>Delete</Button> : null}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={act.busy} onClick={() => void save()}>{route ? "Save route" : "Add route"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <TextField label="Route name" placeholder="Brampton north" value={name} onChange={(e) => setName(e.target.value)} error={nameErr} />
          <FormGrid>
            <TextField label="Driver" optionalLabel placeholder="Imran" value={driver} onChange={(e) => setDriver(e.target.value)} />
            <TextField label="Driver phone" optionalLabel type="tel" placeholder="(416) 555-0142" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormGrid>
          <TextField label="Postal code prefixes" placeholder="L6P, L6R, L6S" hint="The first three characters of the postal code, separated by commas. Auto-assign uses these." value={areas} onChange={(e) => setAreas(e.target.value)} />
        </div>
      </Sheet>
      {route ? (
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          danger
          title={`Delete ${route.name}?`}
          body={route.stops ? `${route.stops} subscribers will be taken off this route. You can auto-assign them to another one.` : "No subscribers are on this route."}
          confirmLabel="Delete route"
          onConfirm={async () => {
            await api.tiffin.deleteRoute(route.id);
            toast({ message: "Route deleted", tone: "success" });
            onSaved();
          }}
        />
      ) : null}
    </>
  );
}
