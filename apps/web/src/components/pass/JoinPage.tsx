import { QrCode as QrIcon } from "lucide-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { JoinFlow } from "./JoinFlow";

export type JoinPageProps = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function joinMetadata({ params }: JoinPageProps): Promise<Metadata> {
  const { code } = await params;
  try {
    const info = await publicServerApi().public.joinInfo(code);
    return { title: `Join ${info.merchant.name}`, description: `Earn rewards at ${info.merchant.name}. No app needed. Free. Takes 30 seconds.`, robots: { index: false } };
  } catch {
    return { title: "Join", robots: { index: false } };
  }
}

/** Dev convenience: fill the OTP with the API's devCode (never present in production APIs). */
function devAutofill() {
  return process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1";
}

/** Shared by /j/[code] and /join/[code] (two URL shapes in the wild). */
export async function JoinPage({ params, searchParams }: JoinPageProps) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const ref = typeof sp.ref === "string" ? sp.ref.slice(0, 32) : null;
  let info;
  try {
    info = await publicServerApi().public.joinInfo(code);
  } catch (e) {
    if (isApiError(e) && e.status === 404)
      return (
        <EmptyState
          icon={QrIcon}
          title={copy.err.qrInvalid}
          description="You can still join any shop on the network from the list."
          action={<Button href="/map">Find shops near me</Button>}
        />
      );
    return <ErrorState title="Can't load this shop right now" description={copy.err.network} action={<Button variant="secondary" href={`/j/${encodeURIComponent(code)}`}>Try again</Button>} />;
  }
  const me = await getMe();
  return (
    <JoinFlow
      info={info}
      referralCode={ref}
      signedIn={!!me}
      signedInName={me?.user.name ?? null}
      devAutofill={devAutofill()}
      appStoreUrl={env.appStoreUrl}
      playStoreUrl={env.playStoreUrl}
    />
  );
}
