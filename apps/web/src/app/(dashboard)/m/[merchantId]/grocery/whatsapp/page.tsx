"use client";
/**
 * WhatsApp for grocers (grocery.whatsapp_orders), docs/research/grocers.md frame D7: customers send their order as a list ("2 kg
 * goat curry cut, 1 atta 20 lb for tomorrow 5 pm"); staff answer inside the 24 hour window and turn the list into a pick-up order
 * in about a minute (the same inbox, order sheet and pay links the restaurant pack has). No bot reads the list: weights and cuts
 * are the butcher's call. Broadcasts stay a restaurant feature; flyer and restock texts go by SMS.
 */
import { useState } from "react";
import { PageHeader, PageTabs, SkeletonRows } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/dashboard/useApi";
import { Consent } from "../../restaurant/whatsapp/Consent";
import { Inbox } from "../../restaurant/whatsapp/Inbox";
import { Setup } from "../../restaurant/whatsapp/Setup";

export default function GroceryWhatsappPage() {
  return (
    <FeatureGate keys={["grocery.whatsapp_orders"]} title="WhatsApp">
      <Whatsapp />
    </FeatureGate>
  );
}

type Tab = "chats" | "setup";

function Whatsapp() {
  const { api } = useMerchant();
  const [tab, setTab] = useState<Tab>("chats");
  const settings = useApi(() => api.whatsapp.settings(), [api]);
  const sessions = useApi(() => api.whatsapp.sessions(), [api], { pollMs: 15_000 });
  const s = settings.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="WhatsApp" description="The number your customers already message. Answer order lists, then make the order from the chat." />
      {s && !s.connected ? (
        <Banner title="WhatsApp isn't connected yet" action={<Button size="sm" variant="secondary" onClick={() => setTab("setup")}>Connect</Button>}>
          Add your WhatsApp Business number so customers&apos; messages land here.
        </Banner>
      ) : null}
      <PageTabs label="WhatsApp sections" value={tab} onChange={setTab} items={[{ id: "chats", label: "Chats", count: sessions.data?.items.length ?? null }, { id: "setup", label: "Setup" }]} />
      {tab === "chats" ? <Inbox sessions={sessions} connected={s?.connected ?? false} onSetup={() => setTab("setup")} onTemplates={() => setTab("setup")} /> : null}
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
