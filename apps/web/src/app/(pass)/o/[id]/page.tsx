import { PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import { OrderStatus } from "@/components/pass/OrderStatus";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { isApiError } from "@/lib/api/errors";
import { getServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

/** Order status. The API has no public (token) order tracking, so this is for the signed-in customer (GET /v1/me/orders/:id). */
export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) return <PhoneSignIn title="Sign in to see your order" devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />;
  const order = await (await getServerApi()).me.order(id).catch((e: unknown) => (isApiError(e) && e.status === 404 ? ("gone" as const) : ("error" as const)));
  if (order === "gone") return <EmptyState icon={PackageSearch} title="We couldn't find that order" description="It may belong to another account. Check the link in your text." action={<Button variant="tonal" href="/me">My card</Button>} />;
  if (order === "error") return <ErrorState title="Can't load your order right now" description={copy.err.network} action={<Button variant="secondary" href={`/o/${encodeURIComponent(id)}`}>Try again</Button>} />;
  return <OrderStatus initial={order} />;
}
