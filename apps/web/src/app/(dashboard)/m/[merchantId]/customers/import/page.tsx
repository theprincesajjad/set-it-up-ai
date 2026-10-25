"use client";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { ImportWizard } from "@/components/dashboard/ImportWizard";
import { PageHeader } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";

export default function ImportPage() {
  const { api, base, viewingAs, feature } = useMerchant();
  const locked = !viewingAs && !feature("customers.csv_import")?.enabled;
  const wizard = <ImportWizard importCsv={(b) => api.importCustomers(b)} />;
  return (
    <div className="max-w-[860px]">
      {/* A locked shop sees the teaser alone: it carries its own title, so no second heading above it. */}
      {locked ? null : <PageHeader back={{ href: `${base}/customers`, label: "Customers" }} title="Import customers" description={viewingAs ? "Done-for-you migration: import this shop's members and balances. No welcome bonus is given on import." : "Bring your members and balances from another loyalty app. No welcome bonus is given on import."} />}
      {/* CSV import is Plus for owners; reps and admins can import for any shop (the API skips the gate for them). */}
      {viewingAs ? wizard : <FeatureGate keys={["customers.csv_import"]} title="Import customers">{wizard}</FeatureGate>}
    </div>
  );
}
