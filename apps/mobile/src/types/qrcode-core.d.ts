// The dependency-free QR encoder inside `qrcode` (no canvas/fs). Used by ui/QrCode.tsx.
declare module "qrcode/lib/core/qrcode" {
  export function create(
    text: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): { modules: { size: number; data: Uint8Array | boolean[] }; version: number };
}
