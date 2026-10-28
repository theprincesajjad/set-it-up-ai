"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { classesApi } from "@ll/shared";
import { OfferPanel } from "@/components/dashboard/classes/OfferPanel";
import { SalePanel } from "@/components/dashboard/classes/SalePanel";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Capsules, Dot, EmptyState, PageHeader, Section, StatBlock, TableWrap, Table, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async, NoAccess } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/dashboard/calendar";
import { memberStatusLabel, memberTone, offerPrice, offerRules, offerType } from "@/lib/dashboard/classes";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function MembershipsPage() {
  return (
    <FeatureGate keys={["booking.classes", "memberships.recurring"]} title="Memberships & passes">
      <Memberships />
    </FeatureGate>
  );
}

type Tab = "offers" | "members" | "issues";
const d = (v: string | null) => (v ? new Date(`${v}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }) : "");

function Memberships() {
  const { api, role, enabled } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [tab, setTab] = useState<Tab>("offers");
  const [q, setQ] = useState("");
  const [offer, setOffer] = useState<classesApi.ProductDto | null | undefined>(undefined);
  const [sale, setSale] = useState(false);
  const [ending, setEnding] = useState<classesApi.StudioMemberDto | null>(null);
  const [refund, setRefund] = useState(false);
  const canMemberships = enabled("memberships.recurring");
  const products = useApi(() => api.classes.products(), [api]);
  const summary = useApi(() => api.classes.summary(), [api]);
  const members = useApi(canMemberships && role !== "staff" ? () => api.classes.members({ q: q || undefined, status: tab === "issues" ? "past_due" : "all" }) : null, [api, q, tab, canMemberships, role]);
  if (role === "instructor") return <NoAccess />;
  const s = summary.data;
  const reload = async () => void (await Promise.all([products.reload(), summary.reload(), members.reload()]));
  // Desk staff sell drop-ins and packs; prices, members and billing stay with owners and managers.
  const packs = (products.data?.items ?? []).filter((p) => (p.kind === "pack" || p.kind === "drop_in") && p.active).sort((a, b) => Number(b.kind === "drop_in") - Number(a.kind === "drop_in"));
  if (role === "staff") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader flush title="Desk sale" description="Someone paying at the desk for a drop-in, a pack or an intro offer. It lands on their member card straight away." actions={packs.length ? <Button onClick={() => setSale(true)}>Record a desk sale</Button> : undefined} />
        {products.data && !packs.length ? <EmptyState title="Nothing for sale yet" description="Ask an owner or manager to add a drop-in or a pack." /> : null}
        <SalePanel open={sale} onClose={() => setSale(false)} packs={packs} onSaved={reload} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Memberships & passes"
        description="What you sell, who is on it and when they are billed. Renewals charge the card on file."
        actions={
          <>
            {packs.length ? <Button variant="secondary" onClick={() => setSale(true)}>Record a desk sale</Button> : null}
            <Button iconStart={Plus} onClick={() => setOffer(null)}>New offer</Button>
          </>
        }
      />
      <StatBlock tiles
        label="Memberships"
        items={[
          { label: "Active members", value: s?.activeMembers ?? 0, caption: `${s?.frozenMembers ?? 0} frozen` },
          { label: "Monthly recurring", value: money(s?.mrrCents ?? 0), caption: "Before tax, active and past due" },
          { label: "Cancelled, last 30 days", value: s?.cancelledLast30 ?? 0, caption: s && s.activeMembers + s.cancelledLast30 > 0 ? `${Math.round((s.cancelledLast30 / (s.activeMembers + s.cancelledLast30)) * 1000) / 10}% of members` : "No members yet" },
          { label: "Pack and drop-in sales", value: money(s?.packSalesCents ?? 0), caption: "Last 30 days, before tax" },
        ]}
      />
      <Capsules
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          { value: "offers", label: "Offers" },
          ...(canMemberships ? [{ value: "members" as const, label: "Members" }, { value: "issues" as const, label: "Billing issues", count: s?.pastDue ?? 0, tone: (s?.pastDue ? "negative" : undefined) as "negative" | undefined }] : []),
        ]}
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {tab === "offers" ? (
        <Section title="Offers">
          <Async state={products}>
            {(p) =>
              p.items.length === 0 ? (
                <EmptyState title="Nothing for sale yet" description="Start with a drop-in, a 10-class pack and an intro offer for new students. Add a membership when you want monthly billing." action={<Button onClick={() => setOffer(null)}>New offer</Button>} />
              ) : (
                <TableWrap>
                  <Table label="Offers">
                    <thead><tr><Th>Offer</Th><Th>Price</Th><Th>Type</Th><Th>Rules</Th><Th align="end">Sold</Th></tr></thead>
                    <tbody>
                      {p.items.map((o) => (
                        <Tr key={o.id} onOpen={() => setOffer(o)}>
                          <Td><span className={o.active ? "text-fg" : "text-fg-muted"}>{o.name}</span>{o.active ? null : <span className="ms-2 text-meta text-fg-muted">Off sale</span>}</Td>
                          <Td>{offerPrice(o, money)}</Td>
                          <Td>{offerType(o)}</Td>
                          <Td>{offerRules(o)}</Td>
                          <Td align="end">{o.kind === "membership" ? `${o.activeCount ?? 0} active` : `${o.soldLast30 ?? 0} in 30 days`}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )
            }
          </Async>
        </Section>
      ) : (
        <Section
          title={tab === "issues" ? "Billing issues" : "Members"}
          action={tab === "members" ? <div className="w-56"><TextField label="Search members" hideLabel placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div> : undefined}
        >
          <Async state={members}>
            {(m) =>
              m.items.length === 0 ? (
                <EmptyState title={tab === "issues" ? "No payment problems" : "No members yet"} description={tab === "issues" ? "A failed renewal shows up here and in the member's app." : "Members who join from your studio page appear here."} />
              ) : (
                <TableWrap>
                  <Table label="Members">
                    <thead><tr><Th>Member</Th><Th>Offer</Th><Th>Status</Th><Th>Next payment</Th><Th>Note</Th><Th align="end"><span className="sr-only">Actions</span></Th></tr></thead>
                    <tbody>
                      {m.items.map((x) => (
                        <Tr key={x.membershipId}>
                          <Td>{x.name ?? x.maskedPhone ?? "Member"}</Td>
                          <Td>{x.offer}</Td>
                          <Td><Dot tone={memberTone(x.status, x.issue)}>{memberStatusLabel(x.status)}</Dot></Td>
                          <Td>{x.nextBillingDate && !x.cancelEffectiveOn ? d(x.nextBillingDate) : ""}</Td>
                          <Td>{x.issue ?? ""}</Td>
                          <Td align="end">
                            {x.status === "pending" ? (
                              <Button size="sm" variant="ghost" onClick={() => { setRefund(false); setEnding(x); }}>Cancel sign-up</Button>
                            ) : null}
                            {x.status === "active" || x.status === "past_due" || x.status === "frozen" ? (
                              <div className="flex justify-end gap-1">
                                {x.status === "active" && !x.cancelEffectiveOn ? <Button size="sm" variant="ghost" onClick={async () => { if (await act.run(() => api.classes.freezeMembership(x.membershipId, { days: 14 }))) { toast({ message: "Frozen for 14 days", tone: "success" }); await reload(); } }}>Freeze</Button> : null}
                                {!x.cancelEffectiveOn ? <Button size="sm" variant="ghost" onClick={() => { setRefund(false); setEnding(x); }}>End</Button> : null}
                              </div>
                            ) : null}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )
            }
          </Async>
        </Section>
      )}
      <OfferPanel open={offer !== undefined} onClose={() => setOffer(undefined)} offer={offer ?? null} canMemberships={canMemberships} onSaved={reload} />
      <SalePanel open={sale} onClose={() => setSale(false)} packs={packs} onSaved={reload} />
      <ConfirmDialog
        open={!!ending}
        onClose={() => setEnding(null)}
        danger
        title={`End ${ending?.name ?? "this"} membership?`}
        body="It ends now and no more payments are taken. Classes already booked on it are released."
        confirmLabel="End membership"
        onConfirm={async () => {
          if (!ending) return;
          await api.classes.cancelMembership(ending.membershipId, { effective: "now", refundLast: refund, reason: "Ended by the studio" });
          toast({ message: "Membership ended", tone: "success" });
          await reload();
        }}
      >
        <label className="flex items-center gap-2 text-meta text-fg">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Refund the latest payment (moving, injury or illness)
        </label>
      </ConfirmDialog>
    </div>
  );
}
