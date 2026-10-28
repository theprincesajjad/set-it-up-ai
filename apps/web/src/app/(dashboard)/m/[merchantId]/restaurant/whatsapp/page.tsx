"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader, PageTabs, SkeletonRows, ErrorLine } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { RestaurantGate, TierTeaser } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { Broadcast } from "./Broadcast";
import { Consent } from "./Consent";
import { Inbox } from "./Inbox";
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
  const sessions = useApi(() => api.whatsapp.sessions(), [api], { pollMs: 15_000 });

  if (settings.status === 402 || sessions.status === 402) return <TierTeaser featureKey="restaurant.whatsapp_notifications" title="WhatsApp" />;
  const s = settings.data;
  const u = s?.usage;
  const low = !!u && u.remaining <= Math.max(10, u.allowance * 0.1);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="WhatsApp"
        description="The number your guests already message: orders, pay links and festival offers."
        actions={
          <>
            {/* One state at a time: an unconnected number shows the Connect banner, not a message count. */}
            {u && s?.connected ? (
              <a href={`${base}/billing`} title={`${formatNumber(u.used)} used · ${formatNumber(u.planAllowance)} in your plan · ${formatNumber(u.extra)} from packs. Tap to buy a pack of 1,000.`} className="inline-flex h-[38px] items-center rounded-full border border-line px-4 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring">
                <span className={low ? "text-points-text" : undefined}>{formatNumber(u.remaining)}</span>&nbsp;of {formatNumber(u.allowance)} messages left
              </a>
            ) : null}
            <Button size="md" onClick={() => setTab("broadcast")}>
              New broadcast
            </Button>
          </>
        }
      />
      {settings.error && !s ? <ErrorLine message={settings.error} onRetry={() => void settings.reload()} /> : null}
      {s && !s.connected ? (
        <Banner title="WhatsApp isn't connected yet" action={<Button size="sm" variant="secondary" onClick={() => setTab("setup")}>Connect</Button>}>
          Add your WhatsApp Business number to send order updates. Guests keep messaging the same number.
        </Banner>
      ) : null}
      <PageTabs
        label="WhatsApp sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: "chats", label: "Chats", count: sessions.data?.items.length ?? null },
          { id: "broadcast", label: "Broadcasts" },
          { id: "setup", label: "Setup" },
        ]}
      />
      {tab === "chats" ? <Inbox sessions={sessions} connected={s?.connected ?? false} onSetup={() => setTab("setup")} onTemplates={() => setTab("broadcast")} /> : null}
      {tab === "broadcast" ? <Broadcast settings={s ?? null} loading={settings.loading && !s} onSetup={() => setTab("setup")} /> : null}
      {tab === "setup" ? (
        s ? (
          <div className="flex flex-col gap-8">
            <Setup settings={s} onSaved={() => void settings.reload()} />
            <Consent onDone={() => void sessions.reload()} />
          </div>
        ) : (
          <SkeletonRows rows={5} />
        )
      ) : null}
    </div>
  );
}
