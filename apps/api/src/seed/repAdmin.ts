/**
 * Rep and admin demo data: a street day today on the Danforth (about 14 open shops on one street, a few
 * already visited), a remote setup session, a website lead, and an area plan for the next weeks.
 */
import { eq } from "drizzle-orm";
import { leadActivities, leads, neighbourhoods, users, type Db } from "@ll/db";

const DAY = 86400000;
const STREET = [
  ["Greek Village Bakery", "bakery", "601 Danforth Ave", 43.6784, -79.3471],
  ["Pape Pharmacy", "pharmacy", "603 Danforth Ave", 43.6786, -79.3466],
  ["Danforth Books", "retail", "605 Danforth Ave", 43.6787, -79.3462],
  ["Olympic Tailors", "tailor", "609 Danforth Ave", 43.6789, -79.3455],
  ["Taverna Kyma", "restaurant", "611 Danforth Ave", 43.679, -79.3451],
  ["Pantheon Souvlaki", "restaurant", "615 Danforth Ave", 43.6793, -79.3444],
  ["Hellenic Gifts", "retail", "619 Danforth Ave", 43.6796, -79.3436],
  ["Mt. Pleasant Salon", "salon", "621 Danforth Ave", 43.6797, -79.3431],
  ["Cafe Alexandros", "cafe", "602 Danforth Ave", 43.6781, -79.3469],
  ["Danforth Dry Clean", "dry_cleaning", "606 Danforth Ave", 43.6783, -79.3461],
  ["Athens Grocer", "grocery", "610 Danforth Ave", 43.6786, -79.3452],
  ["Phone Fix Danforth", "repair_electronics", "614 Danforth Ave", 43.6789, -79.3443],
  ["Pet Spa Danforth", "pet", "618 Danforth Ave", 43.6791, -79.3435],
  ["Baklava Brothers", "bakery", "622 Danforth Ave", 43.6794, -79.3427],
] as const;

export async function seedRepAdmin(db: Db, o: { repId: string; log: (m: string) => void; today?: Date }) {
  const now = o.today ?? new Date();
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(d);
  const [hood] = await db.select().from(neighbourhoods).where(eq(neighbourhoods.slug, "the-danforth")).limit(1);
  if (!hood) return;
  await db.update(neighbourhoods).set({ streetDayOn: ymd(now), streetDayRepId: o.repId, opensOn: ymd(new Date(now.getTime() - 3 * DAY)), targetShops: 30 }).where(eq(neighbourhoods.id, hood.id));
  // Next areas on the plan, so the admin calendar has something to show (no street day assigned yet).
  const others = await db.select().from(neighbourhoods);
  for (const [i, h] of others.filter((x) => x.id !== hood.id).entries()) {
    await db.update(neighbourhoods).set({ opensOn: ymd(new Date(now.getTime() + (3 + i * 7) * DAY)), streetDayOn: ymd(new Date(now.getTime() + (6 + i * 7) * DAY)) }).where(eq(neighbourhoods.id, h.id));
  }
  const inserted: string[] = [];
  for (const [i, [name, vertical, address, lat, lng]] of STREET.entries()) {
    const [l] = await db
      .insert(leads)
      .values({ businessName: name, vertical, address, lat: i % 3 === 2 ? null : lat, lng: i % 3 === 2 ? null : lng, neighbourhoodId: hood.id, stage: "new", source: "street", assignedRepId: o.repId, createdAt: new Date(now.getTime() - 2 * DAY) })
      .returning({ id: leads.id });
    inserted.push(l!.id);
  }
  // Three already visited this morning so the progress bar and "done" list are real.
  const morning = [
    { i: 0, outcome: "come_back", stage: "contacted" },
    { i: 1, outcome: "not_in", stage: "contacted" },
    { i: 2, outcome: "not_interested", stage: "lost" },
  ];
  for (const m of morning) {
    await db.update(leads).set({ stage: m.stage }).where(eq(leads.id, inserted[m.i]!));
    await db.insert(leadActivities).values({ leadId: inserted[m.i]!, repUserId: o.repId, kind: "visit", outcome: m.outcome, createdAt: new Date(now.getTime() - 40 * 60000), clientId: `seed-street-${m.i}` });
  }
  await db.insert(leads).values({
    businessName: "Biryani Hub",
    vertical: "restaurant",
    phone: "+14165550177",
    language: "ur",
    source: "website",
    stage: "new",
    notes: "[website: restaurant]\nWants a call about WhatsApp ordering.",
    createdAt: new Date(now.getTime() - 25 * 60000),
  });
  await db.insert(leads).values({
    businessName: "Spice Route Grocers",
    vertical: "grocery",
    address: "412 Danforth Ave",
    phone: "+14165550178",
    source: "phone",
    stage: "visit_booked",
    assignedRepId: o.repId,
    neighbourhoodId: hood.id,
    setupAt: new Date(now.getTime() + 10 * 60000),
    setupChannel: "whatsapp",
    nextActionAt: new Date(now.getTime() - 60000),
    notes: "Remote setup over WhatsApp video. Owner prefers Punjabi.",
    language: "pa",
    createdAt: new Date(now.getTime() - 3 * DAY),
  });
  const [{ id } = { id: "" }] = await db.select({ id: users.id }).from(users).where(eq(users.id, o.repId)).limit(1);
  o.log(`Street day: ${STREET.length} Danforth shops (rep ${id.slice(0, 8)}), 1 setup session, 1 website lead`);
}
