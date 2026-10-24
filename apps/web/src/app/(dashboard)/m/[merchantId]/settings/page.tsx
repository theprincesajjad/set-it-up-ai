"use client";
import { Download, ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { HoursEditor } from "@/components/dashboard/HoursEditor";
import { PageHeader, PageTabs, Panel, SaveBar } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { TaxStatus } from "@/components/dashboard/TaxStatus";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { ShopLogo } from "@/components/ui/ShopTile";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { BFF_BASE } from "@/lib/api/browser";
import { hoursDraft, hoursFromDraft } from "@/lib/dashboard/hours";
import { useAction } from "@/lib/dashboard/useApi";

type Tab = "profile" | "hours" | "tax" | "counter" | "privacy" | "danger";

export default function SettingsPage() {
  const { detail, role } = useMerchant();
  const params = useSearchParams();
  const want = params.get("tab");
  const [tab, setTab] = useState<Tab>(want === "tax" ? "tax" : "profile");
  const items: { id: Tab; label: string }[] = [
    { id: "profile", label: "Shop profile" },
    { id: "hours", label: "Hours" },
    { id: "tax", label: "Tax" },
    { id: "counter", label: "Counter & receipts" },
    { id: "privacy", label: "Privacy" },
    ...(role === "owner" ? [{ id: "danger" as const, label: "Danger zone" }] : []),
  ];
  return (
    <div className="flex max-w-[860px] flex-col gap-6 pb-20">
      <PageHeader flush title="Settings" description={detail.merchant.name} />
      <PageTabs<Tab> label="Settings" items={items} value={tab} onChange={setTab} />
      {/* Profile and Hours stay mounted so an unsaved draft survives a tab switch; only the active tab shows its save bar. */}
      <div role="tabpanel" hidden={tab !== "profile"}><Profile active={tab === "profile"} /></div>
      <div role="tabpanel" hidden={tab !== "hours"}><HoursTab active={tab === "hours"} /></div>
      {tab === "tax" ? <div role="tabpanel"><TaxStatus owner={role === "owner"} /></div> : null}
      {tab === "counter" || tab === "privacy" || tab === "danger" ? <div role="tabpanel">{tab === "counter" ? <CounterTab /> : tab === "privacy" ? <Privacy /> : <Danger />}</div> : null}
    </div>
  );
}

type ProfileDraft = { name: string; description: string; logoUrl: string; coverUrl: string; brandColor: string; email: string; website: string; instagram: string };
const HEX = /^#[0-9a-fA-F]{6}$/;
const looksLikeUrl = (v: string) => !v.trim() || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v.trim());

function profileErrors(f: ProfileDraft, phone: string | null, phoneDigits: string): Partial<Record<keyof ProfileDraft | "phone", string>> {
  const e: Partial<Record<keyof ProfileDraft | "phone", string>> = {};
  if (!f.name.trim()) e.name = "Add your shop's name.";
  if (!HEX.test(f.brandColor)) e.brandColor = "Use a hex colour like #0B0B0C.";
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "That email doesn't look right.";
  for (const k of ["logoUrl", "coverUrl", "website"] as const) if (!looksLikeUrl(f[k])) e[k] = "Start with https://";
  if (phoneDigits.length > 0 && !phone) e.phone = "Enter all 10 digits.";
  return e;
}

