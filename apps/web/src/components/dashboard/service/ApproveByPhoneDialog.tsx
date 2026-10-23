"use client";
import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";

/**
 * Record that the customer said yes by phone. The server keeps the name, phone, time and which staff member took it
 * (what Ontario's auto-repair rules ask for on a spoken authorisation; we keep it for every kind of ticket).
 */
export function ApproveByPhoneDialog({ open, onClose, defaultName, defaultPhone, totalLabel, busy, error, onConfirm }: { open: boolean; onClose: () => void; defaultName: string; defaultPhone: string; totalLabel: string; busy: boolean; error: string | null; onConfirm: (v: { name: string; phone: string; note: string }) => void }) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const nameOk = name.trim().length >= 2;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Approved by phone"
      description={`Record who said yes to ${totalLabel}. We keep the name, phone number and time with the quote. The customer gets a text confirming it.`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={() => {
              setTouched(true);
              if (nameOk) onConfirm({ name: name.trim(), phone: phone.trim(), note: note.trim() });
            }}
          >
            Confirm approval
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField label="Who approved" value={name} onChange={(e) => setName(e.target.value)} error={touched && !nameOk ? "Enter the name of the person who approved." : null} autoComplete="off" maxLength={120} />
        <TextField label="Phone number" optionalLabel inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="The number you spoke to." />
        <TextField label="Note" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} hint="For example: said yes at 10:02, wants it by Friday." />
        {error ? <Banner tone="danger">{error}</Banner> : null}
      </div>
    </Modal>
  );
}
