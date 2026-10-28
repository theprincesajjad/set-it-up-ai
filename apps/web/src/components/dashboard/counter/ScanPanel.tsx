"use client";
import { ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts?: { formats?: string[] }) => DetectorLike;

/**
 * The black viewfinder: "Hold the card up". Opens the camera with BarcodeDetector when the browser supports it and
 * camera permission is already granted (or the owner taps "Use the camera"); a USB or Bluetooth scanner works with no
 * camera at all because CounterApp listens for scanner keystrokes ending in Enter.
 */
export function ScanPanel({ onScan, hint, ready, cameraRequest = 0 }: { onScan: (payload: string) => void; hint: string; ready: boolean; /** Bumped by the keypad's scan key: opens the camera. */ cameraRequest?: number }) {
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
    if (cameraRequest > 0) void start();
  }, [cameraRequest, start]);

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
    <section
      aria-label="Scan a card"
      data-scan-ready={ready ? "true" : "false"}
      aria-busy={!ready}
      className={cn("relative flex items-center gap-4 overflow-hidden rounded-xl bg-primary px-5 py-4 text-primary-foreground", state === "on" ? "min-h-48 items-end" : "min-h-24")}
    >
      {state === "on" ? <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover opacity-70" aria-hidden /> : <video ref={video} className="hidden" aria-hidden />}
      <span aria-hidden className="relative flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-primary-foreground/80">
        <ScanLine className="size-6" strokeWidth={1.75} />
      </span>
      <div className="relative min-w-0">
        <p className="font-display text-h3 font-bold">Hold the card up</p>
        <p className="text-meta text-primary-foreground/70">{hint}</p>
        {state === "off" || state === "denied" ? (
          <button type="button" onClick={() => void start()} className="min-h-11 text-meta-strong text-primary-foreground/80 underline underline-offset-4 hover:text-primary-foreground focus-visible:focus-ring">
            {state === "denied" ? "Camera is blocked. Try again" : "Use the camera"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