function Profile({ active }: { active: boolean }) {
  const { api, detail, setDetail } = useMerchant();
  const toast = useToast();
  const m = detail.merchant;
  const initial = useMemo<ProfileDraft>(() => ({ name: m.name, description: m.description ?? "", logoUrl: m.logoUrl ?? "", coverUrl: m.coverUrl ?? "", brandColor: m.brandColor ?? "#0B0B0C", email: m.email ?? "", website: m.website ?? "", instagram: m.instagram ?? "" }), [m]);
  const initialDigits = m.phone?.replace(/^\+1/, "") ?? "";
  const [f, setF] = useState<ProfileDraft>(initial);
  const [phone, setPhone] = useState<string | null>(m.phone);
  const [phoneDigits, setPhoneDigits] = useState(initialDigits);
  const [tried, setTried] = useState(false);
  const act = useAction();
  const set = (k: keyof ProfileDraft, v: string) => setF((x) => ({ ...x, [k]: v }));
  const errors = profileErrors(f, phone, phoneDigits);
  const shown = tried ? errors : {};
  const dirty = (Object.keys(initial) as (keyof ProfileDraft)[]).some((k) => f[k] !== initial[k]) || phoneDigits !== initialDigits;
  async function save() {
    setTried(true);
    if (Object.keys(errors).length) return act.setError("Fix the highlighted fields first.");
    const body: merchantApi.UpdateProfileBody = { name: f.name.trim(), description: f.description.trim() || null, logoUrl: f.logoUrl.trim() || null, coverUrl: f.coverUrl.trim() || null, brandColor: f.brandColor, email: f.email.trim() || null, phone, website: f.website.trim() || null, instagram: f.instagram.trim() || null };
    const r = await act.run(() => api.update(body));
    if (r) {
      setDetail(r);
      setTried(false);
      toast({ message: "Saved", tone: "success" });
    }
  }
  return (
    <>
      <Panel>
        <form id="profile-form" className="flex flex-col gap-5" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="flex items-start gap-4">
            <ShopLogo shop={{ name: f.name, vertical: m.vertical, logoUrl: f.logoUrl || null, brandColor: HEX.test(f.brandColor) ? f.brandColor : "#0B0B0C" }} size={72} />
            <div className="min-w-0 flex-1">
              <TextField type="url" label="Logo URL" optionalLabel hint="Square image. Without one we show your initials." value={f.logoUrl} error={shown.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
            </div>
          </div>
          <TextField label="Shop name" value={f.name} error={shown.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
          <TextField type="textarea" label="About your shop" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} showCount />
          <TextField type="url" label="Cover photo URL" optionalLabel value={f.coverUrl} error={shown.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} />
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <TextField label="Brand colour" value={f.brandColor} error={shown.brandColor} onChange={(e) => set("brandColor", e.target.value)} hint="Shown only inside your shop avatar." />
            </div>
            <input type="color" aria-label="Pick brand colour" value={HEX.test(f.brandColor) ? f.brandColor : "#0B0B0C"} onChange={(e) => set("brandColor", e.target.value.toUpperCase())} className="mt-[26px] h-12 w-14 shrink-0 cursor-pointer rounded-input border border-line bg-bg p-1" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField type="email" label="Email" optionalLabel value={f.email} error={shown.email} onChange={(e) => set("email", e.target.value)} />
            <PhoneField label="Shop phone" value={phoneDigits} onChangeDigits={setPhoneDigits} onChangeE164={setPhone} error={shown.phone} />
            <TextField type="url" label="Website" optionalLabel value={f.website} error={shown.website} onChange={(e) => set("website", e.target.value)} />
            <TextField label="Instagram" optionalLabel prefix="@" value={f.instagram} onChange={(e) => set("instagram", e.target.value.replace(/^@/, ""))} />
          </div>
          <div>
            <Button variant="ghost" size="sm" iconEnd={ExternalLink} href={`/shops/${m.slug}`}>
              See your shop page
            </Button>
          </div>
        </form>
      </Panel>
      <SaveBar dirty={dirty && active} error={act.error} onDiscard={() => { setF(initial); setPhoneDigits(initialDigits); setPhone(m.phone); setTried(false); act.setError(null); }}>
        <Button type="submit" form="profile-form" size="sm" loading={act.busy}>
          Save profile
        </Button>
      </SaveBar>
    </>
  );
}

function HoursTab({ active }: { active: boolean }) {
  const { api, detail, setDetail } = useMerchant();
  const toast = useToast();
  const initial = useMemo(() => hoursDraft(detail.merchant.hours), [detail.merchant.hours]);
  const [h, setH] = useState(initial);
  const act = useAction();
  const dirty = JSON.stringify(h) !== JSON.stringify(initial);
  return (
    <>
      <Panel title="Opening hours" description={detail.locations.length > 1 ? `For ${detail.locations[0]?.name}. Edit other locations in Locations.` : "Shown on your shop page and the map."}>
        <HoursEditor value={h} onChange={setH} />
      </Panel>
      <SaveBar dirty={dirty && active} error={act.error} onDiscard={() => { setH(initial); act.setError(null); }}>
        <Button size="sm" loading={act.busy} onClick={async () => {
          const r = await act.run(() => api.update({ hours: hoursFromDraft(h) }));
          if (r) {
            setDetail(r);
            toast({ message: "Hours saved", tone: "success" });
          }
        }}>
          Save hours
        </Button>
      </SaveBar>
    </>
  );
}

function CounterTab() {
  const { api, detail, setDetail, features, role, refresh } = useMerchant();
  const toast = useToast();
  const [receipts, setReceipts] = useState(detail.merchant.smsReceiptsEnabled);
  const act = useAction();
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Receipts">
        <Switch
          label="Text customers a receipt after each award"
          description="Transactional: 'You earned 12 points at your shop. Balance 48.' Muted customers never get one."
          checked={receipts}
          onChange={async (v) => {
            setReceipts(v);
            const r = await act.run(() => api.update({ smsReceiptsEnabled: v }));
            if (r) {
              setDetail(r);
              setReceipts(r.merchant.smsReceiptsEnabled);
              toast({ message: r.merchant.smsReceiptsEnabled ? "SMS receipts on" : "SMS receipts off", tone: "success" });
            } else {
              setReceipts(!v);
            }
          }}
        />
        {act.error ? <Banner tone="warning" className="mt-3">{act.error}</Banner> : null}
      </Panel>
      {role === "owner" ? (
        <Panel title="Early access">
          <Switch
            label="Try new tools in beta"
            description="Beta features turn on for you and your customers before everyone else. You can leave any time."
            checked={features.betaOptIn}
            onChange={async (v) => {
              await act.run(() => api.setBeta(v));
              await refresh();
              toast(v ? "You're in the beta" : "Beta turned off");
            }}
          />
        </Panel>
      ) : null}
    </div>
  );
}

