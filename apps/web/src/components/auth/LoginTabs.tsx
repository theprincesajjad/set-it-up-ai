"use client";
import { useState } from "react";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Tabs } from "@/components/ui/Tabs";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { EmailSignIn } from "./EmailSignIn";

export function LoginTabs({ next, initial, devAutofill }: { next?: string | null; initial: "customer" | "shop"; devAutofill: boolean }) {
  const [tab, setTab] = useState(initial);
  const { t } = useLocaleOrEnglish();
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        idBase="login"
        label={t("auth.login.tabs")}
        value={tab}
        onChange={(v) => setTab(v as "customer" | "shop")}
        items={[
          { id: "shop", label: t("auth.login.tabShop") },
          { id: "customer", label: t("auth.login.tabCustomer") },
        ]}
      />
      <div role="tabpanel" id={`login-panel-${tab}`} aria-labelledby={`login-tab-${tab}`}>
      {tab === "customer" ? (
        <PhoneSignIn heading="h2" next={next ?? "/me"} devAutofill={devAutofill} />
      ) : (
        // Shop owner and staff sign-in stays English in every language.
        <div lang="en" dir="ltr">
          <EmailSignIn next={next} devAutofill={devAutofill} />
        </div>
      )}
      </div>
    </div>
  );
}
