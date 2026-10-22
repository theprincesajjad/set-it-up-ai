"use client";
import { ArrowLeft } from "lucide-react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { ImportWizard } from "@/components/dashboard/ImportWizard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";

export default function ImportPage() {
  const { api, base } = useMerchant();
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/customers`} className="self-start">
        Customers
      </Button>
      <PageHeader title="Import customers" description="Bring your members and balances from another loyalty app. No welcome bonus is given on import." />
      <FeatureGate keys={["customers.csv_import"]} title="Import & migrate">
        <ImportWizard importCsv={(b) => api.importCustomers(b)} />
      </FeatureGate>
    </div>
  );
}
