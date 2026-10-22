"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { whatsappApi } from "@ll/shared";
import { DataTable, Dot, EmptyState, ErrorLine, Meter, PageHeader, PageTabs, Panel, Section, SkeletonRows, StatBlock, type Column } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { RestaurantGate, TierTeaser, formatPhone, sentence } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/format";
import { useAction, useApi, useNow, type ApiState } from "@/lib/dashboard/useApi";
import { Broadcast } from "./Broadcast";
import { Setup } from "./Setup";

type Tab = "chats" | "broadcast" | "setup";

export default function WhatsappPage() {
  return (
    <RestaurantGate featureKey="restaurant.whatsapp_notifications" title="WhatsApp">
      <Whatsapp />
    </RestaurantGate>
  );
}

function Whatsapp() {
  const { api, base } = useMerchant();
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<Tab>(initial === "broadcast" || initial === "setup" ? initial : "chats");
  const settings = useApi(() => api.whatsapp.settings(), [api]);
  const sessions = useApi(() => api.whatsapp.sessions(), [api]);

  if (settings.status === 402 || sessions.status === 402) return <TierTeaser featureKey="restaurant.whatsapp_notifications" title="WhatsApp" />;
  const s = settings.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="WhatsApp"
        description="Order updates and offers on the WhatsApp number your customers already message."
        actions={
          <>
            <Button size="sm" variant="secondary" href={`${base}/billing`}>
              Buy a message pack
            </Button>
            <Button size="sm" onClick={() => setTab("broadcast")}>
              New broadcast
            </Button>
          </>
        }
      />
      {settings.error && !s ? <ErrorLine message={settings.error} onRetry={() => void settings.reload()} /> : null}
      <Usage usage={s?.usage ?? null} loading={settings.loading && !s} base={base} />
      {s && !s.connected ? (
        <Banner title="WhatsApp isn't connected yet" action={<Button size="sm" variant="secondary" onClick={() => setTab("setup")}>Connect</Button>}>
          Add your WhatsApp Business number to send order updates. Customers keep messaging the same number.
        </Banner>
      ) : null}
      <PageTabs
        label="WhatsApp sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: "chats", label: "Chats", count: sessions.data?.items.length ?? null },
          { id: "broadcast", label: "Broadcast" },
          { id: "setup", label: "Setup" },
        ]}
      />
      {tab === "chats" ? <Chats sessions={sessions} connected={s?.connected ?? false} onSetup={() => setTab("setup")} /> : null}
      {tab === "broadcast" ? <Broadcast settings={s ?? null} loading={settings.loading && !s} onSetup={() => setTab("setup")} /> : null}
      {tab === "setup" ? s ? <Setup settings={s} onSaved={() => void settings.reload()} /> : <SkeletonRows rows={5} /> : null}
    </div>
  );
}

function Usage({ usage, loading, base }: { usage: whatsappApi.WhatsappUsage | null; loading: boolean; base: string }) {
  const used = usage?.used ?? 0;
  const allowance = usage?.allowance ?? 0;
  return (
    <section aria-label="Message usage" className="flex flex-col gap-3">
      <StatBlock
        label="WhatsApp messages this month"
        loading={loading}
        items={[
          { label: "Used", value: formatNumber(used) },
          { label: "In your plan", value: formatNumber(usage?.planAllowance ?? 0), caption: "Resets each month" },
          { label: "From packs", value: formatNumber(usage?.extra ?? 0), caption: "Used after your plan's" },
          { label: "Left", value: formatNumber(usage?.remaining ?? 0) },
        ]}
      />
      <Meter value={used} max={allowance} label={`${formatNumber(used)} of ${formatNumber(allowance)} WhatsApp messages used`} tone={usage && usage.remaining <= Math.max(10, allowance * 0.1) ? "accent" : "fg"} />
      <p className="text-meta text-fg-muted">
        Each order update and each broadcast message counts as one. Running low?{" "}
        <a className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg" href={`${base}/billing`}>
          Buy a pack of 1,000
        </a>
        .
      </p>
    </section>
  );
}

const SOURCES = [
  { value: "in_store", label: "Told us in person" },
  { value: "form", label: "Paper or web form" },
  { value: "checkout", label: "Ticked the box at checkout" },
  { value: "import", label: "From a list the customer gave us" },
];
const LANGS = [
  { value: "", label: "No preference" },
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "ur", label: "اردو (Urdu)" },
  { value: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
];

