"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts?: { formats?: string[] }) => DetectorLike;

/**
 * The black viewfinder: "Hold the card up". Opens the camera with BarcodeDetector when the browser supports it and
 * camera permission is already granted (or the owner taps "Use the camera"); a USB or Bluetooth scanner works with no
 * camera at all because CounterApp listens for scanner keystrokes ending in Enter.
 */
export function ScanPanel({ onScan, hint }: { onScan: (payload: string) => void; hint: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"off" | "starting" | "on" | "denied" | "unsupported">("off");
  const last = useRef({ value: "", at: 0 });

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
      setState("on");
    } catch {
      setState("denied");
    }
  }, []);

  // Open automatically only when permission was already granted (never trigger a prompt unasked).
  useEffect(() => {
    let live = true;
    const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Detector) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("unsupported");
      return;
    }
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((p) => {
        if (live && p.state === "granted") void start();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      stop();
    };
  }, [start, stop]);

  useEffect(() => {
    if (state !== "on") return;
    const Detector = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const det = new Detector({ formats: ["qr_code"] });
    const t = setInterval(async () => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      try {
        const found = await det.detect(v);
        const raw = found[0]?.rawValue;
        // The same card held in view must not fire twice in a row.
        if (raw && (raw !== last.current.value || Date.now() - last.current.at > 4000)) {
          last.current = { value: raw, at: Date.now() };
          onScan(raw);
        }
      } catch {
        /* a frame that cannot be read is skipped */
      }
    }, 250);
    return () => clearInterval(t);
  }, [state, onScan]);

  return (
    <section aria-label="Scan a card" className="relative flex min-h-[250px] flex-col items-center justify-end overflow-hidden rounded-[20px] bg-fg px-6 pb-6 pt-8 text-center text-bg">
      {state === "on" ? <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover opacity-70" aria-hidden /> : <video ref={video} className="hidden" aria-hidden />}
      <span aria-hidden className="absolute left-1/2 top-6 size-[150px] -translate-x-1/2 rounded-[28px] border-[3px] border-bg/90" />
      <div className="relative mt-[170px]">
        <p className="font-display text-[26px] font-bold leading-8 tracking-[-0.01em]">Hold the card up</p>
        <p className="mt-2 text-[14px] leading-5 text-bg/60">{hint}</p>
        {state === "off" || state === "denied" ? (
          <button type="button" onClick={() => void start()} className="mt-3 text-[13px] font-medium text-bg/80 underline underline-offset-4 hover:text-bg focus-visible:focus-ring">
            {state === "denied" ? "Camera is blocked. Try again" : "Use the camera"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
