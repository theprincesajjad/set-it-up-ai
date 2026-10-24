import type { repApi } from "@ll/shared";

export interface PitchStep {
  key: "problem" | "proof" | "offer";
  title: string;
  /** One or two sentences a rep can say as written. */
  say: string;
}

const n = (v: number) => v.toLocaleString("en-CA");

/**
 * The two-minute pitch: the problem, proof from the live network (never invented: it says only what the numbers
 * support), and the offer. With no shops live in the area yet it falls back to the network and never claims a street effect.
 */
export function pitchSteps(proof: repApi.PitchProof | null, shop: { name: string; vertical?: string | null }): PitchStep[] {
  const where = proof?.area?.name ?? "the neighbourhood";
  const hasLocal = !!proof && proof.area !== null && proof.shopsLive >= 3;
  const net = proof?.network;
  const proofLine = !proof || (proof.shopsLive === 0 && (net?.shopsLive ?? 0) < 3)
    ? "We are opening this area now. You would be one of the first shops on the card, and the first shop's regulars are the ones who tell their neighbours."
    : !hasLocal && net && net.shopsLive >= 3
      ? `${n(net.shopsLive)} shops across Toronto already give points on one card${net.customers ? `, with ${n(net.customers)} customers` : ""}. ${proof.multiShopPct >= 0.05 ? `${Math.round(proof.multiShopPct * 100)}% of them use more than one shop. ` : ""}${where === "the neighbourhood" ? "Your street" : where} is next.`.replace(/\s+/g, " ")
    : hasLocal
      ? `${n(proof.shopsLive)} shops in ${where} already give points on one card, and ${n(proof.customers)} customers have joined. ${proof.multiShopPct >= 0.05 ? `${Math.round(proof.multiShopPct * 100)}% of them already use more than one shop. ` : ""}${proof.visitsLast7Days ? `${n(proof.visitsLast7Days)} visits were recorded in the last 7 days.` : ""}`.trim()
      : `${n(proof.shopsLive)} shop${proof.shopsLive === 1 ? "" : "s"} on the network so far${proof.customers ? `, ${n(proof.customers)} customers` : ""}. Your street is next.`;
  return [
    { key: "problem", title: "The problem", say: `${shop.name} gets regulars, but paper punch cards get lost and you can't tell who is a regular or when they stop coming.` },
    { key: "proof", title: "The proof, live from the network", say: proofLine },
    { key: "offer", title: "The offer", say: "Loyalty and its reports are free forever. No card, no contract. I can set it up with you right now in about two minutes, and put the counter code in your hands." },
  ];
}

/** What a rep can show on their phone as proof: the top shops by member count, never more than three. */
export function proofHighlights(proof: repApi.PitchProof | null): { label: string; value: string }[] {
  if (!proof) return [];
  const local = proof.area !== null && proof.shopsLive >= 3;
  const shops = local ? proof.shopsLive : proof.network.shopsLive;
  const customers = local ? proof.customers : proof.network.customers;
  return [
    { label: local ? `shops live on ${proof.area!.name}` : "shops live in Toronto", value: n(shops) },
    { label: "customers joined", value: n(customers) },
    { label: "use 2+ shops", value: `${Math.round(proof.multiShopPct * 100)}%` },
  ];
}
