"use client";
import { PageHeader, Panel } from "@/components/dashboard/kit";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { commerceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Draft = { id?: string; name: string; price: string; description: string; categoryId: string; modifiers: string };

/** Menu & catalog editor (orders.order_ahead). Modifiers as "Size: Small 0, Large 0.75" lines. */
export default function CatalogPage() {
  return (
    <FeatureGate keys={["orders.order_ahead"]} title="Order-ahead menu">
      <Catalog />
    </FeatureGate>
  );
}

function parseModifiers(text: string): commerceApi.ModifierGroupDto[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, opts = ""] = l.split(":");
    return { name: name!.trim(), options: opts.split(",").map((o) => o.trim()).filter(Boolean).map((o) => {
      const m = o.match(/^(.*?)(?:\s+([\d.]+))?$/);
      return { name: (m?.[1] ?? o).trim(), priceCents: Math.round(Number.parseFloat(m?.[2] ?? "0") * 100) };
    }) };
  }).filter((g) => g.name && g.options.length);
}

function Catalog() {
  const { api } = useMerchant();
  const state = useApi(() => api.catalog(), [api]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [newCat, setNewCat] = useState("");
  const act = useAction();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Menu & catalog" description="What customers can order ahead. Prices are always set here, never by the app." actions={<Button size="sm" iconStart={Plus} onClick={() => setEdit({ name: "", price: "", description: "", categoryId: "", modifiers: "" })}>Add item</Button>} />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Async state={state}>
        {(c) => (
          <>
            {[...c.categories, { id: "", name: "No category", earnEligible: true, discountEligible: true }].map((cat) => {
              const items = c.items.filter((i) => (i.categoryId ?? "") === cat.id);
              if (!items.length && !cat.id) return null;
              return (
                <Panel key={cat.id || "none"}>
                  <h2 className="flex items-center gap-2 text-body-strong text-fg">
                    {cat.name} {!cat.earnEligible ? <Badge>Doesn&apos;t earn</Badge> : null}
                  </h2>
                  <ul className="mt-2 divide-y divide-line">
                    {items.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-body-strong text-fg">{i.name}</p>
                          <p className="text-meta text-fg-muted">{formatMoney(i.priceCents)}{i.modifiers.length ? ` · ${i.modifiers.map((m) => m.name).join(", ")}` : ""}</p>
                        </div>
                        <div className="w-40">
                          <Switch label="Orderable" checked={i.orderable && i.available} onChange={async (v) => {
                            await act.run(() => api.updateItem(i.id, { orderable: v, available: v }));
                            await state.reload();
                          }} />
                        </div>
                        <IconButton icon={Pencil} label={`Edit ${i.name}`} onClick={() => setEdit({ id: i.id, name: i.name, price: (i.priceCents / 100).toFixed(2), description: i.description ?? "", categoryId: i.categoryId ?? "", modifiers: i.modifiers.map((m) => `${m.name}: ${m.options.map((o) => `${o.name}${o.priceCents ? ` ${(o.priceCents / 100).toFixed(2)}` : ""}`).join(", ")}`).join("\n") })} />
                      </li>
                    ))}
                    {!items.length ? <li className="py-2 text-meta text-fg-muted">No items yet.</li> : null}
                  </ul>
                </Panel>
              );
            })}
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!newCat.trim()) return;
              await act.run(() => api.createCatalogCategory({ name: newCat.trim() }));
              setNewCat("");
              await state.reload();
            }}>
              <TextField label="New menu section" hideLabel placeholder="New menu section, e.g. Pastries" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <Button type="submit" variant="secondary">Add section</Button>
            </form>
            <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit item" : "Add item"} size="md" actions={
              <>
                <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
                <Button loading={act.busy} onClick={async () => {
                  if (!edit) return;
                  const priceCents = Math.round(Number.parseFloat(edit.price) * 100);
                  if (!edit.name.trim() || !(priceCents >= 0)) return act.setError("Add a name and price.");
                  const body = { name: edit.name.trim(), priceCents, description: edit.description.trim() || null, categoryId: edit.categoryId || null, modifiers: parseModifiers(edit.modifiers) };
                  const r = await act.run(() => (edit.id ? api.updateItem(edit.id, body) : api.createItem(body)));
                  if (r) {
                    setEdit(null);
                    await state.reload();
                  }
                }}>Save item</Button>
              </>
            }>
              {edit ? (
                <div className="flex flex-col gap-4">
                  <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <TextField label="Price" inputMode="decimal" prefix="$" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                  <Select label="Section" placeholder="No category" value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })} options={c.categories.map((x) => ({ value: x.id, label: x.name }))} />
                  <TextField type="textarea" label="Description" optionalLabel value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                  <TextField type="textarea" label="Options" optionalLabel hint="One group per line: Size: Small, Large 0.75" value={edit.modifiers} onChange={(e) => setEdit({ ...edit, modifiers: e.target.value })} />
                </div>
              ) : null}
            </Modal>
          </>
        )}
      </Async>
    </div>
  );
}
