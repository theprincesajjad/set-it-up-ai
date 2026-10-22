import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { QuoteView } from "@/components/pass/QuoteView";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

export default async function QuotePage({ params }: Props) {
  const { token } = await params;
  const data = await publicServerApi()
    .public.quote(token)
    .catch((e: unknown) => (isApiError(e) && (e.status === 404 || e.status === 402) ? ("gone" as const) : ("error" as const)));
  if (data === "gone") return <EmptyState icon={Link2Off} title="This link doesn't work anymore" description="Contact the shop for a new one." action={<Button variant="tonal" href="/map">Find the shop</Button>} />;
  if (data === "error") return <ErrorState title="Can't load your quote right now" description={copy.err.network} action={<Button variant="secondary" href={`/q/${encodeURIComponent(token)}`}>Try again</Button>} />;
  return <QuoteView token={token} initial={data} />;
}
