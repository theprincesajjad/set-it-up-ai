"use client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";

export function VipEditor({ levels, onChange }: { levels: merchantApi.VipLevel[]; onChange: (l: merchantApi.VipLevel[]) => void }) {
  const { api } = useMerchant();
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("");
  const [mult, setMult] = useState("1.5");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-body-strong text-fg">VIP levels</h3>
      <p className="text-meta text-fg-muted">Regulars earn faster once they pass a lifetime total. Members are re-levelled automatically.</p>
      {levels.length ? (
        <table className="w-full text-meta">
          <caption className="sr-only">VIP levels</caption>
          <thead className="text-caption text-fg-muted">
            <tr>
              <th scope="col" className="py-2 text-start">Level</th>
              <th scope="col" className="py-2 text-end">From (lifetime)</th>
              <th scope="col" className="py-2 text-end">Earns</th>
              <th scope="col" className="py-2 text-end">Members</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {[...levels].sort((a, b) => a.thresholdPoints - b.thresholdPoints).map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="py-2">{l.name}</td>
                <td className="py-2 text-end tabular-nums">{formatNumber(l.thresholdPoints)}</td>
                <td className="py-2 text-end tabular-nums">{l.multiplierPct / 100}x</td>
                <td className="py-2 text-end tabular-nums">{formatNumber(l.memberCount)}</td>
                <td className="py-2 text-end">
                  <IconButton icon={Trash2} label={`Delete ${l.name}`} size={40} onClick={async () => {
                    try {
                      await api.deleteVipLevel(l.id);
                      onChange(levels.filter((x) => x.id !== l.id));
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <form
        className="grid gap-2 sm:grid-cols-[1fr_140px_120px_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const t = Number.parseInt(threshold, 10);
          const m = Math.round(Number.parseFloat(mult) * 100);
          if (!name.trim() || !(t >= 0) || !(m >= 100 && m <= 500)) return setError("Add a name, a lifetime total and a multiplier between 1x and 5x.");
          try {
            const l = await api.createVipLevel({ name: name.trim(), thresholdPoints: t, multiplierPct: m });
            onChange([...levels, l]);
            setName("");
            setThreshold("");
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <TextField label="Level name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gold" />
        <TextField label="From" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} placeholder="500" />
        <TextField label="Multiplier" inputMode="decimal" suffix="x" value={mult} onChange={(e) => setMult(e.target.value)} />
        <Button type="submit" variant="secondary">
          Add level
        </Button>
      </form>
    </div>
  );
}
