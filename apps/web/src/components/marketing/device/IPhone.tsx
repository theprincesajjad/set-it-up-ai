import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import "./iphone.css";

/**
 * A current iPhone (6.1", the 393 x 852 pt screen of iPhone 15/16 Pro) drawn in CSS for the marketing pages: a thin titanium band
 * around a black bezel, the screen's 55 pt corner radius, the Dynamic Island (126 x 37 pt, 11 pt from the top), the status bar
 * (9:41, signal, Wi-Fi, battery) and the side buttons. The screen content is laid out on the real 393 x 852 canvas and scaled with
 * the frame by `--s` (set it from CSS per breakpoint; default 0.75), so a mock inside is written at true phone sizes.
 * Pure markup: no script, no image. `status="light"` draws a white status bar for content on a dark or brand-coloured top.
 */
export function IPhone({ children, className, screenClassName, status = "dark", label }: { children: ReactNode; className?: string; screenClassName?: string; status?: "dark" | "light"; /** When set, the phone is one picture for assistive tech. */ label?: string }) {
  return (
    <div className={cn("ip", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className="ip-btn ip-btn-action" />
      <span className="ip-btn ip-btn-up" />
      <span className="ip-btn ip-btn-down" />
      <span className="ip-btn ip-btn-power" />
      <div className={cn("ip-screen", screenClassName)}>
        <div className="ip-canvas">
          {children}
          <div className={cn("ip-status", status === "light" && "ip-status-light")}>
            <span className="ip-time">9:41</span>
            <span className="ip-icons">
              <svg viewBox="0 0 18 12" className="ip-signal">
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                <rect x="10" y="3" width="3" height="9" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
              </svg>
              <svg viewBox="0 0 16 12" className="ip-wifi">
                <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.2 10.2 0 0 0 8 .4 10.2 10.2 0 0 0 .8 3.3L2 4.6a8.5 8.5 0 0 1 6-2.4Z" />
                <path d="M8 5.6c1.4 0 2.6.5 3.6 1.4l1.2-1.3A7 7 0 0 0 8 3.8a7 7 0 0 0-4.8 1.9L4.4 7c1-.9 2.2-1.4 3.6-1.4Z" />
                <path d="M8 9c.5 0 1 .2 1.3.5L8 11.6 6.7 9.5C7 9.2 7.5 9 8 9Z" />
              </svg>
              <span className="ip-battery">
                <i />
              </span>
            </span>
          </div>
          <span className="ip-island" />
          <span className="ip-home" />
        </div>
      </div>
    </div>
  );
}
