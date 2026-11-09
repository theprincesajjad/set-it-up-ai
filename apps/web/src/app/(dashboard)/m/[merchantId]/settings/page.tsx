"use client";
import { ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { merchantApi, ThemeStyle } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { HoursEditor } from "@/components/dashboard/HoursEditor";
import { PageHeader, PageTabs, Panel, SaveBar } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { YourDataPanel } from "@/components/dashboard/YourDataPanel";
import { SiteRefresh } from "@/components/dashboard/SiteRefresh";
import { WalletCardSettings } from "@/components/dashboard/wallet/WalletCardSettings";
import { PeopleSettings } from "@/components/dashboard/inbox/PeopleSettings";
import { TaxStatus } from "@/components/dashboard/TaxStatus";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion";
import { Banner } from "@/components/ui/Banner";
import { ColorField } from "@/components/ui/ColorField";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { ShopLogo } from "@/components/ui/ShopTile";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { useThemeStyle } from "@/components/ui/ThemeStyle";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { writeThemeCookie } from "@/lib/theme";
import { rolesV3 } from "@ll/design-tokens";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { hoursDraft, hoursFromDraft } from "@/lib/dashboard/hours";
import { useAction } from "@/lib/dashboard/useApi";

type Tab = "profile" | "hours" | "tax" | "counter" | "wallet" | "appearance" | "messages" | "privacy" | "danger";

export default function SettingsPage() {
  const { detail, role } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const params = useSearchParams();
  const want = params.get("tab");
  const [tab, setTab] = useState<Tab>(want === "tax" || want === "hours" || want === "appearance" || want === "messages" || want === "wallet" ? want : "profile");
  // Remounts the profile form after "Refresh from my website" saved, so its draft starts from the new values.
  const [profileKey, setProfileKey] = useState(0);
  const items: { id: Tab; label: string }[] = [
    { id: "profile", label: "Shop profile" },
    { id: "hours", label: "Hours" },
    { id: "tax", label: "Tax" },
    { id: "counter", label: "Counter & receipts" },
    { id: "wallet", label: t("dw.wcard.tab") },
    ...(role === "owner" || role === "manager" ? [{ id: "appearance" as const, label: t("settings.appearance.tab") }] : []),
    // phase-solo D: Instagram, reminders and messages, intake questions, the second chair.
    ...(role === "owner" || role === "manager" ? [{ id: "messages" as const, label: t("people.settings.tab") }] : []),
    { id: "privacy", label: "Privacy" },
    ...(role === "owner" ? [{ id: "danger" as const, label: "Pause or close" }] : []),
  ];
  return (
    <div className="flex max-w-[1080px] flex-col gap-6 pb-20 lg:grid lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-x-8">
      <PageHeader flush title="Settings" description={detail.merchant.name} className="lg:col-span-2" />
      <PageTabs<Tab> label="Settings" items={items} value={tab} onChange={setTab} sideOnDesktop className="lg:row-span-8" />
      {/* Profile and Hours stay mounted so an unsaved draft survives a tab switch; only the active tab shows its save bar. */}
      <div role="tabpanel" hidden={tab !== "profile"} className="flex flex-col gap-6">
        {/* Wave O: read the shop's website again and take the fields that changed (owner and manager). */}
        {role === "owner" || role === "manager" ? <SiteRefresh onApplied={() => setProfileKey((k) => k + 1)} /> : null}
        <Profile key={profileKey} active={tab === "profile"} />
      </div>
      <div role="tabpanel" hidden={tab !== "hours"}><HoursTab active={tab === "hours"} /></div>
      {tab === "tax" ? <div role="tabpanel"><TaxStatus owner={role === "owner"} /></div> : null}
      {tab === "counter" || tab === "privacy" || tab === "danger" ? <div role="tabpanel">{tab === "counter" ? <CounterTab /> : tab === "privacy" ? <Privacy /> : <Danger />}</div> : null}
      {tab === "wallet" ? <div role="tabpanel"><WalletCardSettings active={tab === "wallet"} /></div> : null}
      {tab === "appearance" ? <div role="tabpanel"><Appearance /></div> : null}
      {tab === "messages" ? <div role="tabpanel"><PeopleSettings /></div> : null}
    </div>
  );
}

type ProfileDraft = { name: string; description: string; logoUrl: string; coverUrl: string; brandColor: string; email: string; website: string; instagram: string };
const HEX = /^#[0-9a-fA-F]{6}$/;
/** A shop with no brand colour yet shows the ink (light foreground) as its tile colour. */
const DEFAULT_BRAND: string = rolesV3.light.foreground;
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
  const initial = useMemo<ProfileDraft>(() => ({ name: m.name, description: m.description ?? "", logoUrl: m.logoUrl ?? "", coverUrl: m.coverUrl ?? "", brandColor: m.brandColor ?? DEFAULT_BRAND, email: m.email ?? "", website: m.website ?? "", instagram: m.instagram ?? "" }), [m]);
  const initialDigits = m.phone?.replace(/^\+1/, "") ?? "";
  const [f, setF] = useState<ProfileDraft>(initial);
  const [phone, setPhone] = useState<string | null>(m.phone);
  const [phoneDigits, setPhoneDigits] = useState(initialDigits);
  const [tried, setTried] = useState(false);
  const [colorKey, setColorKey] = useState(0);
  const { t } = useLocaleOrEnglish();
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
          <TextField label="Shop name" autoComplete="organization" value={f.name} error={shown.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
          <TextField type="textarea" label="About your shop" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} showCount />
          {/* Wave Q: the brand colour is the kit ColorField (trade swatches, your own colour, hex, a live contrast sample); the logo and
              cover links fold into an Accordion under it, since most shops never paste one. */}
          <section aria-labelledby="look-h" className="flex flex-col gap-4 border-y border-line py-5">
            <div className="flex items-center gap-4">
              <ShopLogo shop={{ name: f.name, vertical: m.vertical, logoUrl: f.logoUrl || null, brandColor: HEX.test(f.brandColor) ? f.brandColor : DEFAULT_BRAND }} size={64} />
              <div className="min-w-0">
                <h2 id="look-h" className="text-body-strong text-fg">{t("ownq.set.look")}</h2>
                <p className="text-meta text-fg-muted">Colours your shop page, join page and customer card. We adjust it if text would be hard to read.</p>
              </div>
            </div>
            <ColorField key={colorKey} label="Brand colour" value={HEX.test(f.brandColor) ? f.brandColor : null} onChange={(c) => set("brandColor", c ?? DEFAULT_BRAND)} vertical={m.vertical} />
            {shown.brandColor ? <p className="text-meta font-medium text-negative">{shown.brandColor}</p> : null}
            <Accordion defaultValue={f.logoUrl || f.coverUrl || shown.logoUrl || shown.coverUrl ? ["links"] : []} className="rounded-input border border-line px-4">
              <AccordionItem value="links">
                <AccordionTrigger className="min-h-12 items-center text-body font-[550] text-fg hover:no-underline">{t("ownq.set.links")}</AccordionTrigger>
                <AccordionContent keepMounted className="flex flex-col gap-4 pb-4 text-body">
                  <TextField type="url" label="Logo URL" autoComplete="off" autoCapitalize="none" spellCheck={false} optionalLabel hint="Square image. Without one we show your initials." value={f.logoUrl} error={shown.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
                  <TextField type="url" label="Cover photo URL" autoComplete="off" autoCapitalize="none" spellCheck={false} optionalLabel value={f.coverUrl} error={shown.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField type="email" label="Email" autoComplete="email" autoCapitalize="none" spellCheck={false} optionalLabel value={f.email} error={shown.email} onChange={(e) => set("email", e.target.value)} />
            <PhoneField label="Shop phone" value={phoneDigits} onChangeDigits={setPhoneDigits} onChangeE164={setPhone} error={shown.phone} />
            <TextField type="url" label="Website" autoComplete="url" autoCapitalize="none" spellCheck={false} optionalLabel value={f.website} error={shown.website} onChange={(e) => set("website", e.target.value)} />
            <TextField label="Instagram" autoComplete="off" autoCapitalize="none" spellCheck={false} optionalLabel prefix="@" value={f.instagram} onChange={(e) => set("instagram", e.target.value.replace(/^@/, ""))} />
          </div>
          <div>
            <Button variant="ghost" size="sm" iconEnd={ExternalLink} href={`/shops/${m.slug}`}>
              See your shop page
            </Button>
          </div>
        </form>
      </Panel>
      <SaveBar dirty={dirty && active} error={act.error} onDiscard={() => { setF(initial); setColorKey((k) => k + 1); setPhoneDigits(initialDigits); setPhone(m.phone); setTried(false); act.setError(null); }}>
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
          label="Text customers a receipt each time they earn"
          description="A short text with what they earned and their new balance. Customers who muted your shop never get one."
          checked={receipts}
          onChange={async (v) => {
            setReceipts(v);
            const r = await act.run(() => api.update({ smsReceiptsEnabled: v }));
            if (r) {
              setDetail(r);
              setReceipts(r.merchant.smsReceiptsEnabled);
              toast({ message: r.merchant.smsReceiptsEnabled ? "Text receipts are on" : "Text receipts are off", tone: "success" });
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
            label="Try new tools early"
            description="New tools turn on for you and your customers before everyone else. You can switch this off any time."
            checked={features.betaOptIn}
            onChange={async (v) => {
              await act.run(() => api.setBeta(v));
              await refresh();
              toast(v ? "Early access is on" : "Early access is off");
            }}
          />
        </Panel>
      ) : null}
    </div>
  );
}

/** Clear (default) or Main Street Warm, and Clear's opt-in graphite dark. Saves at once and re-themes the page without a reload. */
function Appearance() {
  const { api, detail, setDetail, merchantId } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const theme = useThemeStyle();
  const toast = useToast();
  const act = useAction();
  const [style, setStyle] = useState<ThemeStyle>(detail.merchant.themeStyle ?? "clear");
  const [dark, setDark] = useState(!!detail.merchant.themeDark);
  async function save(next: { style: ThemeStyle; dark: boolean }) {
    const before = { style, dark };
    setStyle(next.style);
    setDark(next.dark);
    const r = await act.run(() => api.update({ themeStyle: next.style, themeDark: next.dark }));
    if (!r) {
      setStyle(before.style);
      setDark(before.dark);
      return;
    }
    setDetail(r);
    const saved = { style: r.merchant.themeStyle, dark: r.merchant.themeDark };
    writeThemeCookie(merchantId, saved);
    theme.preview(saved);
    toast({ message: t("settings.appearance.saved"), tone: "success" });
  }
  return (
    <Panel title={t("settings.appearance.title")} description={t("settings.appearance.description")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span id="appearance-style" className="text-body-strong text-foreground">{t("settings.appearance.style")}</span>
          <SegmentedControl<ThemeStyle>
            label={t("settings.appearance.style")}
            options={[{ value: "clear", label: t("settings.appearance.clear") }, { value: "warm", label: t("settings.appearance.warm") }]}
            value={style}
            onChange={(v) => void save({ style: v, dark: v === "clear" ? dark : false })}
            className="self-start"
          />
          <p className="text-meta text-muted-foreground">{style === "clear" ? t("settings.appearance.clearHint") : t("settings.appearance.warmHint")}</p>
        </div>
        {style === "clear" ? (
          <Switch label={t("settings.appearance.dark")} description={t("settings.appearance.darkHint")} checked={dark} disabled={act.busy} onChange={(v) => void save({ style: "clear", dark: v })} />
        ) : null}
        {act.error ? <Banner tone="warning">{act.error}</Banner> : null}
      </div>
    </Panel>
  );
}

function Privacy() {
  return <YourDataPanel />;
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
