"use client";
import { useParams } from "next/navigation";
import { CustomerView } from "@/components/dashboard/customers/CustomerView";
import { PageHeader } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { useApi } from "@/lib/dashboard/useApi";

/** Full-page customer (deep links, printing). The Customers table opens the same view in a side panel. */
export default function CustomerDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.customer(memberId), [api, memberId]);
  const rewards = useApi(() => api.rewards(), [api]);
  return (
    <Async state={state}>
      {(d) => (
        <>
          <PageHeader back={{ href: `${base}/customers`, label: "Customers" }} title={d.customer.name ?? "No name"} description={`Member since ${new Date(d.customer.joinedAt).toLocaleDateString("en-CA", { month: "long", year: "numeric" })}`} />
          <CustomerView layout="page" d={d} rewards={rewards.data?.items ?? []} onChange={(n) => state.setData(n)} reload={state.reload} />
        </>
      )}
    </Async>
  );
}
