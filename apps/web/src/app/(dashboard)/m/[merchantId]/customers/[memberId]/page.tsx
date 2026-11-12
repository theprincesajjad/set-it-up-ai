"use client";
import { useParams } from "next/navigation";
import { CustomerView } from "@/components/dashboard/customers/CustomerView";
import { PageHeader } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { ErrorPanel } from "@/components/errors";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/** Full-page customer (deep links, printing). The Customers table opens the same view in a side panel. */
export default function CustomerDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { api, base } = useMerchant();
  const { t, date } = useLocaleOrEnglish();
  const state = useApi(() => api.customer(memberId), [api, memberId]);
  const rewards = useApi(() => api.rewards(), [api]);
  // A failed load keeps the way back to the list. A removed customer is "gone" (no Try again: retrying cannot bring them back).
  if (state.error && !state.data)
    return (
      <>
        <PageHeader back={{ href: `${base}/customers`, label: "Customers" }} title="Customer" />
        <ErrorPanel error={state.cause ?? state.error} onRetry={state.reload} back={{ href: `${base}/customers`, label: t("err.action.customers") }} notFound={{ title: t("err.customer.gone.title"), description: t("err.customer.gone.body") }} />
      </>
    );
  return (
    <Async state={state}>
      {(d) => (
        <>
          <PageHeader back={{ href: `${base}/customers`, label: "Customers" }} title={d.customer.name ?? "No name"} description={t("people.customerSince", { date: date(d.customer.joinedAt, { month: "long", year: "numeric" }) })} />
          <CustomerView layout="page" d={d} rewards={rewards.data?.items ?? []} onChange={(n) => state.setData(n)} reload={state.reload} />
        </>
      )}
    </Async>
  );
}
