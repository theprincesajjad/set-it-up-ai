"use client";
/**
 * Pantry reminders (grocery.pantry_reminders), docs/research/grocers.md frame D6: a text a few days before a household runs out of a
 * 20 lb bag of atta, only to people who asked, in their language, with a STOP line. The cashier taps what was bought at the counter;
 * this page shows who is due and sends it.
 */
import { useState } from "react";
import type { groceryApi } from "@ll/shared";
import { DataTable, DefList, EmptyState, ErrorLine, FeatureGate, PageHeader, Panel, Sheet, StatBlock, Tag, useMerchant, type Column } from "@/components/dashboard";
import { NumberField } from "@/components/dashboard/restaurant/common";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { dealDates, intervalWords } from "@/lib/grocery";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function PantryPage() {
  return (
    <FeatureGate keys={["grocery.pantry_reminders"]} title="Pantry reminders">
      <Pantry />
    </FeatureGate>
  );
}

function Pantry() {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.grocery.pantry(), [api]);
  const [sheet, setSheet] = useState<{ item: groceryApi.PantryItemDto | null } | null>(null);
  const canEdit = role === "owner" || role === "manager";
  const d = state.data;
  const ready = (d?.due ?? []).filter((x) => x.readyToText);

  async function send(ids?: string[]) {
    const r = await act.run(() => api.grocery.sendPantry(ids));
    if (r) {
      toast({ message: r.sent ? `${r.sent} ${r.sent === 1 ? "text" : "texts"} sent${r.skipped ? `, ${r.skipped} skipped` : ""}` : "Nobody was due for a text right now.", tone: r.sent ? "success" : "neutral" });
      void state.reload();
    }
  }

  const itemCols: Column<groceryApi.PantryItemDto>[] = [
    { key: "name", header: "Item", mobile: "title", cell: (i) => <span className="font-medium">{i.name}</span> },
    { key: "gap", header: "Usual gap", mobile: "subtitle", cell: (i) => <span className="text-fg-muted">{intervalWords(i.defaultIntervalDays)}</span> },
    { key: "watch", header: "Watching", align: "end", mobile: "trailing", cell: (i) => <span className="tabular">{i.watching}</span> },
    { key: "due", header: "Due this week", align: "end", mobile: "hidden", cell: (i) => <span className="tabular">{i.dueSoon}</span> },
    { key: "act", header: "", align: "end", mobile: "hidden", cell: (i) => (canEdit ? <Button size="sm" variant="ghost" onClick={() => setSheet({ item: i })}>Edit</Button> : null) },
  ];
  const dueCols: Column<groceryApi.PantryDueDto>[] = [
    { key: "who", header: "Customer", mobile: "title", cell: (x) => <span className="font-medium">{x.name ?? "Customer"}</span> },
    { key: "item", header: "Item", mobile: "subtitle", cell: (x) => <span>{x.itemName} <span className="text-fg-muted">· {intervalWords(x.intervalDays)}</span></span> },
    { key: "due", header: "Runs out", mobile: "trailing", cell: (x) => <span className="font-semibold tabular text-accent-text">{dealDates(x.dueOn, x.dueOn)}</span> },
    { key: "text", header: "Text goes", mobile: "hidden", cell: (x) => (x.readyToText ? <Tag tone="accent">Ready</Tag> : <span className="text-fg-muted">{dealDates(x.remindOn, x.remindOn)}</span>) },
    { key: "act", header: "", align: "end", mobile: "hidden", cell: (x) => (canEdit && x.readyToText ? <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => void send([x.entryId])}>Text now</Button> : null) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Pantry reminders"
        description="A text a few days before someone runs out of a bulk staple. Only people who asked."
        actions={
          canEdit ? (
            <>
              <Button size="md" variant="secondary" onClick={() => setSheet({ item: null })}>Add an item</Button>
              <Button size="md" disabled={!ready.length} loading={act.busy} onClick={() => void send()}>{ready.length ? `Text the ${ready.length}` : "Nobody due"}</Button>
            </>
          ) : null
        }
      />
      {state.error && !d ? <ErrorLine message={state.error} onRetry={() => void state.reload()} /> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <StatBlock
        label="Pantry reminders"
        loading={state.loading && !d}
        cols={3}
        items={[
          { label: "Members who said yes", value: d ? String(d.members) : "–", caption: "Reminders are on for at least one item" },
          { label: "Due in the next 7 days", value: d ? String(d.due.length) : "–", caption: d ? `${ready.length} ready to text now` : undefined },
          { label: "Texts in the last 30 days", value: d ? String(d.last30.sent) : "–", caption: d ? `${d.last30.boughtWithin7Days} bought again within 7 days` : undefined },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="due-h" className="flex flex-col gap-3">
            <h2 id="due-h" className="text-[15px] font-semibold text-fg">Probably running low</h2>
            <DataTable caption="Due for a reminder" columns={dueCols} rows={d?.due ?? []} rowKey={(x) => x.entryId} loading={state.loading && !d} empty={<EmptyState title="Nobody is due this week" description="When the cashier logs a bulk purchase and the customer says yes, they show up here before they run out." />} />
          </section>
          <section aria-labelledby="items-h" className="flex flex-col gap-3">
            <h2 id="items-h" className="text-[15px] font-semibold text-fg">Items we remind about</h2>
            <DataTable caption="Pantry items" columns={itemCols} rows={d?.items ?? []} rowKey={(i) => i.id} loading={state.loading && !d} empty={<EmptyState title="No items yet" description="Add the bags and tins people buy every few weeks: 20 lb atta, basmati rice, ghee." action={canEdit ? <Button size="md" onClick={() => setSheet({ item: null })}>Add an item</Button> : undefined} />} />
            <p className="text-caption text-fg-muted">The usual gap is your default. After three purchases it follows each household&apos;s own rhythm.</p>
          </section>
        </div>
        <div className="flex flex-col gap-6">
          <Panel title="The text" description="In the customer's language: English, Hindi, Urdu or Punjabi.">
            <p className="rounded-card bg-bg-subtle p-4 text-meta text-fg">Annapurna Grocers: Hi Priya, your Atta 20 lb is probably running low. Order it now and pick it up at Annapurna Grocers: [link]. Reply STOP to opt out.</p>
            <DefList items={[{ label: "Goes out", value: "5 days before the usual date, at 10 am" }, { label: "Never", value: "Between 9 pm and 8 am" }, { label: "How often", value: "Once per purchase" }]} className="mt-3" />
          </Panel>
          <Panel title="How people say yes" description="At the counter, once.">
            <p className="text-meta text-fg">{d?.askText ?? "Want a text a few days before your 20 lb atta runs out? You can reply STOP any time."}</p>
            <p className="mt-2 text-caption text-fg-muted">The cashier taps what was bought, then Yes. We record who asked, when and where. Customers can switch an item off on their pass. STOP ends every text. Members who have not agreed to texts from your shop cannot be added.</p>
          </Panel>
        </div>
      </div>
      {sheet ? <ItemSheet item={sheet.item} onClose={() => setSheet(null)} onSaved={() => void state.reload()} /> : null}
    </div>
  );
}

function ItemSheet({ item, onClose, onSaved }: { item: groceryApi.PantryItemDto | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState(item?.name ?? "");
  const [weeks, setWeeks] = useState(item ? String(Math.round(item.defaultIntervalDays / 7)) : "6");
  const days = Math.max(1, Number.parseInt(weeks || "0", 10)) * 7;
  const bad = !name.trim() || !weeks || days < 7 || days > 180;
  async function save(active = true) {
    const body = { name: name.trim(), defaultIntervalDays: days, active };
    const r = await act.run(async () => {
      if (item) await api.grocery.updatePantryItem(item.id, body);
      else await api.grocery.createPantryItem(body);
      return true;
    });
    if (r) {
      toast({ message: item ? (active ? "Item saved" : "Item archived") : "Item added", tone: "success" });
      onSaved();
      onClose();
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? "Edit item" : "Add an item"}
      subtitle="A bulk staple people buy every few weeks."
      label="Pantry item"
      footer={
        <>
          {item ? <Button variant="ghost" onClick={() => void save(false)}>Archive</Button> : <Button variant="ghost" onClick={onClose}>Cancel</Button>}
          <Button disabled={bad} loading={act.busy} onClick={() => void save()}>{item ? "Save item" : "Add item"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <TextField label="Item" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aashirvaad atta 20 lb" maxLength={80} />
        <NumberField label="Usually lasts a household" suffix="weeks" value={weeks} onChange={setWeeks} hint="20 lb of atta: about 6 weeks. This is the starting guess; it learns from each customer." />
      </div>
    </Sheet>
  );
}
