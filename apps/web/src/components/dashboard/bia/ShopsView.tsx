"use client";
import { useState } from "react";
import type { networkApi } from "@ll/shared";
import { Capsules, PageHeader, Panel, SegmentedControl } from "@/components/dashboard";
import { ListAsync } from "@/components/dashboard/ListStates";
import { browserApi } from "@/lib/api/browser";
import { ROLLING, comparisonLine, periodQuery } from "@/lib/dashboard/biaPeriods";
import { useApi } from "@/lib/dashboard/useApi";
import { ShopsTable } from "./ShopsTable";

type Filter = "all" | "activated" | "not";

/** Every shop on the street, shops that still need a rep first. A passport fails if two shops are not set up, so this shows who needs a visit. */
export function ShopsView({ hood }: { hood: networkApi.NeighbourhoodDto }) {
  const [periodId, setPeriodId] = useState<string>(ROLLING[0]!.id);
  const [filter, setFilter] = useState<Filter>("all");
  const period = ROLLING.find((p) => p.id === periodId) ?? ROLLING[0]!;
  const overview = useApi(() => browserApi.campaigns.overview(hood.id, periodQuery(period)), [hood.id, periodId]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Shops" description={`Visits and new members per shop. ${comparisonLine(period).replace(/ compared with.*$/, "")}.`} actions={<SegmentedControl label="Period" value={periodId} onChange={setPeriodId} options={ROLLING.map((p) => ({ value: p.id, label: p.label }))} />} />
      <ListAsync state={overview} errorTitle="We could not load the shops.">
        {(o) => {
          const rows = o.shopsTable.filter((s) => (filter === "all" ? true : filter === "activated" ? s.activated : !s.activated));
          const notActivated = o.shopsTable.filter((s) => !s.activated).length;
          return (
            <Panel
              title={`${o.shopsTable.length} shops on ${hood.name}`}
              description={notActivated ? `${notActivated} not activated yet. A shop is activated once members have visited it; a rep can help the others.` : "Every shop is activated."}
            >
              <Capsules
                className="mb-3"
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", count: o.shopsTable.length },
                  { value: "not", label: "Not activated", count: notActivated },
                  { value: "activated", label: "Activated", count: o.shopsTable.length - notActivated },
                ]}
              />
              <ShopsTable rows={rows} notActivatedFirst label={`Shops on ${hood.name}`} />
            </Panel>
          );
        }}
      </ListAsync>
    </div>
  );
}
