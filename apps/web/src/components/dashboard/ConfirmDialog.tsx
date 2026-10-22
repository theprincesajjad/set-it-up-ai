"use client";
import { useState, type ReactNode } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/errors";

/** Confirm dialog: title states the action, body the consequence, [Cancel] [Action] (system.md Modal). */
export function ConfirmDialog({ open, onClose, title, body, confirmLabel, danger, onConfirm, children, disabled }: { open: boolean; onClose: () => void; title: string; body?: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<unknown> | unknown; children?: ReactNode; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title={title}
      description={body}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={busy}
            disabled={disabled}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error ? <Banner tone="danger" className="mt-3">{error}</Banner> : null}
    </Modal>
  );
}
