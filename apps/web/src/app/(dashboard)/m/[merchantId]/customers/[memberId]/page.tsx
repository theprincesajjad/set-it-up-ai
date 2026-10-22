"use client";
import { ArrowLeft, Eye, Minus, Plus, SlidersHorizontal, Undo2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { PointsRing } from "@/components/ui/PointsRing";
import { Select } from "@/components/ui/Select";
import { StampCard } from "@/components/ui/StampCard";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { newIdempotencyKey } from "@/lib/api/client";
import { formatDate, formatDateTime, formatDateYear, formatMoney, formatPoints } from "@/lib/format";
import { formatE164 } from "@/lib/phone";
import { CONSENT_LABEL, consentState, maskPhone } from "@/lib/dashboard/customers";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";
import { sourceLabel } from "@/lib/dashboard/labels";

const REASONS = ["Missed at the counter", "Goodwill", "Correction", "Migration fix", "Other"];

export default function CustomerDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.customer(memberId), [api, memberId]);
  const rewards = useApi(() => api.rewards(), [api]);
  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/customers`} className="self-start">
        Customers
      </Button>
      <Async state={state}>{(d) => <Detail d={d} rewards={rewards.data?.items ?? []} onChange={(n) => state.setData(n)} reload={state.reload} />}</Async>
    </div>
  );
}

function Detail({ d, rewards, onChange, reload }: { d: merchantApi.CustomerDetail; rewards: merchantApi.Reward[]; onChange: (d: merchantApi.CustomerDetail) => void; reload: () => Promise<void> }) {
  const { api, detail, role } = useMerchant();
  const toast = useToast();
  const c = d.customer;
  const program = detail.program;
  const term = program?.terminology ?? "points";
  const manager = role !== "staff";
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
  const next = active.find((r) => r.pointsCost > c.balance) ?? active[active.length - 1];
  const rewardName = (id: string) => rewards.find((r) => r.id === id)?.name ?? "Reward";
  const recentCutoff = useNow() - 90 * 86_400_000;

  return (
    <>
      <header className="flex flex-wrap items-center gap-4">
        <Avatar name={c.name} id={c.memberId} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 text-fg">{c.name ?? "No name"}</h1>
          <p className="text-body-sm text-fg-muted">
            <span className="tabular-nums">{fullPhone !== undefined ? formatE164(fullPhone) || "No phone" : maskPhone(c.phone)}</span>
            {manager && c.phone && fullPhone === undefined ? (
              <>
                {" "}
                <button
                  type="button"
                  disabled={revealAct.busy}
                  onClick={async () => {
                    // Audit-logged on the server (customer.phone_revealed).
                    const r = await revealAct.run(() => api.revealPhone(c.memberId));
                    if (r) setFullPhone(r.phone);
                  }}
                  className="inline-flex min-h-11 items-center gap-1 font-medium text-fg-link hover:underline disabled:opacity-60"
                  aria-label={`Reveal phone for ${c.name ?? "member"}`}
                >
                  <Eye aria-hidden className="size-4" /> Reveal
                </button>
              </>
            ) : null}{" "}
            · Joined {formatDateYear(c.joinedAt)} {c.joinedVia ? `via ${c.joinedVia.replace(/_/g, " ")}` : ""} · Member code {c.memberCode}
          </p>
          {revealAct.error ? <p className="text-caption text-danger">{revealAct.error}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {c.vipLevel ? <Badge tone="brand">VIP {c.vipLevel.name}</Badge> : null}
            <Badge tone={s === "opted_in" ? "success" : "neutral"}>{CONSENT_LABEL[s]}</Badge>
            {c.rewardAvailable ? <Badge tone="accent">Reward ready</Badge> : null}
            {c.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="lg">
            <div className="flex flex-wrap items-center gap-6">
              {program?.earnType === "stamps" ? (
                <StampCard className="w-full max-w-sm shadow-none" stamps={c.balance} goal={program.stampGoal} rewardName={next?.name ?? "reward"} vertical={detail.merchant.vertical} terminology={term} />
              ) : (
                <PointsRing balance={c.balance} goal={next?.pointsCost ?? 0} terminology={term} rewardName={next?.name} size={120} />
              )}
              <div className="flex flex-col gap-1">
                <p className="text-overline uppercase text-fg-muted">Balance</p>
                <p className="text-stat tabular-nums text-fg">{formatPoints(c.balance, term, false)}</p>
                <p className="text-body-sm text-fg-muted">
                  {c.visitCount} {c.visitCount === 1 ? "visit" : "visits"} · {formatMoney(c.totalSpendCents)} spent · {formatPoints(c.lifetimePoints, term)} lifetime
                </p>
                <p className="text-caption text-fg-muted">{program?.expiryDisclosure}</p>
                {manager ? (
                  <Button variant="secondary" iconStart={SlidersHorizontal} className="mt-2 self-start" onClick={() => setAdjustOpen(true)}>
                    Adjust {term}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <CardHeader title="Activity" subtitle="Every change to this balance, newest first." />
            {d.transactions.length ? (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full text-body-sm">
                  <caption className="sr-only">Ledger history</caption>
                  <thead className="text-label text-fg-muted">
                    <tr>
                      <th scope="col" className="px-2 py-2 text-start">Date</th>
                      <th scope="col" className="px-2 py-2 text-start">Type</th>
                      <th scope="col" className="px-2 py-2 text-end capitalize">{term}</th>
                      <th scope="col" className="hidden px-2 py-2 text-end sm:table-cell">Purchase</th>
                      <th scope="col" className="hidden px-2 py-2 text-start md:table-cell">Source</th>
                      <th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.transactions.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                        <td className="px-2 py-2">
                          <span className="capitalize">{t.type.replace(/_/g, " ")}</span>
                          {t.description ? <span className="block text-caption text-fg-muted">{t.description}</span> : null}
                          {t.reversedAt ? <Badge className="mt-1">Reversed</Badge> : null}
                        </td>
                        <td className={`px-2 py-2 text-end tabular-nums ${t.points >= 0 ? "text-fg-brand" : "text-fg"}`}>
                          {t.points >= 0 ? "+" : ""}
                          {t.points}
                        </td>
                        <td className="hidden px-2 py-2 text-end tabular-nums sm:table-cell">{t.amountCents != null ? formatMoney(t.amountCents) : "–"}</td>
                        <td className="hidden px-2 py-2 md:table-cell">{sourceLabel(t.source)}</td>
                        <td className="px-2 py-2 text-end">
                          {manager && !t.reversedAt && t.type !== "reversal" && new Date(t.createdAt).getTime() > recentCutoff ? (
                            <IconButton icon={Undo2} label={`Reverse ${t.type.replace(/_/g, " ")} of ${t.points}`} size={40} onClick={() => setReverseTx(t)} />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-body-sm text-fg-muted">No activity yet.</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card padding="lg">
            <CardHeader title="Messages" />
            <p className="text-body text-fg">{s === "opted_in" ? "Gets your offers by email and text." : s === "muted" ? "Muted your shop in the app. No offers." : "Hasn't agreed to offers. Only receipts and order updates."}</p>
            {c.marketingConsentAt ? (
              <p className="mt-1 text-body-sm text-fg-muted">
                Opted in {formatDateYear(c.marketingConsentAt)}
                {c.marketingConsentSource ? ` via ${c.marketingConsentSource.replace(/_/g, " ")}` : ""}
              </p>
            ) : null}
          </Card>

          <Card padding="lg">
            <CardHeader title="Rewards redeemed" />
            {d.redemptions.length ? (
              <ul className="flex flex-col gap-2">
                {d.redemptions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-body-sm">
                    <span className="text-fg">{rewardName(r.rewardId)}</span>
                    <span className="text-fg-muted">
                      {formatDate(r.createdAt)} · {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-fg-muted">None yet.</p>
            )}
          </Card>

          <Card padding="lg">
            <CardHeader title="Notes and tags" subtitle="Internal. Your staff can see these; the customer can't." />
            <TextField type="textarea" label="Notes" hideLabel value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="Allergic to nuts. Likes oat milk." />
            <div className="mt-3 flex flex-wrap gap-2">
              {c.tags.map((t) => (
                <Chip key={t} selected onClick={async () => {
                  const r = await save.run(() => api.updateCustomer(c.memberId, { tags: c.tags.filter((x) => x !== t) }));
                  if (r) onChange(r);
                }}>
                  {t}
                </Chip>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
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
              <TextField label="Add a tag" hideLabel placeholder="Add a tag" value={tag} onChange={(e) => setTag(e.target.value)} />
              <Button type="submit" variant="secondary">
                Add
              </Button>
            </form>
            {save.error ? <Banner tone="danger" className="mt-3">{save.error}</Banner> : null}
            <Button
              className="mt-3"
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
          </Card>
        </div>
      </div>

      <AdjustSheet open={adjustOpen} onClose={() => setAdjustOpen(false)} balance={c.balance} term={term} onDone={async () => { await reload(); }} memberId={c.memberId} />
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
      variant="sheet"
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
        <div className="flex gap-2" role="radiogroup" aria-label="Add or remove">
          <Chip selected={sign === 1} onClick={() => setSign(1)} icon={<Plus aria-hidden className="size-4" />}>
            Add
          </Chip>
          <Chip selected={sign === -1} onClick={() => setSign(-1)} icon={<Minus aria-hidden className="size-4" />}>
            Remove
          </Chip>
        </div>
        <TextField label="Amount" type="number" inputMode="numeric" min={1} suffix={term === "points" ? "pts" : term} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} error={amountError} />
        <Select label="Reason" required placeholder="Pick a reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS.map((r) => ({ value: r, label: r }))} error={reasonError} />
        <TextField label="Note" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        <p className="rounded-md bg-surface-sunken px-4 py-3 text-body text-fg">
          New balance: <strong className="tabular-nums">{formatPoints(Math.max(0, after), term)}</strong>
        </p>
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <p className="text-caption text-fg-muted">Adjustments are logged with your name and the reason.</p>
      </div>
    </Modal>
  );
}
