import type { Metadata } from "next";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Wallet } from "@/components/pass/Wallet";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { getServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My card", robots: { index: false } };

export default async function MePage() {
  const me = await getMe();
  if (!me) {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <PhoneSignIn devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} title="your card" intro="Use the number you gave at the counter. We'll text you a code." />
      </div>
    );
  }
  const api = await getServerApi();
  const data = await Promise.all([api.me.profile(), api.me.memberships(), api.me.card().catch(() => null)]).catch(() => null);
  if (!data) return <ErrorState title="Can't load your card right now" description={copy.err.network} action={<Button variant="secondary" href="/me">Try again</Button>} />;
  const [profile, wallet, card] = data;
  return <Wallet profile={profile} wallet={wallet} card={card} />;
}
