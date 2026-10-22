"use client";
import { useState } from "react";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Tabs } from "@/components/ui/Tabs";
import { EmailSignIn } from "./EmailSignIn";

export function LoginTabs({ next, initial, devAutofill }: { next?: string | null; initial: "customer" | "shop"; devAutofill: boolean }) {
  const [tab, setTab] = useState(initial);
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        label="Sign in as"
        value={tab}
        onChange={(t) => setTab(t as "customer" | "shop")}
        items={[
          { id: "shop", label: "Shop owner or staff" },
          { id: "customer", label: "Customer" },
        ]}
      />
      {tab === "customer" ? <PhoneSignIn heading="h2" title="Sign in with your phone" next={next ?? "/me"} devAutofill={devAutofill} /> : <EmailSignIn next={next} devAutofill={devAutofill} />}
    </div>
  );
}
