import { BEACON_SCRIPT } from "./beacon-script";

/** English only, like the landing pages it sits on (value-props §3.6: the purpose in plain words, at the point of collection). */
const NOTICE = { text: "We count visits to this page ourselves to see which words work. No ad trackers.", off: "Turn it off" } as const;

/**
 * The A/B measurement for one landing variant: the one-line notice with its off switch, then the inline beacon (beacon-script.ts).
 * Rendered by the internal variant routes after <SoloLanding>, so the page components stay untouched. Excluded visitors (GPC,
 * counting off, staff) are never rewritten to a variant route and never get this.
 */
export function LandingMeasure({ path }: { path: string }) {
  return (
    <>
      <p className="mx-auto max-w-5xl px-4 py-5 text-center text-sm text-muted-foreground" data-landing-notice>
        {NOTICE.text}{" "}
        <a className="font-medium text-foreground underline underline-offset-2" href={`/api/public/landing-off?next=${encodeURIComponent(path)}`} rel="nofollow">
          {NOTICE.off}
        </a>
      </p>
      <script dangerouslySetInnerHTML={{ __html: BEACON_SCRIPT }} />
    </>
  );
}
