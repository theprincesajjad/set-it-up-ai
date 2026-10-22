import QRCode from "qrcode";

/**
 * Renders a QR as an SVG, synchronously (works in server components).
 * Always black on white, ECC M, no logo (brand.md §8). Quiet zone comes from the card.
 */
export function QrCode({ value, size = 260, label, ecc = "M" }: { value: string; size?: number; label?: string; ecc?: "L" | "M" | "Q" | "H" }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: ecc });
  const n = qr.modules.size;
  const data = qr.modules.data;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return (
    <svg role="img" aria-label={label ?? "QR code"} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className="block max-w-full" style={{ height: "auto" }}>
      <rect width={n} height={n} fill="#FFFFFF" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
