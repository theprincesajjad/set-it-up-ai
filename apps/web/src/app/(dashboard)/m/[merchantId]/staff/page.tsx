"use client";
import { Check, KeyRound, UserPlus } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { FeatureTeaser } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { maskPhone } from "@/lib/dashboard/customers";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const ROLES: { value: merchantApi.StaffRole; label: string; desc: string }[] = [
  { value: "staff", label: "Staff", desc: "Counter and Today only. Can undo their own awards for 15 minutes." },
  { value: "manager", label: "Manager", desc: "Everything except billing and removing staff." },
  { value: "owner", label: "Owner", desc: "Everything, including billing and staff." },
];

export default function StaffPage() {
  const { api, role, me } = useMerchant();
  const toast = useToast();
  const state = useApi(() => api.team(), [api]);
  const owner = role === "owner";
  const [invite, setInvite] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<merchantApi.StaffRole>("staff");
  const [pinFor, setPinFor] = useState<merchantApi.StaffMember | null>(null);
  const [pin, setPin] = useState("");
  const [remove, setRemove] = useState<merchantApi.StaffMember | null>(null);
  const act = useAction();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Staff" description="Unlimited staff, always free. Everyone gets their own login and counter PIN." actions={owner ? <Button iconStart={UserPlus} onClick={() => setInvite(true)}>Invite staff</Button> : undefined} />
      <Async state={state}>
        {(d) =>
          d.items.length <= 1 && owner ? (
            <Card>
              <EmptyState icon={UserPlus} title="It's just you so far" description="Add staff so they can award points with their own login. Unlimited, always free." action={<Button onClick={() => setInvite(true)}>Invite staff</Button>} />
            </Card>
          ) : (
            <Card padding="sm">
              <ul className="divide-y divide-border">
                {d.items.map((s) => {
                  const self = s.userId === me.user.id;
                  return (
                    <li key={s.userId} className="flex flex-wrap items-center gap-3 px-2 py-3">
                      <Avatar name={s.name ?? s.email} id={s.userId} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-body-strong text-fg">
                          {s.name ?? s.email ?? "Invited"} {self ? <span className="text-body-sm font-normal text-fg-muted">(you)</span> : null}
                          <Badge tone={s.role === "owner" ? "brand" : s.role === "manager" ? "info" : "neutral"}>{s.role[0]!.toUpperCase() + s.role.slice(1)}</Badge>
                        </p>
                        <p className="text-body-sm text-fg-muted">
                          {s.phone ? maskPhone(s.phone) : s.email} · Added {formatDate(s.createdAt)} · {s.hasPin ? <span className="inline-flex items-center gap-1"><Check aria-hidden className="size-3.5 text-success" />PIN set</span> : "No PIN yet"}
                        </p>
                      </div>
                      {owner && !self ? (
                        <div className="w-40">
                          <Select hideLabel label={`Role for ${s.name ?? "staff"}`} className="min-h-11" value={s.role} onChange={async (e) => {
                            const r = await act.run(() => api.setRole(s.userId, e.target.value as merchantApi.StaffRole));
                            if (r) await state.reload();
                          }} options={ROLES.map((r) => ({ value: r.value, label: r.label }))} />
                        </div>
                      ) : null}
                      {owner || self ? (
                        <Button variant="secondary" size="sm" iconStart={KeyRound} onClick={() => setPinFor(s)}>
                          {s.hasPin ? "Reset PIN" : "Set PIN"}
                        </Button>
                      ) : null}
                      {owner && !self ? (
                        <Button variant="ghost" size="sm" onClick={() => setRemove(s)}>
                          Remove
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )
        }
      </Async>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <FeatureTeaser featureKey="staff.permissions" title="Granular permissions" description="Pick exactly what each person can do, like refunds or catalog edits." />

      <Modal
        open={invite}
        onClose={() => setInvite(false)}
        variant="sheet"
        title="Invite staff"
        actions={
          <>
            <Button variant="secondary" onClick={() => setInvite(false)}>
              Cancel
            </Button>
            <Button
              loading={act.busy}
              onClick={async () => {
                if (!phone && !email.trim()) return act.setError("Add a mobile number or email.");
                const r = await act.run(() => api.invite({ name: name.trim() || undefined, phone: phone ?? undefined, email: email.trim() || undefined, role: newRole }));
                if (r) {
                  toast({ message: `Invite sent to ${name || "your new staff member"}`, tone: "success" });
                  setInvite(false);
                  setName("");
                  setEmail("");
                  setPhone(null);
                  await state.reload();
                }
              }}
            >
              Send invite
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <PhoneField label="Mobile number" hint="We text them a link to sign in." onChangeE164={setPhone} />
          <TextField type="email" label="Email" optionalLabel value={email} onChange={(e) => setEmail(e.target.value)} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label text-fg">Role</legend>
            {ROLES.map((r) => (
              <label key={r.value} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3", newRole === r.value ? "border-brand bg-brand-subtle" : "border-border")}>
                <input type="radio" name="role" checked={newRole === r.value} onChange={() => setNewRole(r.value)} className="mt-1 size-5 accent-[var(--color-brand)]" />
                <span>
                  <span className="block text-body-strong text-fg">{r.label}</span>
                  <span className="block text-body-sm text-fg-muted">{r.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-caption text-fg-muted">Unlimited staff, always free.</p>
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pinFor}
        onClose={() => {
          setPinFor(null);
          setPin("");
        }}
        title={`Counter PIN for ${pinFor?.name ?? "staff"}`}
        body="4 to 6 digits. They use it to switch to themselves on a shared counter device."
        confirmLabel="Save PIN"
        disabled={!/^\d{4,6}$/.test(pin)}
        onConfirm={async () => {
          await api.setPin(pinFor!.userId, pin);
          toast({ message: "PIN saved", tone: "success" });
          await state.reload();
        }}
      >
        <TextField label="PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </ConfirmDialog>
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={`Remove ${remove?.name ?? "this person"} from staff?`}
        body={`${remove?.name ?? "They"} can't award points after this. Their past activity stays in your reports.`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await api.removeStaff(remove!.userId);
          await state.reload();
        }}
      />
    </div>
  );
}
