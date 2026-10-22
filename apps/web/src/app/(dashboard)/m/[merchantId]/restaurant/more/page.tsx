"use client";
import { PageHeader } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { enabledSet, restaurantModules, restaurantUnlock } from "@/lib/dashboard/nav";

const money = (cents: number) => `$${cents / 100}`;

/** Restaurant modules the shop has not unlocked, each with the tier (or add-on) that opens it. Linked from the sidebar's "More for restaurants". */
export default function MoreForRestaurantsPage() {
  const { base, role, features } = useMerchant();
  const { locked } = restaurantModules(enabledSet(features.features));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="More for restaurants" description="Tools your plan doesn't include yet. Each one switches on the moment you move to the plan that has it." actions={role === "owner" && locked.length ? <Button href={`${base}/billing`}>See restaurant plans</Button> : undefined} />
      {locked.length === 0 ? (
        <p className="text-body text-fg-muted">Every restaurant tool is on your plan.</p>
      ) : (
        <ul aria-label="Locked restaurant modules" className="max-w-[720px] divide-y divide-line border-y border-line">
          {locked.map((m) => {
            const u = restaurantUnlock(m.slug);
            return (
              <li key={m.slug} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-body font-medium text-fg">{u.name}</p>
                  <p className="mt-0.5 text-meta text-fg-muted">{u.description}</p>
                </div>
                <div className="shrink-0 text-meta sm:text-end">
                  <p className="font-medium text-fg">
                    {u.tier} · {money(u.tierPriceCents)}/mo
                  </p>
                  {u.addOn ? (
                    <p className="text-fg-muted">
                      or Growth plus {u.addOn.name}, {money(u.addOn.priceCents)}/mo
                    </p>
                  ) : null}
                  {role === "owner" ? (
                    <a href={`${base}/billing`} className="mt-1 inline-block text-fg underline decoration-line underline-offset-4 hover:decoration-fg">
                      Unlock in billing
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {role !== "owner" && locked.length ? <p className="text-meta text-fg-muted">Ask the shop owner to change the plan.</p> : null}
    </div>
  );
}
