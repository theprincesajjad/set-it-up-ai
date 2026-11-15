"use client";
import { useState } from "react";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Banner } from "@/components/ui/Banner";
import { Tabs } from "@/components/ui/Tabs";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { EmailSignIn } from "./EmailSignIn";

export function LoginTabs({ signedOut, next, initial, devAutofill, reset, mode, email, invite = false }: { next?: string | null; initial: "customer" | "shop"; devAutofill: boolean; signedOut?: boolean; reset?: boolean; mode?: "code"; email?: string; /** Opened from a team invite: the tabs say Email and Phone (not Shop and Customer), and the emailed code is sent on arrival. */ invite?: boolean }) {
  const [tab, setTab] = useState(initial);
  const { t } = useLocaleOrEnglish();
  return (
    <div className="flex flex-col gap-6">
      {signedOut ? <Banner tone="success">{t("auth.shop.signedOut")}</Banner> : null}
      <Tabs
        idBase="login"
        label={t("auth.login.tabs")}
        value={tab}
        onChange={(v) => setTab(v as "customer" | "shop")}
        items={[
          { id: "shop", label: t(invite ? "auth.login.tabEmail" : "auth.login.tabShop") },
          { id: "customer", label: t(invite ? "auth.login.tabPhone" : "auth.login.tabCustomer") },
        ]}
      />
      <div role="tabpanel" id={`login-panel-${tab}`} aria-labelledby={`login-tab-${tab}`}>
      {tab === "customer" ? (
        <PhoneSignIn heading="h2" next={next ?? undefined} homeByRole devAutofill={devAutofill} />
      ) : (
        <>
          <EmailSignIn next={next} devAutofill={devAutofill} initialMode={reset ? "reset" : mode === "code" ? "code" : "password"} initialEmail={email} autoSend={invite} />
          <p className="mt-4 text-meta text-muted-foreground">{t(invite ? "auth.shop.hintPhoneInvite" : "auth.shop.hintPhone")}</p>
        </>
      )}
      </div>
    </div>
  );
}
