"use client";
import { EmptyState, PageHeader, RowList, Section, SkeletonRows, Tag } from "@/components/dashboard/kit";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { commerceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
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
  const [tried, setTried] = useState(false);
  const [newCat, setNewCat] = useState("");
  const act = useAction();
  const blank: Draft = { name: "", price: "", description: "", categoryId: "", modifiers: "" };
  const openEdit = (d: Draft) => {
    setTried(false);
    act.setError(null);
    setEdit(d);
  };
  const priceCents = edit ? Math.round(Number.parseFloat(edit.price) * 100) : NaN;
  const nameError = tried && edit && !edit.name.trim() ? "Add a name." : null;
  const priceError = tried && edit && !(priceCents >= 0) ? "Add a price, like 4.50." : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Menu & catalog" description="What customers can order ahead. Prices are always set here, never by the app." actions={<Button size="sm" iconStart={Plus} onClick={() => openEdit(blank)}>Add item</Button>} />
      {act.error && !edit ? <Banner tone="danger">{act.error}</Banner> : null}
      <Async state={state} skeleton={<SkeletonRows rows={6} />}>
        {(c) => (
          <>
            {!c.items.length ? (
              <EmptyState title="No menu items yet" description="Add what customers can order ahead, with prices and options." action={<Button variant="secondary" size="sm" iconStart={Plus} onClick={() => openEdit(blank)}>Add item</Button>} />
            ) : null}
            {[...c.categories, { id: "", name: "No category", earnEligible: true, discountEligible: true }].map((cat) => {
              const items = c.items.filter((i) => (i.categoryId ?? "") === cat.id);
              if (!items.length && !cat.id) return null;
              if (!items.length && !c.items.length) return null;
              return (
                <Section key={cat.id || "none"} title={<span className="flex items-center gap-2">{cat.name} {!cat.earnEligible ? <Tag>Doesn&apos;t earn</Tag> : null}</span>} action={<span className="text-meta tabular text-fg-muted">{items.length} {items.length === 1 ? "item" : "items"}</span>}>
                  <RowList label={cat.name}>
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body text-fg">{i.name}</p>
                          <p className="truncate text-meta text-fg-muted tabular">{formatMoney(i.priceCents)}{i.modifiers.length ? ` · ${i.modifiers.map((m) => m.name).join(", ")}` : ""}</p>
                        </div>
                        <div className="shrink-0 [&_label]:text-meta [&_label]:text-fg-muted">
                          <Switch label="Orderable" checked={i.orderable && i.available} onChange={async (v) => {
                            await act.run(() => api.updateItem(i.id, { orderable: v, available: v }));
                            await state.reload();
                          }} />
                        </div>
                        <IconButton icon={Pencil} size={40} label={`Edit ${i.name}`} onClick={() => openEdit({ id: i.id, name: i.name, price: (i.priceCents / 100).toFixed(2), description: i.description ?? "", categoryId: i.categoryId ?? "", modifiers: i.modifiers.map((m) => `${m.name}: ${m.options.map((o) => `${o.name}${o.priceCents ? ` ${(o.priceCents / 100).toFixed(2)}` : ""}`).join(", ")}`).join("\n") })} />
                      </li>
                    ))}
                    {!items.length ? <li className="py-3 text-meta text-fg-muted">No items yet.</li> : null}
                  </RowList>
                </Section>
              );
            })}
            <form className="flex items-start gap-2" onSubmit={async (e) => {
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
                  setTried(true);
                  if (!edit.name.trim() || !(priceCents >= 0)) return;
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
                  <TextField label="Name" value={edit.name} error={nameError} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <TextField label="Price" inputMode="decimal" prefix="$" error={priceError} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                  <Select label="Section" placeholder="No category" value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })} options={c.categories.map((x) => ({ value: x.id, label: x.name }))} />
                  <TextField type="textarea" label="Description" optionalLabel value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                  <TextField type="textarea" label="Options" optionalLabel hint="One group per line: Size: Small, Large 0.75" value={edit.modifiers} onChange={(e) => setEdit({ ...edit, modifiers: e.target.value })} />
                  {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
                </div>
              ) : null}
            </Modal>
          </>
        )}
      </Async>
    </div>
  );
}
