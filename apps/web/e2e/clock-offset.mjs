// Prints the TEST_CLOCK_OFFSET_MS that moves "now" to a chosen weekday (default Wednesday, 11:00 America/Toronto),
// the next such moment from now (0 to 7 days ahead; never behind real time, because the web app checks the API's tokens
// against the real clock and a token issued in the past would already look expired). Demo promos run on Tuesdays and weekday afternoons,
// so a fixed non-promo day keeps stamp and point assertions the same every day of the week.
//   node clock-offset.mjs [weekday]      weekday: mon..sun, or "real" for no shift (prints 0)
const arg = (process.argv[2] ?? "wed").toLowerCase();
if (arg === "real" || arg === "0") { console.log("0"); process.exit(0); }
const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const target = names.indexOf(arg.slice(0, 3));
if (target < 0) { console.error(`unknown weekday "${arg}"`); process.exit(1); }
const TZ = "America/Toronto";
const HOUR = Number(process.env.E2E_CLOCK_HOUR ?? 11);
const parts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
const now = new Date();
const today = parts(now);
const todayUtc = Date.UTC(+today.year, +today.month - 1, +today.day);
let best = null;
for (let delta = 0; delta <= 7 && !best; delta++) {
  const day = new Date(todayUtc + delta * 86400000); // calendar date in Toronto, carried as UTC midnight
  if (day.getUTCDay() !== target) continue;
  // 11:00 Toronto on that date: try both offsets (EST/EDT) and keep the one that reads back as HOUR:00.
  for (const off of [4, 5]) {
    const t = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), HOUR + off));
    if (+parts(t).hour === HOUR && +parts(t).day === day.getUTCDate() && t.getTime() > now.getTime() + 60_000) best = t;
  }
}
console.log(String(best.getTime() - now.getTime()));
