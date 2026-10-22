"use client";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/errors";
import { STAGE_LABEL, canConfirmStage, requiresTypedKey, stageEffect, type Stage } from "@/lib/dashboard/rollout";

/** Confirm a rollout stage change: plain-words effect, optional note, typed key for GA (admin.md §1). */
export function StageDialog({ feature, to, onClose, onConfirm }: { feature: adminApi.AdminFeature | null; to: Stage | null; onClose: () => void; onConfirm: (stage: Stage, note: string) => Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !!feature && !!to;
  const ok = open && canConfirmStage(feature, to, typed);
  const close = () => {
    setTyped("");
    setNote("");
    setError(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={open ? `Turn ${feature.name} to ${STAGE_LABEL[to]}?` : "Change stage"}
      description={open ? stageEffect(feature, to) : undefined}
      actions={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={to === "hidden" ? "danger" : "primary"}
            disabled={!ok}
            loading={busy}
            onClick={async () => {
              if (!open) return;
              setBusy(true);
              setError(null);
              try {
                await onConfirm(to, note.trim());
                close();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {open ? `Set to ${STAGE_LABEL[to]}` : "Confirm"}
          </Button>
        </>
      }
    >
      {open ? (
        <div className="flex flex-col gap-4">
          {feature.unlockAtMerchants > 0 && !feature.readyToUnlock && to !== "hidden" ? (
            <Banner tone="warning">
              The network has {feature.activeMerchants} active merchants; the target for this feature is {feature.unlockAtMerchants}.
            </Banner>
          ) : null}
          <TextField label="Note" optionalLabel hint="Saved in the audit log." value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          {requiresTypedKey(to) ? <TextField label={`Type ${feature.key} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" /> : null}
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </div>
      ) : null}
    </Modal>
  );
}
