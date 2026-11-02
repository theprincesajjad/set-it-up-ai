import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/copy/en-CA";
import { IPhone } from "./device/IPhone";
import { PassPhone } from "./home/mocks";
import "./home/home.css";

/**
 * Sign-in: the form sits on a white card (the one thing to do on the page). Wave Q: beside it on wide screens, the product instead of
 * the tile art: a customer's stamp card on an iPhone over a quiet stage, with one glass note (sample data, like the home page), and
 * the promises under it. The picture is decorative and drops away on phones, so the form comes first.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const promises = copy.landing.heroTrust.split(" · ");
  const note = copy.landing.hero.floats[0]!;
  return (
    <div className="mx-auto grid max-w-[1200px] items-start gap-10 px-4 py-10 md:grid-cols-[1fr_1.05fr] md:gap-14 md:px-8 md:py-16">
      <aside className="max-md:hidden md:sticky md:top-24">
        <div aria-hidden className="auth-stage relative flex justify-center overflow-hidden rounded-[32px] bg-card px-6 pt-10 shadow-[inset_0_0_0_1px_var(--border)]">
          <IPhone className="auth-phone">
            <PassPhone />
          </IPhone>
          <span className="hm-float glass-sheet auth-note">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/icons3d/${note.icon}@2x.png`} alt="" width={32} height={32} loading="lazy" decoding="async" />
            <span>
              <b>{note.b}</b>
              <small>{note.s}</small>
            </span>
          </span>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-3">
          {promises.map((p) => (
            <li key={p} className="flex items-center gap-3 text-body text-foreground">
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </aside>
      <div className="rounded-sheet bg-card p-6 card-clear md:p-10">{children}</div>
    </div>
  );
}
