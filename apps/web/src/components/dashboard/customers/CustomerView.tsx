"use client";
/**
 * One customer: balance, details, ledger, adjust, notes. Rendered inside the right-side panel on
 * the Customers table (Square pattern) and as the full page at /customers/[memberId] (deep links).
 */
import { Minus, Plus, Undo2, X } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { DefList, Dot, Section, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { newIdempotencyKey } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatDateYear, formatMoney, formatNumber, formatPoints } from "@/lib/format";
import { formatE164 } from "@/lib/phone";
import { CONSENT_LABEL, consentState, maskPhone } from "@/lib/dashboard/customers";
import { useAction, useNow } from "@/lib/dashboard/useApi";
import { sourceLabel } from "@/lib/dashboard/labels";

const JOINED_VIA: Record<string, string> = { qr: "QR scan", counter: "Counter", staff_app: "Counter", web_counter: "Counter", import: "Import", web: "Web", app: "App", referral: "Referral", pos: "POS" };

const REASONS = ["Missed at the counter", "Goodwill", "Correction", "Migration fix", "Other"];

export function CustomerView({ d, rewards, onChange, reload, layout }: { d: merchantApi.CustomerDetail; rewards: merchantApi.Reward[]; onChange: (d: merchantApi.CustomerDetail) => void; reload: () => Promise<void>; layout: "panel" | "page" }) {
  const { api, detail, role, enabled } = useMerchant();
  const toast = useToast();
  const c = d.customer;
  const program = detail.program;
  const term = program?.terminology ?? "points";
  const manager = role !== "staff";
  const marketing = enabled("marketing.email") || enabled("marketing.sms");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reverseTx, setReverseTx] = useState<merchantApi.LedgerTransactionView | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [notes, setNotes] = useState(c.notes ?? "");
  const [tag, setTag] = useState("");
  const save = useAction();
  const revealAct = useAction();
  const [fullPhone, setFullPhone] = useState<string | null | undefined>(undefined);
  const s = consentState(c);
  const active = rewards.filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost);
  const goal = program?.earnType === "stamps" ? program.stampGoal : (active.find((r) => r.pointsCost > c.balance) ?? active[active.length - 1])?.pointsCost ?? 0;
  const rewardName = (id: string) => rewards.find((r) => r.id === id)?.name ?? "Reward";
  const recentCutoff = useNow() - 90 * 86_400_000;

  const phone = (
    <span className="inline-flex items-center gap-2">
      <span className="tabular">{fullPhone !== undefined ? formatE164(fullPhone) || "No phone" : maskPhone(c.phone)}</span>
      {manager && c.phone && fullPhone === undefined ? (
        <button
          type="button"
          disabled={revealAct.busy}
          onClick={async () => {
            // Audit-logged on the server (customer.phone_revealed).
            const r = await revealAct.run(() => api.revealPhone(c.memberId));
            if (r) setFullPhone(r.phone);
          }}
          className="text-meta font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg disabled:opacity-60"
          aria-label={`Reveal phone for ${c.name ?? "member"}`}
        >
          Reveal
        </button>
      ) : null}
    </span>
  );

  const summary = (
    <div>
      <p className="text-meta text-fg-muted">Balance</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[40px] font-extrabold leading-[44px] tracking-[-0.01em] text-accent-text tabular">{formatNumber(c.balance)}</span>
        <span className="text-body text-fg-muted">{formatPoints(c.balance, term, false).replace(/^[\d,]+\s*/, "")}</span>
      </p>
      {goal > 0 ? (
        <p className="mt-1 text-meta text-fg-muted">{c.rewardAvailable ? "Reward ready" : `${formatNumber(Math.max(0, goal - c.balance))} to the next reward`}</p>
      ) : null}
      {manager ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setAdjustOpen(true)}>
          Adjust {term}
        </Button>
      ) : null}
    </div>
  );

  const details = (
    <DefList
      items={[
        { label: "Phone", value: phone },
        ...(c.email ? [{ label: "Email", value: c.email }] : []),
        { label: "Member code", value: <span className="font-mono">{c.memberCode}</span> },
        { label: "Visits", value: formatNumber(c.visitCount) },
        { label: "Spent", value: formatMoney(c.totalSpendCents) },
        { label: "Lifetime", value: formatPoints(c.lifetimePoints, term) },
        { label: "Joined", value: `${formatDateYear(c.joinedAt)}${c.joinedVia ? ` · ${JOINED_VIA[c.joinedVia] ?? c.joinedVia.replace(/_/g, " ")}` : ""}` },
        ...(c.vipLevel ? [{ label: "VIP level", value: c.vipLevel.name }] : []),
        ...(marketing
          ? [{ label: "Messages", value: <Dot tone={s === "opted_in" ? "positive" : "neutral"}>{CONSENT_LABEL[s]}</Dot> }]
          : []),
      ]}
    />
  );

  const ledger = (
    <Section title="Activity" description="Every change to this balance, newest first.">
      {d.transactions.length ? (
        <ul aria-label="Ledger history" className="divide-y divide-line border-y border-line">
          {d.transactions.map((t) => (
            <li key={t.id} className="flex min-h-12 items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-meta text-fg">
                  <span className="capitalize">{t.type.replace(/_/g, " ")}</span>
                  {t.description && t.description.toLowerCase() !== t.type.replace(/_/g, " ").toLowerCase() ? <span className="text-fg-muted"> · {t.description}</span> : null}
                </p>
                <p className="truncate text-caption font-normal text-fg-muted">
                  {formatDateTime(t.createdAt)} · {sourceLabel(t.source)}
                  {t.amountCents != null ? ` · ${formatMoney(t.amountCents)}` : ""}
                  {t.reversedAt ? " · Reversed" : ""}
                </p>
              </div>
              <span className={cn("shrink-0 text-meta tabular", t.reversedAt ? "text-fg-subtle line-through" : "text-fg")}>
                {t.points >= 0 ? "+" : ""}
                {t.points}
              </span>
              {manager && !t.reversedAt && t.type !== "reversal" && new Date(t.createdAt).getTime() > recentCutoff ? (
                <button type="button" aria-label={`Reverse ${t.type.replace(/_/g, " ")} of ${t.points}`} title="Reverse" onClick={() => setReverseTx(t)} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg">
                  <Undo2 aria-hidden className="size-3.5" />
                </button>
              ) : (
                <span className="size-7 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-y border-line py-6 text-meta text-fg-muted">No activity yet.</p>
      )}
    </Section>
  );

  const redemptions = (
    <Section title="Rewards redeemed">
      {d.redemptions.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {d.redemptions.map((r) => (
            <li key={r.id} className="flex min-h-10 items-center justify-between gap-2 text-meta">
              <span className="truncate text-fg">{rewardName(r.rewardId)}</span>
              <span className="shrink-0 text-fg-muted">
                {formatDate(r.createdAt)} · {r.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-y border-line py-3 text-meta text-fg-muted">None yet.</p>
      )}
    </Section>
  );

  const notesBlock = (
    <Section title="Notes and tags" description="Internal. Your staff can see these; the customer can't.">
      <TextField type="textarea" label="Notes" hideLabel value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="Allergic to nuts. Likes oat milk." />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {c.tags.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded-full border border-line ps-2.5 pe-1 text-caption font-normal text-fg">
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={async () => {
                const r = await save.run(() => api.updateCustomer(c.memberId, { tags: c.tags.filter((x) => x !== t) }));
                if (r) onChange(r);
              }}
              className="inline-flex size-4 items-center justify-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <form
          className="inline-flex"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!tag.trim()) return;
            const r = await save.run(() => api.updateCustomer(c.memberId, { tags: [...c.tags, tag.trim()] }));
            if (r) {
              onChange(r);
              setTag("");
            }
          }}
        >
          <label className="sr-only" htmlFor={`tag-${c.memberId}`}>
            Add a tag
          </label>
          <input id={`tag-${c.memberId}`} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ Add tag" className="h-6 w-24 rounded-full border border-dashed border-line px-2.5 text-caption font-normal text-fg outline-none placeholder:text-fg-muted focus:border-fg" />
        </form>
      </div>
      {save.error ? <p className="mt-2 text-meta text-negative">{save.error}</p> : null}
      <div className="mt-3">
        <Button
          variant="secondary"
          size="sm"
          loading={save.busy}
          disabled={notes === (c.notes ?? "")}
          onClick={async () => {
            const r = await save.run(() => api.updateCustomer(c.memberId, { notes: notes.trim() || null }));
            if (r) {
              onChange(r);
              toast({ message: "Saved", tone: "success" });
            }
          }}
        >
          Save notes
        </Button>
      </div>
    </Section>
  );

  return (
    <>
      {revealAct.error ? <p className="mb-3 text-meta text-negative">{revealAct.error}</p> : null}
      {c.rewardAvailable ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {c.rewardAvailable ? <Tag tone="accent">Reward ready</Tag> : null}
        </div>
      ) : null}
      {layout === "panel" ? (
        <div className="flex flex-col gap-6">
          {summary}
          {details}
          {ledger}
          {redemptions}
          {notesBlock}
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-8">
            {summary}
            {ledger}
          </div>
          <div className="flex flex-col gap-8">
            {details}
            {redemptions}
            {notesBlock}
          </div>
        </div>
      )}

      <AdjustSheet open={adjustOpen} onClose={() => setAdjustOpen(false)} balance={c.balance} term={term} onDone={reload} memberId={c.memberId} />
      <ConfirmDialog
        open={!!reverseTx}
        onClose={() => {
          setReverseTx(null);
          setReverseReason("");
        }}
        title="Reverse this transaction?"
        body={reverseTx ? `This takes back ${Math.abs(reverseTx.points)} ${term} (${reverseTx.type.replace(/_/g, " ")} on ${formatDate(reverseTx.createdAt)}). The original stays in the history.` : undefined}
        confirmLabel="Reverse"
        danger
        disabled={!reverseReason.trim()}
        onConfirm={async () => {
          await api.reverse(reverseTx!.id, reverseReason.trim());
          toast({ message: "Reversed", tone: "success" });
          await reload();
        }}
      >
        <TextField label="Reason" required value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Wrong customer" />
      </ConfirmDialog>
    </>
  );
}

function AdjustSheet({ open, onClose, balance, term, memberId, onDone }: { open: boolean; onClose: () => void; balance: number; term: string; memberId: string; onDone: () => Promise<void> }) {
  const { api } = useMerchant();
  const toast = useToast();
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey("adjust"));
  const act = useAction();
  const n = Number.parseInt(amount, 10) || 0;
  const after = balance + sign * n;
  const reasonError = tried && !reason ? "A reason is required." : null;
  const amountError = tried && n <= 0 ? "Enter how many to add or remove." : after < 0 ? `They only have ${balance}.` : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Adjust ${term}`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!reason || n <= 0 || after < 0) return;
              const r = await act.run(() => api.adjust(memberId, { points: sign * n, reason: note.trim() ? `${reason}: ${note.trim()}` : reason }, key));
              if (r) {
                toast({ message: `${sign > 0 ? "Added" : "Removed"} ${n} ${term}. New balance ${r.balance}.`, tone: "success" });
                setAmount("");
                setReason("");
                setNote("");
                setTried(false);
                setKey(newIdempotencyKey("adjust"));
                await onDone();
                onClose();
              }
            }}
          >
            Save adjustment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="inline-flex h-9 self-start rounded-input bg-bg-subtle p-0.5" role="radiogroup" aria-label="Add or remove">
          {([1, -1] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={sign === v}
              onClick={() => setSign(v)}
              className={cn("inline-flex items-center gap-1.5 rounded-[8px] px-3 text-meta", sign === v ? "bg-bg font-medium text-fg shadow-[0_0_0_1px_var(--ll-color-line)]" : "text-fg-muted")}
            >
              {v === 1 ? <Plus aria-hidden className="size-3.5" /> : <Minus aria-hidden className="size-3.5" />}
              {v === 1 ? "Add" : "Remove"}
            </button>
          ))}
        </div>
        <TextField label="Amount" type="number" inputMode="numeric" min={1} suffix={term === "points" ? "pts" : term} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} error={amountError} />
        <Select label="Reason" required placeholder="Pick a reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS.map((r) => ({ value: r, label: r }))} error={reasonError} />
        <TextField label="Note" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        <p className="flex items-baseline justify-between border-y border-line py-3 text-meta text-fg-muted">
          <span>New balance: <strong className="font-semibold text-fg tabular">{formatPoints(Math.max(0, after), term)}</strong></span>
          <span className="tabular">was {formatNumber(balance)}</span>
        </p>
        {act.error ? <p className="text-meta text-negative">{act.error}</p> : null}
        <p className="text-caption font-normal text-fg-muted">Adjustments are logged with your name and the reason.</p>
      </div>
    </Modal>
  );
}

