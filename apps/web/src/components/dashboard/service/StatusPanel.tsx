"use client";
import { useState } from "react";
import { LOCALES, serviceApi, type Locale } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { Timeline, ticketSteps } from "@/components/ui/Timeline";
import { copy } from "@/copy/en-CA";
import { formatDateTime } from "@/lib/format";

/** Timeline (customer view of progress), update status with the "text in their language" switch, and notes. */
export function StatusPanel({ ticket, events, busy, onUpdate, onNote }: { ticket: serviceApi.TicketDto; events: serviceApi.TicketEventDto[]; busy: boolean; onUpdate: (v: { status: serviceApi.TicketDto["status"]; note: string | null; notify: boolean }) => Promise<boolean>; onNote: (note: string, visible: boolean) => Promise<void> }) {
  const closed = ticket.status === "picked_up" || ticket.status === "cancelled";
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [internal, setInternal] = useState("");
  const [visible, setVisible] = useState(false);
  const lang = (ticket.customer?.language ?? "en") as Locale;
  const language = LOCALES[lang]?.englishName ?? "English";
  const first = ticket.customer?.name?.trim().split(/\s+/)[0] ?? "customer";
  return (
    <>
      <Panel title="Timeline">
        <Timeline steps={ticketSteps(ticket.status, copy.ticketStatus, events)} />
        <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-meta">
          {events.filter((e) => e.note && !e.visibleToCustomer).slice(-3).map((e) => (
            <li key={e.id}><span className="text-fg">{e.note}</span><span className="block text-caption text-fg-muted">{formatDateTime(e.createdAt)} · internal</span></li>
          ))}
        </ul>
      </Panel>
      {!closed ? (
        <Panel title="Update status">
          <div className="flex flex-col gap-3">
            <Select label="Update status" hideLabel placeholder="Pick a status" value={status} onChange={(e) => setStatus(e.target.value)} options={serviceApi.MANUAL_TICKET_STATUSES.filter((s) => s !== ticket.status).map((s) => ({ value: s, label: copy.ticketStatus[s] ?? s }))} />
            <TextField label="Note for the customer" hideLabel placeholder="Note for the customer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex items-center justify-between gap-3">
              <span id="notify-label" className="text-body text-fg">Text {first} in {language}</span>
              <SwitchControl checked={notify} onChange={setNotify} ariaLabel={`Text ${first} in ${language}`} />
            </div>
            <Button
              disabled={!status}
              loading={busy}
              className="self-start"
              onClick={async () => {
                if (await onUpdate({ status: status as serviceApi.TicketDto["status"], note: note.trim() || null, notify })) {
                  setStatus("");
                  setNote("");
                }
              }}
            >
              Update
            </Button>
          </div>
        </Panel>
      ) : null}
      <Panel title="Notes">
        <ul className="flex flex-col gap-2 text-meta">
          {events.filter((e) => e.note).map((e) => (
            <li key={e.id}>
              <span className="text-fg">{e.note}</span>
              <span className="block text-caption text-fg-muted">{formatDateTime(e.createdAt)}{e.visibleToCustomer ? " · customer can see" : " · internal"}</span>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!internal.trim()) return;
            await onNote(internal.trim(), visible);
            setInternal("");
          }}
        >
          <TextField label="Add a note" hideLabel placeholder="Add a note" value={internal} onChange={(e) => setInternal(e.target.value)} />
          <Checkbox label="Customer can see this" checked={visible} onChange={setVisible} />
          <Button type="submit" variant="secondary" className="self-start">Add note</Button>
        </form>
      </Panel>
    </>
  );
}
