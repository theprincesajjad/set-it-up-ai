"use client";
import { useState } from "react";
import { translator, type restaurantWebApi } from "@ll/shared";
import { ConfirmDialog, ErrorLine, Sheet, SkeletonRows } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, type ApiState } from "@/lib/dashboard/useApi";
import { halalBanner } from "@/lib/restaurant/halal";

type Cert = restaurantWebApi.HalalCertificationDto;

const SCOPES = [
  { value: "all_meat", label: "All meat" },
  { value: "some_dishes", label: "Some dishes" },
] as const;
const SLAUGHTER = [
  { value: "zabihah", label: "Zabihah (hand slaughter, as you state it)" },
  { value: "machine", label: "Machine slaughter" },
  { value: "unspecified", label: "Not stated" },
] as const;

const SCOPE_NOTE: Record<Cert["scope"], string> = {
  all_meat: "Every meat dish carries the halal claim.",
  some_dishes: "Only the dishes you tag halal carry the claim.",
};
const SLAUGHTER_NOTE: Record<Cert["slaughter"], string> = {
  zabihah: "You state zabihah slaughter.",
  machine: "You state machine slaughter.",
  unspecified: "Slaughter method not stated.",
};

const en = translator("en");
const monthYear = (d: string) => new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const longDate = (d: string) => new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** What guests read, in English, from the same function the customer pages use. */
export function guestsRead(c: Cert): string {
  const b = halalBanner({ scope: c.scope, slaughter: c.slaughter, certifier: c.expired ? null : c.certifier, validUntil: c.validUntil, fileUrl: c.fileUrl, expired: c.expired }, en, monthYear);
  return [b.title, b.sub].filter(Boolean).join(". ");
}

/**
 * The shop's halal certificate, entered once (frame 04): certifier, what it covers, expiry. Customer pages print this block and
 * nothing more; dishes only name a certifier when it is someone else. Owner only: halal claims are the owner's own.
 */
export function HalalCertification({ state }: { state: ApiState<restaurantWebApi.HalalCertificationResponse> }) {
  const { api, role } = useMerchant();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const toast = useToast();

  if (role !== "owner") return <p className="text-meta text-fg-muted">The owner manages the halal certificate. Halal claims are the owner&apos;s own.</p>;
  if (state.status === 402) return null;
  if (state.error && !state.data) return <ErrorLine message={state.error} onRetry={() => void state.reload()} />;
  if (!state.data) return <SkeletonRows rows={2} />;
  const cert = state.data.halalCertification;

  return (
    <section aria-label="Halal certification" className="flex flex-col gap-3">
      {cert ? (
        <dl className="grid overflow-hidden rounded-card border border-line md:grid-cols-[1fr_1fr_1fr_1.1fr] [&>div]:border-line [&>div:not(:first-child)]:border-t md:[&>div:not(:first-child)]:border-s md:[&>div:not(:first-child)]:border-t-0">
          <div className="flex flex-col gap-1 px-5 py-4">
            <dt className="text-meta text-fg-muted">Certifier (shown to guests)</dt>
            <dd className="text-headline text-fg">{cert.certifier}</dd>
            <dd className="text-meta text-fg-muted">{[cert.certificateNo ? `Certificate no. ${cert.certificateNo}` : null, cert.fileUrl ? "Link on file" : null].filter(Boolean).join(" · ") || "No certificate number on file"}</dd>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4">
            <dt className="text-meta text-fg-muted">What it covers</dt>
            <dd className="text-headline text-fg">{SCOPES.find((s) => s.value === cert.scope)!.label}{cert.slaughter !== "unspecified" ? `, ${cert.slaughter}` : ""}</dd>
            <dd className="text-meta text-fg-muted">
              {SCOPE_NOTE[cert.scope]} {SLAUGHTER_NOTE[cert.slaughter]}
            </dd>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4">
            <dt className="text-meta text-fg-muted">Valid until</dt>
            <dd className={cert.expired ? "text-headline text-negative" : "text-headline text-fg"}>{cert.validUntil ? longDate(cert.validUntil) : "No date"}</dd>
            <dd className="text-meta text-fg-muted">
              {cert.expired ? "Expired. Guests see “Certificate expired, ask the restaurant” and no certifier name." : cert.daysLeft !== null && cert.daysLeft <= 60 ? `${cert.daysLeft} days left. We remind you at 60 and 30 days.` : cert.validUntil ? "We remind you 60 and 30 days before." : "Add a date and we will remind you before it ends."}
            </dd>
          </div>
          <div className="flex flex-col items-start gap-2 px-5 py-4">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit certification
            </Button>
            <p className="text-meta text-fg-muted">
              <span aria-hidden className="me-1.5 inline-block size-1.5 rounded-full bg-positive align-middle" />
              Guests read: {guestsRead(cert)}
            </p>
          </div>
        </dl>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-card border border-line px-5 py-4">
          <div>
            <h2 className="text-body-strong text-fg">Add your halal certificate</h2>
            <p className="text-meta text-fg-muted">Say who certifies you, what it covers and when it ends. Guests see it once on your shop page and menu, and we remind you before it expires.</p>
          </div>
          <Button size="sm" onClick={() => setEditing(true)}>
            Add certification
          </Button>
        </div>
      )}
      <p className="text-meta text-fg-muted">Halal claims are yours. We print the certifier only when you name one, never claim halal for you, and show uncertified dishes without a halal tag.</p>
      <CertSheet
        key={`${editing}:${cert?.certifier ?? ""}`}
        open={editing}
        cert={cert}
        onClose={() => setEditing(false)}
        onRemove={cert ? () => { setEditing(false); setRemoving(true); } : undefined}
        onSaved={() => {
          setEditing(false);
          toast({ message: "Halal certification saved", tone: "success" });
          void state.reload();
        }}
      />
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title="Remove your halal certification?"
        body="Guests will no longer see a certifier on your shop page or menu. Dishes you tagged halal keep their tag."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await api.halalCertification.remove();
          setRemoving(false);
          toast({ message: "Halal certification removed", tone: "success" });
          await state.reload();
        }}
      />
    </section>
  );
}

