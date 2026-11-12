/**
 * Where "Turn it off" (the visit-counting notice) sends the visitor back to: the page they were on, at the confirmation line.
 * Only the pages that carry the notice are allowed as `next` (the home page and the three trade pages); anything else goes home.
 */
const BACK = /^\/(for-(nail-techs|barbers|groomers)(\?trade=(brows|lashes|makeup))?)?$/;

/** The id of the confirmation line (components/marketing/landing-ab/CountingOff.tsx), shown when it is the URL's target. */
export const COUNTING_OFF_ID = "counting-off";

export function landingOffDestination(next: string | null | undefined): string {
  return `${next && BACK.test(next) ? next : "/"}#${COUNTING_OFF_ID}`;
}
