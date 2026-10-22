"use client";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { BRAND } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";

export type KitSize = "a6" | "a4" | "script";

function shopNameSize(name: string) {
  return name.length <= 20 ? 8 : name.length <= 30 ? 6 : 5;
}

/**
 * The A6 counter stand from public/brand/qr-stand-a6.svg (105 x 148 mm), filled with the
 * shop name, street and join URL, with a real QR (QrCode, black on white, ECC M) in the 50 mm slot.
 */
export function QrStand({ shopName, street, joinUrl, scale = 1 }: { shopName: string; street: string; joinUrl: string; scale?: number }) {
  const short = joinUrl.replace(/^https?:\/\//, "");
  const s1 = shopName.length <= 28 ? shopName : "here";
  return (
    <div className="qr-stand relative bg-[#FAF6EF] text-[#1F1B16]" style={{ width: `${105 * scale}mm`, height: `${148 * scale}mm` }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 148" width="100%" height="100%" role="img" aria-label={`QR stand for ${shopName}: Scan to join`} className="absolute inset-0">
        <defs>
          <clipPath id="awning">
            <path d="M0 0h105v16a6.5625 6.5625 0 0 1-13.125 0a6.5625 6.5625 0 0 1-13.125 0a6.5625 6.5625 0 0 1-13.125 0a6.5625 6.5625 0 0 1-13.125 0a6.5625 6.5625 0 0 1-13.125 0a6.5625 6.5625 0 0 1-13.125 0a6.5625 6.5625 0 0 1-13.125 0a6.5625 6.5625 0 0 1-13.125 0z" />
          </clipPath>
        </defs>
        <rect width="105" height="148" fill="#FAF6EF" />
        <g clipPath="url(#awning)">
          <rect width="105" height="24" fill="#F5A524" />
          {[13.125, 39.375, 65.625, 91.875].map((x) => (
            <rect key={x} x={x} width="13.125" height="24" fill="#FDDA8E" />
          ))}
        </g>
        <g fontFamily="Figtree, ui-sans-serif, system-ui, sans-serif" textAnchor="middle">
          <text x="52.5" y="35" fontSize={shopNameSize(shopName)} fontWeight="700" fill="#1F1B16">
            {shopName.length > 30 ? `${shopName.slice(0, 29)}…` : shopName}
          </text>
          <text x="52.5" y="48" fontSize="11" fontWeight="700" fill="#1F6A50" letterSpacing="-0.15">
            Scan to join
          </text>
          <text x="52.5" y="55" fontSize="4.2" fontWeight="500" fill="#1F1B16">
            earn points at <tspan fontWeight="700">{s1}</tspan>
          </text>
          <text x="52.5" y="60.5" fontSize="4.2" fontWeight="500" fill="#1F1B16">
            and every shop on <tspan fontWeight="700">{street.slice(0, 22)}</tspan>
          </text>
        </g>
        <rect x="23.5" y="66" width="58" height="58" rx="3" fill="#FFFFFF" stroke="#E7DFD2" strokeWidth="0.4" />
        <g fontFamily="Figtree, ui-sans-serif, system-ui, sans-serif" textAnchor="middle">
          <text x="52.5" y="130.5" fontSize="3.6" fontWeight="600" fill="#1F1B16">
            No app needed · Free · Takes 30 seconds
          </text>
          <text x="52.5" y="135.5" fontSize="3.3" fontWeight="500" fill="#655A4C">
            No phone camera? Just tell us your number.
          </text>
        </g>
        <rect y="139" width="105" height="9" fill="#1F6A50" />
        <g transform="translate(8 140.5) scale(0.09375)">
          <rect x="6" y="10" width="52" height="48" rx="12" fill="#FAF6EF" />
          <path d="M6 22a12 12 0 0 1 12-12h28a12 12 0 0 1 12 12v2a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0z" fill="#F5A524" />
          <path d="M24 58V44a8 8 0 0 1 16 0v14z" fill="#1F6A50" />
        </g>
        <text x="15.5" y="144.8" fontFamily="Figtree, ui-sans-serif, system-ui, sans-serif" fontSize="3.2" fontWeight="700" fill="#FAF6EF">
          {BRAND.name}
        </text>
        <text x="97" y="144.8" fontFamily="Figtree, ui-sans-serif, system-ui, sans-serif" fontSize="3.2" fontWeight="500" fill="#FAF6EF" textAnchor="end">
          {short}
        </text>
      </svg>
      <div className="absolute [&>svg]:!h-full [&>svg]:!w-full" style={{ left: `${(27.5 / 105) * 100}%`, top: `${(70 / 148) * 100}%`, width: `${(50 / 105) * 100}%`, height: `${(50 / 148) * 100}%` }}>
        <QrCode value={joinUrl} size={400} label={`QR code to join ${shopName}: ${short}`} />
      </div>
    </div>
  );
}

function ScriptCard({ kit, street }: { kit: merchantApi.QrKit; street: string }) {
  return (
    <div className="qr-stand flex flex-col gap-[4mm] bg-[#FFFFFF] p-[8mm] text-[#1F1B16]" style={{ width: "105mm", height: "148mm", fontFamily: "Figtree, sans-serif" }}>
      <p style={{ fontSize: "5mm", fontWeight: 700, color: "#1F6A50" }}>Staff script · {kit.merchant.name}</p>
      <p style={{ fontSize: "4mm" }}>
        <strong>Ask every customer:</strong> &quot;Are you on {BRAND.name}? {kit.program?.headline ?? "You earn rewards here"}, here and at every shop on {street}.&quot;
      </p>
      <p style={{ fontSize: "4mm" }}>
        <strong>Yes:</strong> &quot;Scan your card, or what&apos;s your number?&quot; Then tap <strong>Add stamp</strong> or <strong>Award</strong>.
      </p>
      <p style={{ fontSize: "4mm" }}>
        <strong>No:</strong> &quot;Just scan this. Takes 30 seconds, no app.&quot; Point at the stand.
      </p>
      <p style={{ fontSize: "4mm" }}>
        <strong>Mistake?</strong> Tap <strong>Undo</strong> right away.
      </p>
      <p style={{ fontSize: "3.4mm", color: "#655A4C" }}>{kit.staffScript}</p>
    </div>
  );
}

/** Print-ready QR kit page body. `window.print()` with @page sized to the chosen artifact. */
export function QrKitPrint({ kit, street, initialLocationId, onPrinted }: { kit: merchantApi.QrKit; street: string; initialLocationId?: string | null; onPrinted?: () => void }) {
  const [size, setSize] = useState<KitSize>("a6");
  const [locId, setLocId] = useState(initialLocationId && kit.locations.some((l) => l.id === initialLocationId) ? initialLocationId : (kit.locations[0]?.id ?? ""));
  const loc = kit.locations.find((l) => l.id === locId) ?? kit.locations[0];
  useEffect(() => {
    const after = () => onPrinted?.();
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, [onPrinted]);
  const page = size === "a4" ? "A4 portrait" : "105mm 148mm";
  return (
    <div className="flex flex-col gap-5">
      <style>{`@media print { @page { size: ${page}; margin: 0; } html, body { background: #FFFFFF !important; } .qr-kit-controls { display: none !important; } .qr-kit-sheet { box-shadow: none !important; margin: 0 !important; } }`}</style>
      <div className="qr-kit-controls flex flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          {kit.locations.length > 1 ? <Select label="Location" value={locId} onChange={(e) => setLocId(e.target.value)} options={kit.locations.map((l) => ({ value: l.id, label: l.name }))} /> : null}
          <SegmentedControl label="What to print" value={size} onChange={setSize} options={[{ value: "a6", label: "A6 stand" }, { value: "a4", label: "A4 poster" }, { value: "script", label: "Staff script" }]} />
          <Button iconStart={Printer} onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        </div>
        <p className="text-meta text-fg-muted">The QR is always black on white: it scans best under shop lights. A6 prints on 4x6&quot; card with &quot;fit to page&quot;.</p>
        {loc ? (
          <p className="text-meta text-fg">
            Join link: <span className="font-mono">{loc.joinUrl.replace(/^https?:\/\//, "")}</span>
          </p>
        ) : null}
      </div>
      {loc ? (
        <div className="qr-kit-sheet mx-auto shadow-float print:shadow-none">
          {size === "script" ? <ScriptCard kit={kit} street={street} /> : <QrStand shopName={kit.merchant.name} street={street} joinUrl={loc.joinUrl} scale={size === "a4" ? 2 : 1} />}
        </div>
      ) : (
        <p className="text-body text-fg-muted">Add a location first.</p>
      )}
    </div>
  );
}
