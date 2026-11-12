import { COUNTING_OFF_ID } from "@/lib/marketing/landing-off";

/** English only, like the notice it answers (LandingMeasure). */
export const COUNTING_OFF_TEXT = "Counting is off on this browser. Nothing else changes.";

/**
 * The line that confirms "Turn it off": the opt-out route sends the visitor back to the same page at #counting-off, and this line shows
 * only as the URL's target (plain CSS, so the static trade pages need no script). The home page is static and always carries the
 * notice, so LandingMeasure's inline script also swaps the notice for this line on later visits there.
 */
export function CountingOff() {
  return (
    <>
      <p id={COUNTING_OFF_ID} role="status" className="mx-auto hidden max-w-5xl scroll-mt-28 px-4 py-5 text-center text-sm text-muted-foreground target:block" data-landing-off suppressHydrationWarning>
        {COUNTING_OFF_TEXT}
      </p>
      <script dangerouslySetInnerHTML={{ __html: COUNTING_OFF_SCROLL_SCRIPT }} />
    </>
  );
}

/**
 * The sections above this line size themselves lazily (content-visibility: auto), so the browser's own jump to #counting-off lands
 * short of it on the long trade pages and the visitor never sees the confirmation. Once the page has loaded, bring the line into view,
 * and keep it there until the sections above have settled or the visitor scrolls. Does nothing on any other visit.
 */
export const COUNTING_OFF_SCROLL_SCRIPT = `(function(){try{if(location.hash!=="#${COUNTING_OFF_ID}")return;var e=document.getElementById("${COUNTING_OFF_ID}"),n=0,ok=0,stop=false;if(!e)return;var halt=function(){stop=true};addEventListener("wheel",halt,{passive:true,once:true});addEventListener("touchstart",halt,{passive:true,once:true});addEventListener("keydown",halt,{once:true});var go=function(){if(stop)return;var r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight){ok=0;e.scrollIntoView({block:"center"})}else ok++;if(ok<4&&++n<40)setTimeout(go,120)};if(document.readyState==="complete")go();else addEventListener("load",go)}catch(_){}})();`;