function CertSheet({ open, cert, onClose, onSaved, onRemove }: { open: boolean; cert: Cert | null; onClose: () => void; onSaved: () => void; onRemove?: () => void }) {
  const { api } = useMerchant();
  const act = useAction();
  const [certifier, setCertifier] = useState(cert?.certifier ?? "");
  const [scope, setScope] = useState<Cert["scope"]>(cert?.scope ?? "all_meat");
  const [slaughter, setSlaughter] = useState<Cert["slaughter"]>(cert?.slaughter ?? "unspecified");
  const [no, setNo] = useState(cert?.certificateNo ?? "");
  const [until, setUntil] = useState(cert?.validUntil ?? "");
  const [file, setFile] = useState(cert?.fileUrl ?? "");
  const [tried, setTried] = useState(false);
  const missing = !certifier.trim();
  const badLink = !!file.trim() && !/^https:\/\//i.test(file.trim());

  const save = async () => {
    setTried(true);
    if (missing || badLink) return;
    const r = await act.run(() => api.halalCertification.save({ certifier: certifier.trim(), scope, slaughter, ...(no.trim() ? { certificateNo: no.trim() } : {}), ...(until ? { validUntil: until } : {}), ...(file.trim() ? { fileUrl: file.trim() } : {}) }));
    if (r) onSaved();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Halal certification"
      title="Halal certification"
      subtitle="Exactly as your certificate says. We print it, we do not verify it."
      footer={
        <>
          {onRemove ? (
            <Button variant="ghost" size="sm" className="me-auto" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={act.busy} onClick={() => void save()}>
            Save certification
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Certifier" placeholder="Name on your certificate" value={certifier} maxLength={120} onChange={(e) => setCertifier(e.target.value)} error={tried && missing ? "Name your certifier. We print no halal claim without one." : null} hint="Shown to guests exactly as you type it." />
        <Select label="What it covers" value={scope} onChange={(e) => setScope(e.target.value as Cert["scope"])} options={SCOPES.map((s) => ({ ...s }))} />
        <Select label="Slaughter method" value={slaughter} onChange={(e) => setSlaughter(e.target.value as Cert["slaughter"])} options={SLAUGHTER.map((s) => ({ ...s }))} hint="Only say zabihah if your certificate does." />
        <TextField label="Certificate number" optionalLabel value={no} maxLength={60} onChange={(e) => setNo(e.target.value)} />
        <TextField label="Valid until" type="date" optionalLabel value={until} onChange={(e) => setUntil(e.target.value)} hint="We remind you 60 and 30 days before." />
        <TextField label="Link to the certificate" optionalLabel type="url" inputMode="url" placeholder="https://" value={file} onChange={(e) => setFile(e.target.value)} error={tried && badLink ? "The link has to start with https://" : null} hint="A PDF or page guests can open from your shop page." />
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      </div>
    </Sheet>
  );
}
