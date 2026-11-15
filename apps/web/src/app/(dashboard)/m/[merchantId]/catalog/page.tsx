"use client";
import { EmptyState, PageHeader, RowList, Section, SkeletonRows, Tag } from "@/components/dashboard/kit";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { commerceApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
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
import { focusFirstInvalid } from "@/lib/api/useErrorText";
import { enabledSet, hasRestaurantFeature } from "@/lib/dashboard/nav";
import { useToast } from "@/components/ui/Toast";
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
  const { api, base, features, role } = useMerchant();
  const restaurant = hasRestaurantFeature(enabledSet(features.features));
  const manager = role === "owner" || role === "manager";
  const toast = useToast();
  const state = useApi(() => api.catalog(), [api]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [tried, setTried] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<commerceApi.CatalogCategoryDto | null>(null);
  const act = useAction();
  // A new dish starts in the first section that earns points (Food, not Alcohol), so the first one is not left under "No section".
  const blank: Draft = { name: "", price: "", description: "", categoryId: state.data?.categories.find((x) => x.earnEligible)?.id ?? "", modifiers: "" };
  const openEdit = (d: Draft) => {
    setTried(false);
    act.setError(null);
    setEdit(d);
  };
  const priceCents = edit ? Math.round(Number.parseFloat(edit.price) * 100) : NaN;
  const nameError = tried && edit && !edit.name.trim() ? "Add a name." : null;
  const priceError = tried && edit && !(priceCents >= 0) ? "Add a price, like 4.50." : null;
  const sectionHint = restaurant ? "e.g. Mains" : "e.g. Pastries";
  async function save() {
    if (!edit) return;
    const cents = Math.round(Number.parseFloat(edit.price) * 100);
    setTried(true);
    if (!edit.name.trim() || !(cents >= 0)) return focusFirstInvalid();
    const body = { name: edit.name.trim(), priceCents: cents, description: edit.description.trim() || null, categoryId: edit.categoryId || null, modifiers: parseModifiers(edit.modifiers) };
    const r = await act.run(() => (edit.id ? api.updateItem(edit.id, body) : api.createItem(body)));
    if (r) {
      toast({ message: edit.id ? `${r.name} saved` : `${r.name} added`, tone: "success" });
      setEdit(null);
      await state.reload();
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        back={restaurant ? { href: `${base}/restaurant/menu`, label: "Menu & dietary" } : undefined}
        title="Menu and prices"
        description="What customers can order ahead, and what it costs. Prices are always set here."
        actions={state.data && !state.data.items.length ? undefined : <Button size="sm" iconStart={Plus} onClick={() => openEdit(blank)}>Add item</Button>}
      />
      {act.error && !edit ? <Banner tone="danger">{act.error}</Banner> : null}
      <Async state={state} skeleton={<SkeletonRows rows={6} />}>
        {(c) => (
          <>
            {!c.items.length ? (
              <EmptyState
                title={c.categories.length ? "Add your first dish" : "No menu items yet"}
                description={c.categories.length ? `Your sections are ready: ${c.categories.map((x) => x.name).join(", ")}. Add a dish to one of them, with a price and any choices like spice or size.` : "Add what customers can order ahead, with prices and options."}
                action={<Button size="sm" iconStart={Plus} onClick={() => openEdit(blank)}>Add your first dish</Button>}
              />
            ) : null}
            {[...c.categories, { id: "", name: "No section", earnEligible: true, discountEligible: true }].map((cat) => {
              const items = c.items.filter((i) => (i.categoryId ?? "") === cat.id);
              if (!items.length && !cat.id) return null;
              return (
                <Section
                  key={cat.id || "none"}
                  title={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">{cat.name} {!cat.earnEligible ? <Tag>Doesn&apos;t earn</Tag> : null}<span className="hidden text-meta font-normal tabular text-fg-muted sm:inline">{items.length} {items.length === 1 ? "item" : "items"}</span></span>}
                  action={
                    <span className="flex items-center gap-1">
                      {cat.id && manager ? (
                        <>
                          <Button size="sm" variant="ghost" iconStart={Plus} onClick={() => openEdit({ ...blank, categoryId: cat.id })}>Add item</Button>
                          <IconButton icon={Pencil} size={40} label={`Rename ${cat.name}`} onClick={() => { act.setError(null); setRenaming({ id: cat.id, name: cat.name }); }} />
                          <IconButton icon={Trash2} size={40} label={`Delete ${cat.name}`} onClick={() => setDeleting(cat)} />
                        </>
                      ) : null}
                    </span>
                  }
                >
                  <RowList label={cat.name}>
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-center gap-2 text-body text-fg"><span className="line-clamp-2">{i.name}</span>{!(i.orderable && i.available) ? <Tag>Sold out</Tag> : null}</p>
                          <p className="truncate text-meta text-fg-muted tabular">{formatMoney(i.priceCents)}{i.modifiers.length ? ` · ${i.modifiers.map((m) => m.name).join(", ")}` : ""}</p>
                        </div>
                        <div className="shrink-0 [&_label]:text-meta [&_label]:text-fg-muted">
                          <Switch label="Available" checked={i.orderable && i.available} onChange={async (v) => {
                            const r = await act.run(() => api.updateItem(i.id, { orderable: v, available: v }));
                            if (r) toast({ message: v ? `${i.name} is back on the menu` : `${i.name} is sold out`, tone: "success" });
                            await state.reload();
                          }} />
                        </div>
                        <IconButton icon={Pencil} size={40} label={`Edit ${i.name}`} onClick={() => openEdit({ id: i.id, name: i.name, price: (i.priceCents / 100).toFixed(2), description: i.description ?? "", categoryId: i.categoryId ?? "", modifiers: i.modifiers.map((m) => `${m.name}: ${m.options.map((o) => `${o.name}${o.priceCents ? ` ${(o.priceCents / 100).toFixed(2)}` : ""}`).join(", ")}`).join("\n") })} />
                      </li>
                    ))}
                    {!items.length ? <li className="py-3 text-meta text-fg-muted">No items in this section yet.</li> : null}
                  </RowList>
                </Section>
              );
            })}
            <form className="flex items-start gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!newCat.trim()) return;
              const r = await act.run(() => api.createCatalogCategory({ name: newCat.trim() }));
              if (r) {
                toast({ message: `${r.name} added`, tone: "success" });
                setNewCat("");
                await state.reload();
              }
            }}>
              <TextField label="New menu section" hideLabel placeholder={`New section, ${sectionHint}`} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <Button type="submit" variant="secondary">Add section</Button>
            </form>
            <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename section" size="sm" actions={
              <>
                <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
                <Button loading={act.busy} onClick={async () => {
                  if (!renaming?.name.trim()) return;
                  const r = await act.run(() => api.updateCatalogCategory(renaming.id, { name: renaming.name.trim() }));
                  if (r) {
                    toast({ message: `Renamed to ${r.name}`, tone: "success" });
                    setRenaming(null);
                    await state.reload();
                  }
                }}>Save</Button>
              </>
            }>
              {renaming ? (
                <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
                  <TextField label="Section name" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                  {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
                </form>
              ) : null}
            </Modal>
            <ConfirmDialog
              open={!!deleting}
              onClose={() => setDeleting(null)}
              danger
              title={`Delete ${deleting?.name ?? "this section"}?`}
              body="Its dishes stay on the menu with no section. Nothing is removed from past orders."
              confirmLabel="Delete section"
              onConfirm={async () => {
                if (!deleting) return;
                await api.deleteCatalogCategory(deleting.id);
                toast({ message: `${deleting.name} deleted`, tone: "success" });
                await state.reload();
              }}
            />
            <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit item" : "Add item"} size="md" actions={
              <>
                <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
                <Button loading={act.busy} onClick={() => void save()}>Save item</Button>
              </>
            }>
              {edit ? (
                <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
                  <TextField label="Name" value={edit.name} error={nameError} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <TextField label="Price" inputMode="decimal" prefix="$" error={priceError} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                  <Select label="Section" placeholder="No section" value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })} options={c.categories.map((x) => ({ value: x.id, label: x.name }))} />
                  <TextField type="textarea" label="Description" optionalLabel value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                  <TextField type="textarea" label="Choices" optionalLabel hint="One group per line. Put the extra price after a choice that costs more: Size: Half, Full 12" value={edit.modifiers} onChange={(e) => setEdit({ ...edit, modifiers: e.target.value })} />
                  {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
                  <button type="submit" hidden aria-hidden tabIndex={-1} />
                </form>
              ) : null}
            </Modal>
          </>
        )}
      </Async>
    </div>
  );
}
