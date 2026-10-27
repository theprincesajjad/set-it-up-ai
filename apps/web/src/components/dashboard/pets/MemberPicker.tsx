"use client";
import { useEffect, useState } from "react";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { TextField } from "@/components/ui/TextField";

export interface PickedMember {
  memberId: string;
  userId: string;
  name: string | null;
}

/** Find a customer of this shop by name, phone or member code and pick them (pets, packs and food cards all hang off a member). */
export function MemberPicker({ label = "Customer", value, onPick, autoFocus }: { label?: string; value: PickedMember | null; onPick: (m: PickedMember | null) => void; autoFocus?: boolean }) {
  const { api } = useMerchant();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ memberId: string; userId: string; name: string | null; phone: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (value || q.trim().length < 2) {
      // Nothing to look up until two letters are typed or a customer is picked.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFound([]);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .customers({ q: q.trim(), limit: 6 })
        .then((r) => live && setFound(r.items.map((c) => ({ memberId: c.memberId, userId: c.userId, name: c.name, phone: c.phone }))))
        .catch(() => live && setFound([]))
        .finally(() => live && setSearching(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, value, api]);
  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-meta-strong text-fg">{label}</span>
        <div className="flex items-center justify-between gap-3 rounded-input border border-line px-3.5 py-3">
          <span className="text-body text-fg">{value.name ?? "No name"}</span>
          <button type="button" className="text-meta text-fg-muted underline" onClick={() => { onPick(null); setQ(""); }}>Change</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <TextField label={label} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or member code" autoComplete="off" autoFocus={autoFocus} />
      {q.trim().length >= 2 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line" aria-label="Matching customers">
          {found.map((c) => (
            <li key={c.memberId}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-start hover:bg-bg-subtle" onClick={() => onPick({ memberId: c.memberId, userId: c.userId, name: c.name })}>
                <span className="text-body text-fg">{c.name ?? "No name"}</span>
                <span className="text-meta text-fg-muted">{c.phone ? c.phone.replace(/\*/g, "•") : ""}</span>
              </button>
            </li>
          ))}
          {!found.length ? <li className="px-3.5 py-2.5 text-meta text-fg-muted">{searching ? "Searching." : "Nobody found. They join the shop first, at the counter."}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
