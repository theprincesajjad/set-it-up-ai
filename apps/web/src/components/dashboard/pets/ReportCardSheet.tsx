"use client";
import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import type { petApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { DAY_DID, DID_LABELS, GROOM_DID, MOOD_LABELS } from "@/lib/dashboard/pets";
import { useAction } from "@/lib/dashboard/useApi";

const SKIPPED: Record<string, string> = { no_phone: "There is no phone number for this owner, so nothing was texted.", quiet: "It is night, so no text was sent. The visit is logged.", opted_out: "This number asked us to stop texting.", no_credits: "Out of texts this month. The visit is logged." };

const Chip = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-meta-strong transition-colors", on ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-bg-subtle")}>
    {children}
  </button>
);

/** A report card after a visit (Figma frame 5): mood and what we did as chips, one optional line, one photo, then a short text with a private link. */
export function ReportCardSheet({ open, onClose, petId, petName, ownerName, kind = "groom", onSent }: { open: boolean; onClose: () => void; petId: string; petName: string; ownerName: string | null; kind?: "groom" | "daycare"; onSent?: () => void }) {
  const { api, detail } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [mood, setMood] = useState<string>("happy");
  const [did, setDid] = useState<string[]>(kind === "groom" ? ["bath", "haircut"] : ["played", "ate"]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [handOver, setHandOver] = useState<{ reason: string; url: string } | null>(null);
  const first = (ownerName ?? "the owner").split(/\s+/)[0];
  const tags = kind === "groom" ? GROOM_DID : DAY_DID;
  const toggle = (k: string) => setDid((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  const preview = `${petName} ${{ happy: "was happy today.", calm: "was calm today.", nervous: "was a bit nervous today.", wiggly: "was full of energy today." }[mood] ?? ""} ${did.map((d) => DID_LABELS[d]).join(", ")}${did.length ? "." : ""} ${note}`.replace(/\s+/g, " ").trim();

  async function pick(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    setErr(null);
    try {
      const r = await api.pets.uploadPhoto(f);
      setPhoto({ url: r.url, name: f.name });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The photo did not upload.");
    } finally {
      setUploading(false);
    }
  }
  async function send(sendText: boolean) {
    const body: petApi.ReportCardBody = { kind, mood: mood as petApi.ReportCardBody["mood"], did: did as never, note: note.trim() || null, photoUrl: photo?.url ?? null, send: sendText };
    const r = await act.run(() => api.pets.reportCard(petId, body));
    if (!r) return;
    onSent?.();
    // The text could not go (no phone, night, STOP): keep the sheet open with the private link so the shop can hand it over.
    if (r.skipped && r.url) {
      setHandOver({ reason: SKIPPED[r.skipped] ?? "Logged", url: r.url });
      return;
    }
    toast({ message: r.sent ? `Sent to ${first}` : "Visit logged", tone: "success" });
    setNote("");
    setPhoto(null);
    onClose();
  }

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label={`Report card for ${petName}`}
      title={`Report card for ${petName}`}
      subtitle={`Goes to ${ownerName ?? "the owner"} by text. ${kind === "groom" ? "It also logs this groom." : "It also logs this daycare day."}`}
      width={520}
      footer={
        handOver ? (
          <Button onClick={() => { setHandOver(null); setNote(""); setPhoto(null); onClose(); }}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => void send(false)} loading={act.busy}>Log without a text</Button>
            <Button onClick={() => void send(true)} loading={act.busy}>Send to {first}</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {handOver ? (
          <Banner tone="warning" title="Not texted">
            {handOver.reason} The report card is saved. Give {first} this private link yourself (it works for 30 days):
            <span className="mt-1 block break-all select-all font-medium text-fg" data-testid="report-link">{handOver.url}</span>
          </Banner>
        ) : null}
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <div className="flex flex-col gap-2">
          <span className="text-meta-strong text-fg-muted">How was {petName}?</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(MOOD_LABELS).map(([k, label]) => (
              <Chip key={k} on={mood === k} onClick={() => setMood(k)}>{label}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-meta-strong text-fg-muted">{kind === "groom" ? "What we did" : "What the day was"}</span>
          <div className="flex flex-wrap gap-2">
            {tags.map((k) => (
              <Chip key={k} on={did.includes(k)} onClick={() => toggle(k)}>{DID_LABELS[k]}</Chip>
            ))}
          </div>
        </div>
        <TextField label="A line from the groomer (optional)" type="textarea" maxLength={280} showCount value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex items-center gap-3">
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" aria-label="Photo" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="secondary" size="sm" iconStart={ImagePlus} loading={uploading} onClick={() => file.current?.click()}>{photo ? "Change photo" : "Add a photo"}</Button>
          <p className="text-meta text-fg-muted">{photo ? `${photo.name}. Shown on a private page for ${first}, gone in 30 days.` : "One photo. It opens from a private link in the text."}</p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-card bg-bg-subtle px-4 py-3.5">
          <p className="text-caption text-fg-muted">Text {first} will get</p>
          <p className="text-meta text-fg">{detail.merchant.name}: {preview} Link to the card. Reply STOP to opt out.</p>
        </div>
      </div>
    </SidePanel>
  );
}