function Chats({ sessions, connected, onSetup }: { sessions: ApiState<{ items: whatsappApi.WhatsappSession[] }>; connected: boolean; onSetup: () => void }) {
  const now = useNow();
  const cols: Column<whatsappApi.WhatsappSession>[] = [
    { key: "phone", header: "Customer", mobile: "title", cell: (r) => <span className="font-medium">{formatPhone(r.phone)}</span> },
    { key: "state", header: "Where they are", mobile: "subtitle", cell: (r) => sentence(r.state) },
    { key: "cart", header: "Cart", align: "end", mobile: "subtitle", sortValue: (r) => r.cartItems, cell: (r) => (r.cartItems ? `${r.cartItems} ${r.cartItems === 1 ? "item" : "items"}` : "Empty") },
    {
      key: "window",
      header: "24-hour window",
      mobile: "trailing",
      sortValue: (r) => r.windowOpenUntil,
      cell: (r) => {
        const open = r.windowOpenUntil && new Date(r.windowOpenUntil).getTime() > now;
        return open ? <Dot tone="positive">Open until {new Date(r.windowOpenUntil!).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" })}</Dot> : <Dot>Closed</Dot>;
      },
    },
    { key: "optin", header: "Opt-in", mobile: "hidden", cell: (r) => (r.optedIn ? <Dot tone="positive">Opted in</Dot> : <Dot>Not opted in</Dot>) },
  ];
  return (
    <div className="flex flex-col gap-8">
      <Section title="Recent chats" description="Free-form replies are only allowed while the 24-hour window is open. After that, send an approved template.">
        <DataTable
          caption="Recent WhatsApp chats"
          columns={cols}
          rows={sessions.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={sessions.loading && !sessions.data}
          error={sessions.error}
          onRetry={() => void sessions.reload()}
          empty={
            <EmptyState
              title="No chats yet"
              description="A chat shows up here when a customer messages your WhatsApp number, or when you record their opt-in below."
              action={
                connected ? (
                  <Button size="sm" variant="secondary" onClick={() => document.getElementById("wa-optin-phone")?.focus()}>
                    Record an opt-in
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={onSetup}>
                    Connect WhatsApp
                  </Button>
                )
              }
            />
          }
        />
      </Section>
      <Consent onDone={() => void sessions.reload()} />
    </div>
  );
}

function Consent({ onDone }: { onDone: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("in_store");
  const [language, setLanguage] = useState("");
  const [touched, setTouched] = useState(false);
  const bad = touched && phone.replace(/\D/g, "").length < 7 ? "Enter the customer's full phone number." : null;
  const record = async (kind: "in" | "out") => {
    setTouched(true);
    if (phone.replace(/\D/g, "").length < 7) return;
    const r = await act.run(() => (kind === "in" ? api.whatsapp.optIn({ phone: phone.trim(), source: source as whatsappApi.OptInBody["source"], ...(language ? { language: language as whatsappApi.WaLanguage } : {}) }) : api.whatsapp.optOut(phone.trim())));
    if (r) {
      toast({ message: kind === "in" ? `${formatPhone(r.phone)} can now get WhatsApp messages from you` : `${formatPhone(r.phone)} won't get WhatsApp messages from you`, tone: "success" });
      setPhone("");
      setTouched(false);
      onDone();
    }
  };
  return (
    <Panel title="Record opt-in or opt-out" description="Only record what the customer told you: they said yes at the counter, ticked a box, or replied START. If they ask you to stop, record an opt-out right away.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField id="wa-optin-phone" label="Customer's phone" type="tel" inputMode="tel" autoComplete="off" placeholder="(416) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} error={bad} />
        <Select label="How they agreed" value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES} />
        <Select label="Preferred language" value={language} onChange={(e) => setLanguage(e.target.value)} options={LANGS} />
      </div>
      {act.error ? <p role="alert" className="mt-3 text-meta text-negative">{act.error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" loading={act.busy} onClick={() => void record("in")}>
          Record opt-in
        </Button>
        <Button variant="ghost" size="sm" disabled={act.busy} onClick={() => void record("out")}>
          Record opt-out
        </Button>
      </div>
    </Panel>
  );
}

