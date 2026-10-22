"use client";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { BRAND } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { Segmented } from "./kit";
import { Select } from "@/components/ui/Select";

export type KitSize = "a6" | "a4" | "script";

function shopNameSize(name: string) {
  return name.length <= 20 ? 8 : name.length <= 30 ? 6 : 5;
}

const DISPLAY = "'Bricolage Grotesque', var(--font-bricolage), Inter, ui-sans-serif, system-ui, sans-serif";
const TEXT = "Inter, var(--font-inter), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/**
 * The v2 A6 counter stand from public/brand/qr-stand-a6.svg (105 x 148 mm): white paper, black type,
 * one accent dot. Filled with the shop name, street and join URL, with a real QR (QrCode, black on
 * white, ECC M) in the 50 mm slot.
 */
export function QrStand({ shopName, street, joinUrl, scale = 1 }: { shopName: string; street: string; joinUrl: string; scale?: number }) {
  const short = joinUrl.replace(/^https?:\/\//, "");
  const s1 = shopName.length <= 28 ? shopName : "here";
  return (
    <div className="qr-stand relative bg-[#FFFFFF] text-[#0B0B0C]" style={{ width: `${105 * scale}mm`, height: `${148 * scale}mm` }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 148" width="100%" height="100%" role="img" aria-label={`QR stand for ${shopName}: Scan to join`} className="absolute inset-0">
        <rect width="105" height="148" fill="#FFFFFF" />
        <g transform="translate(8 9) scale(0.125)">
          <rect width="64" height="64" rx="16" fill="#0B0B0C" />
          <circle cx="22" cy="22" r="7.5" fill="#FFFFFF" />
          <circle cx="42" cy="22" r="7.5" fill="#FFFFFF" />
          <circle cx="22" cy="42" r="7.5" fill="#FFFFFF" />
          <circle cx="42" cy="42" r="7.5" fill="#FF5A1F" />
        </g>
        <g textAnchor="middle">
          <text x="52.5" y="33" fontFamily={DISPLAY} fontSize={shopNameSize(shopName)} fontWeight="800" letterSpacing="-0.08" fill="#0B0B0C">
            {shopName.length > 30 ? `${shopName.slice(0, 29)}…` : shopName}
          </text>
          <text x="52.5" y="46.5" fontFamily={DISPLAY} fontSize="12" fontWeight="800" letterSpacing="-0.12" fill="#0B0B0C">
            scan to join
          </text>
          <g fontFamily={TEXT} fontSize="4.2" fontWeight="500" fill="#6B6B70">
            <text x="52.5" y="54">
              earn points at{" "}
              <tspan fontWeight="600" fill="#0B0B0C">
                {s1}
              </tspan>
            </text>
            <text x="52.5" y="59.5">
              and every shop on{" "}
              <tspan fontWeight="600" fill="#0B0B0C">
                {street.slice(0, 22)}
              </tspan>
            </text>
          </g>
        </g>
        <rect x="23.5" y="66" width="58" height="58" rx="4" fill="#FFFFFF" stroke="#E8E8E6" strokeWidth="0.35" />
        <g fontFamily={TEXT} textAnchor="middle">
          <text x="52.5" y="130.5" fontSize="3.6" fontWeight="600" fill="#0B0B0C">
            No app needed · Free · Takes 30 seconds
          </text>
          <text x="52.5" y="135.5" fontSize="3.3" fontWeight="500" fill="#6B6B70">
            No phone camera? Just tell us your number.
          </text>
        </g>
        <rect y="139" width="105" height="9" fill="#0B0B0C" />
        <circle cx="10" cy="143.5" r="1.4" fill="#FF5A1F" />
        <text x="13.2" y="144.7" fontFamily={DISPLAY} fontSize="3.4" fontWeight="800" fill="#FFFFFF">
          {BRAND.name.toLowerCase()}
        </text>
        <text x="97" y="144.7" fontFamily={TEXT} fontSize="3.2" fontWeight="500" fill="#FFFFFF" textAnchor="end">
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
  const row = { fontSize: "3.8mm", lineHeight: 1.4, borderTop: "0.3mm solid #E8E8E6", paddingTop: "3mm" } as const;
  return (
    <div className="qr-stand flex flex-col gap-[3mm] bg-[#FFFFFF] p-[8mm] text-[#0B0B0C]" style={{ width: "105mm", height: "148mm", fontFamily: TEXT }}>
      <p style={{ fontSize: "3.2mm", color: "#6B6B70" }}>Staff script · {kit.merchant.name}</p>
      <p style={{ fontFamily: DISPLAY, fontSize: "7mm", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.1, marginBottom: "2mm" }}>ask every customer</p>
      <p style={row}>&quot;Are you on {BRAND.name}? {kit.program?.headline ?? "You earn rewards here"}, here and at every shop on {street}.&quot;</p>
      <p style={row}>
        <strong>Yes</strong> · &quot;Scan your card, or what&apos;s your number?&quot; Then tap <strong>Add stamp</strong> or <strong>Award</strong>.
      </p>
      <p style={row}>
        <strong>No</strong> · &quot;Just scan this. Takes 30 seconds, no app.&quot; Point at the stand.
      </p>
      <p style={row}>
        <strong>Mistake?</strong> Tap <strong>Undo</strong> right away.
      </p>
      <p style={{ ...row, fontSize: "3.2mm", color: "#6B6B70", marginTop: "auto" }}>{kit.staffScript}</p>
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
      <style>{`@media print { @page { size: ${page}; margin: 0; } html, body { background: #FFFFFF !important; } .qr-kit-controls { display: none !important; } .qr-kit-sheet { box-shadow: none !important; margin: 0 !important; border: 0 !important; } .qr-kit-canvas { background: transparent !important; padding: 0 !important; } }`}</style>
      <div className="qr-kit-controls flex flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {kit.locations.length > 1 ? <Select label="Location" value={locId} onChange={(e) => setLocId(e.target.value)} options={kit.locations.map((l) => ({ value: l.id, label: l.name }))} /> : null}
          <Segmented label="What to print" value={size} onChange={setSize} options={[{ value: "a6", label: "A6 stand" }, { value: "a4", label: "A4 poster" }, { value: "script", label: "Staff script" }]} />
          <Button iconStart={Printer} onClick={() => window.print()} className="sm:ms-auto">
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
        <div className="qr-kit-canvas flex justify-center overflow-x-auto rounded-card bg-bg-subtle px-4 py-10 print:block print:rounded-none print:bg-transparent print:p-0">
        <div className="qr-kit-sheet border border-line print:border-0">
          {size === "script" ? <ScriptCard kit={kit} street={street} /> : <QrStand shopName={kit.merchant.name} street={street} joinUrl={loc.joinUrl} scale={size === "a4" ? 2 : 1} />}
        </div>
        </div>
      ) : (
        <p className="text-body text-fg-muted">Add a location first.</p>
      )}
    </div>
  );
}
