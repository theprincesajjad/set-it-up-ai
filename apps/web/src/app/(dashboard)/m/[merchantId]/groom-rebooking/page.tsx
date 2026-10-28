"use client";
import Link from "next/link";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SkeletonRows, StatBlock, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { shortDate, shortWeeks } from "@/lib/dashboard/pets";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function PetRebookingPage() {
  return (
    <FeatureGate keys={["pets.profiles"]} title="Groom rebooking">
      <Rebooking />
    </FeatureGate>
  );
}

/** Groom rebooking (Figma frame 2): pets due or late on their own cadence. One text per cycle, only to owners who said yes. */
function Rebooking() {
  const { api, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.pets.rebooking(), [api]);
  const d = state.data;
  const sendable = d?.items.filter((i) => i.canSend).length ?? 0;
  async function send(body: { petIds?: string[]; skip?: boolean }, ok: (r: { sent: number; skipped: number }) => string) {
    const r = await act.run(() => api.pets.sendRebooking(body));
    if (r) toast({ message: ok(r), tone: "success" });
    await state.reload();
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Due to come back"
        description="Each pet is on its own cadence. One text per cycle, only to owners who said yes, never overnight."
        actions={<Button size="sm" disabled={!sendable} loading={act.busy} onClick={() => void send({}, (r) => `${r.sent} ${r.sent === 1 ? "text" : "texts"} sent`)}>{`Text all due (${sendable})`}</Button>}
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <StatBlock tiles
        label="Groom rebooking"
        loading={!d}
        items={[
          { label: "Due this week", value: d ? d.counts.due - d.counts.late : 0, caption: "within 7 days" },
          { label: "Late", value: d?.counts.late ?? 0, caption: "past their date", dot: d && d.counts.late ? "accent" : undefined },
          { label: "Pets on a cadence", value: d?.counts.onCadence ?? 0, caption: "groomed here at least once" },
        ]}
      />
      <Async state={state} skeleton={<SkeletonRows rows={5} />}>
        {(r) =>
          r.items.length === 0 ? (
            <Empty>Nobody is due. Pets show here a week before their date.</Empty>
          ) : (
            <TableWrap>
              <Table label="Pets due for a groom">
                <thead>
                  <tr>
                    <Th>Pet and owner</Th>
                    <Th>Breed and coat</Th>
                    <Th>Cadence</Th>
                    <Th>Last groom</Th>
                    <Th>Due</Th>
                    <Th align="end">Reminder</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((i) => (
                    <Tr key={i.petId}>
                      <Td>
                        <Link href={`${base}/pets/${i.petId}`} className="font-medium text-fg hover:underline">{i.petName}</Link>
                        <div className="text-meta text-fg-muted">{i.ownerName ?? "No name"}</div>
                      </Td>
                      <Td className="text-fg-muted">{[i.breed, i.coat.replace("_", " ")].filter(Boolean).join(", ")}</Td>
                      <Td>{shortWeeks(i.everyWeeks)}</Td>
                      <Td>{shortDate(i.lastGroomOn)}</Td>
                      <Td>
                        <span className="me-2">{shortDate(i.dueOn)}</span>
                        <Dot tone={i.state === "late" ? "negative" : "accent"}>{i.state === "late" ? "Late" : "Due"}</Dot>
                      </Td>
                      <Td align="end">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => void send({ petIds: [i.petId], skip: true }, () => `${i.petName} skipped for this cycle`)}>Skip</Button>
                          <Button size="sm" disabled={!i.canSend || act.busy} onClick={() => void send({ petIds: [i.petId] }, () => `Text sent about ${i.petName}`)}>{i.canSend ? "Send text" : "No text consent"}</Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )
        }
      </Async>
      <AutoToggle />
      {d ? (
        <div className="flex flex-col gap-1.5 rounded-card bg-bg-subtle px-5 py-4">
          <p className="text-meta text-fg-muted">What the owner gets (in English; in their own language if they set one)</p>
          <p className="text-body text-fg">{d.previewText}</p>
        </div>
      ) : null}
    </div>
  );
}

/** The shop can let the 10:00 job send these texts itself (managers set it). Off by default: nothing goes out until the shop says so. */
function AutoToggle() {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const settings = useApi(() => api.pets.settings(), [api]);
  const on = settings.data?.autoGroomReminders ?? false;
  return (
    <label className="flex items-start gap-2 text-body text-fg">
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={on}
        disabled={!settings.data || role === "staff" || act.busy}
        onChange={async (e) => {
          const r = await act.run(() => api.pets.saveSettings({ autoGroomReminders: e.target.checked }));
          if (r) toast({ message: r.autoGroomReminders ? "Reminders go out at 10:00 on their own" : "Reminders are manual again", tone: "success" });
          await settings.reload();
        }}
      />
      <span>Text owners automatically when a groom is due (10:00, once per cycle, only owners who said yes)</span>
    </label>
  );
}