function Privacy() {
  const { api, enabled } = useMerchant();
  // Pricing v2: CSV export is a paid feature (customers.csv_export).
  if (!enabled("customers.csv_export"))
    return (
      <Panel title="Your data" description="Your members and their history belong to you.">
        <p className="text-meta text-fg">Need a copy of your data? Email help@localloyalty.example and we&apos;ll send it within 30 days.</p>
        <p className="mt-3 text-meta text-fg-muted">We keep ledger history for 7 years for tax and dispute reasons. Phone numbers stay masked in lists.</p>
      </Panel>
    );
  return (
    <Panel title="Your data" description="Download every member and every ledger entry as CSV. Customers' other shops are never included.">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" iconStart={Download} href={`${BFF_BASE}${api.base}/customers/export.csv`}>
          Export members
        </Button>
        <Button variant="secondary" iconStart={Download} href={`${BFF_BASE}${api.base}/activity/export.csv`}>
          Export activity
        </Button>
      </div>
      <p className="mt-3 text-meta text-fg-muted">We keep ledger history for 7 years for tax and dispute reasons. Phone numbers stay masked in lists.</p>
    </Panel>
  );
}

function Danger() {
  const { api, detail, setDetail } = useMerchant();
  const [confirm, setConfirm] = useState(false);
  const active = detail.program?.active !== false;
  return (
    <Panel title={active ? "Pause your program" : "Resume your program"} description={active ? "Customers keep their points and can still redeem. New awards stop until you resume." : "Your program is paused. Resume to award points again."}>
      <Button variant={active ? "danger" : "primary"} onClick={() => setConfirm(true)}>
        {active ? "Pause program" : "Resume program"}
      </Button>
      <p className="mt-4 text-meta text-fg-muted">To close your shop or transfer ownership, email help@localloyalty.example. We&apos;ll give members notice and keep their history.</p>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={active ? "Pause your program?" : "Resume your program?"} body={active ? "Customers keep their points and can still redeem." : undefined} confirmLabel={active ? "Pause program" : "Resume program"} danger={active} onConfirm={async () => {
        const p = await api.updateProgram({ active: !active });
        setDetail({ ...detail, program: p });
      }} />
    </Panel>
  );
}
