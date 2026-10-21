/**
 * Demo data for a realistic Toronto pilot. Business names are fictional;
 * coordinates are along the real streets so the map looks right.
 * Phone numbers use the 555 range and emails use example.com.
 */
import type { Vertical } from "@ll/shared";

type Hours = Record<string, [string, string][]>;
const week = (open: string, close: string, opts: { sun?: [string, string] | null; sat?: [string, string]; closedMon?: boolean } = {}): Hours => ({
  mon: opts.closedMon ? [] : [[open, close]],
  tue: [[open, close]],
  wed: [[open, close]],
  thu: [[open, close]],
  fri: [[open, close]],
  sat: [opts.sat ?? [open, close]],
  sun: opts.sun === null ? [] : [opts.sun ?? ["10:00", "17:00"]],
});

export interface DemoNeighbourhood {
  slug: string;
  name: string;
  status: "scouting" | "pilot" | "live";
  centerLat: number;
  centerLng: number;
  radiusMetres: number;
  biaName: string;
  biaContactName: string;
  biaContactEmail: string;
  storefrontEstimate: number;
  notes: string;
}

export const NEIGHBOURHOODS: DemoNeighbourhood[] = [
  {
    slug: "roncesvalles",
    name: "Roncesvalles Village",
    status: "pilot",
    centerLat: 43.6465,
    centerLng: -79.4487,
    radiusMetres: 1100,
    biaName: "Roncesvalles Village BIA",
    biaContactName: "Jordan Kowalski",
    biaContactEmail: "bia-roncesvalles@example.com",
    storefrontEstimate: 260,
    notes: "Pilot strip. Strong mix of daily-visit cafés/bakeries and repair/service shops. BIA newsletter goes out first Monday of the month.",
  },
  {
    slug: "leslieville",
    name: "Leslieville",
    status: "scouting",
    centerLat: 43.6626,
    centerLng: -79.3335,
    radiusMetres: 1300,
    biaName: "Leslieville BIA",
    biaContactName: "Priya Raman",
    biaContactEmail: "bia-leslieville@example.com",
    storefrontEstimate: 220,
    notes: "Queen St E between Carlaw and Leslie. Scouting: lots of brunch spots and boutiques.",
  },
  {
    slug: "the-danforth",
    name: "The Danforth",
    status: "scouting",
    centerLat: 43.6777,
    centerLng: -79.35,
    radiusMetres: 1500,
    biaName: "Danforth Village BIA",
    biaContactName: "Nikos Pappas",
    biaContactEmail: "bia-danforth@example.com",
    storefrontEstimate: 310,
    notes: "Greektown stretch. Restaurants + grocers; Taste of the Danforth is the obvious campaign hook.",
  },
];

export interface DemoMerchant {
  slug: string;
  name: string;
  vertical: Vertical;
  neighbourhood: string;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  hours: Hours;
  description: string;
  brandColor: string;
  instagram: string;
  /** Relative popularity (visits weight) in the pilot. */
  weight: number;
  /** Typical ticket in cents [min, max]. */
  ticket: [number, number];
  /** Signed by the demo rep (done-for-you). */
  viaRep: boolean;
}

export const MERCHANTS: DemoMerchant[] = [
  { slug: "pinecone-coffee", name: "Pinecone Coffee Co.", vertical: "cafe", neighbourhood: "roncesvalles", address: "412 Roncesvalles Ave", postalCode: "M6R 2N2", lat: 43.6522, lng: -79.4504, hours: week("07:00", "18:00", { sun: ["08:00", "17:00"] }), description: "Small-batch espresso, oat milk at no extra charge, and the best window seat on Roncy.", brandColor: "#2F5D50", instagram: "pineconecoffee.to", weight: 10, ticket: [450, 1400], viaRep: true },
  { slug: "hearth-and-crumb", name: "Hearth & Crumb Bakery", vertical: "bakery", neighbourhood: "roncesvalles", address: "268 Roncesvalles Ave", postalCode: "M6R 2L9", lat: 43.6476, lng: -79.4489, hours: week("07:30", "17:00", { closedMon: true }), description: "Sourdough, croissants and Polish pączki on Saturdays. Bread sells out by 2pm.", brandColor: "#B5651D", instagram: "hearthandcrumb", weight: 8, ticket: [600, 2600], viaRep: true },
  { slug: "village-apothecary", name: "Village Apothecary", vertical: "pharmacy", neighbourhood: "roncesvalles", address: "333 Roncesvalles Ave", postalCode: "M6R 2M8", lat: 43.6497, lng: -79.4497, hours: week("09:00", "20:00", { sat: ["09:00", "18:00"], sun: ["11:00", "16:00"] }), description: "Independent pharmacy. Points on front-store items (never on prescriptions or pharmacy services).", brandColor: "#1E6FB8", instagram: "villageapothecary", weight: 6, ticket: [800, 6500], viaRep: true },
  { slug: "fix-it-phone-lab", name: "Fix-It Phone Lab", vertical: "repair_electronics", neighbourhood: "roncesvalles", address: "189 Roncesvalles Ave", postalCode: "M6R 2L5", lat: 43.6452, lng: -79.4479, hours: week("10:00", "19:00", { sun: ["12:00", "17:00"] }), description: "Same-day screen and battery repairs for phones, tablets and laptops.", brandColor: "#4B3F72", instagram: "fixitphonelab", weight: 2, ticket: [4900, 22900], viaRep: true },
  { slug: "westside-auto-care", name: "Westside Auto Care", vertical: "repair_auto", neighbourhood: "roncesvalles", address: "75 Howard Park Ave", postalCode: "M6R 1V7", lat: 43.6551, lng: -79.4535, hours: week("08:00", "18:00", { sun: null, sat: ["09:00", "14:00"] }), description: "Family-run garage since 1988. Brakes, tires, safeties and honest quotes.", brandColor: "#C0392B", instagram: "westsideautocare", weight: 1, ticket: [8900, 65000], viaRep: false },
  { slug: "bloom-hair-studio", name: "Bloom Hair Studio", vertical: "salon", neighbourhood: "roncesvalles", address: "220 Roncesvalles Ave", postalCode: "M6R 2L7", lat: 43.6463, lng: -79.4484, hours: week("10:00", "19:00", { closedMon: true, sun: null }), description: "Cuts, colour and balayage. Book online or walk in on weekdays.", brandColor: "#D35D8C", instagram: "bloomhair.to", weight: 3, ticket: [4500, 18000], viaRep: true },
  { slug: "straight-edge-barbers", name: "Straight Edge Barbers", vertical: "barber", neighbourhood: "roncesvalles", address: "151 Roncesvalles Ave", postalCode: "M6R 2L3", lat: 43.6443, lng: -79.4475, hours: week("09:00", "19:00", { sun: ["10:00", "16:00"] }), description: "Classic cuts and hot-towel shaves. Eighth cut's on us.", brandColor: "#222222", instagram: "straightedge.roncy", weight: 4, ticket: [3000, 5500], viaRep: false },
  { slug: "petal-and-stem", name: "Petal & Stem Florist", vertical: "florist", neighbourhood: "roncesvalles", address: "380 Roncesvalles Ave", postalCode: "M6R 2M9", lat: 43.6512, lng: -79.4501, hours: week("09:00", "18:00", { sun: ["10:00", "15:00"] }), description: "Seasonal bouquets, plants and same-day local delivery.", brandColor: "#6A994E", instagram: "petalandstem.to", weight: 2, ticket: [2500, 9500], viaRep: true },
  { slug: "dog-eared-books", name: "Dog-Eared Books", vertical: "bookstore", neighbourhood: "roncesvalles", address: "295 Roncesvalles Ave", postalCode: "M6R 2M3", lat: 43.6485, lng: -79.4492, hours: week("10:00", "20:00", { sun: ["11:00", "18:00"] }), description: "New and used books, kids' story time Saturdays at 11.", brandColor: "#7B2D26", instagram: "dogearedbooks.to", weight: 3, ticket: [1800, 6500], viaRep: true },
  { slug: "wag-and-whisker", name: "Wag & Whisker Pet Supply", vertical: "pet", neighbourhood: "roncesvalles", address: "445 Roncesvalles Ave", postalCode: "M6R 2N3", lat: 43.6531, lng: -79.4509, hours: week("09:00", "19:00", { sun: ["10:00", "17:00"] }), description: "Raw and kibble, treats, toys and self-serve dog wash.", brandColor: "#F4A259", instagram: "wagandwhisker", weight: 3, ticket: [2000, 9000], viaRep: false },
  { slug: "nonnas-table", name: "Nonna's Table", vertical: "restaurant", neighbourhood: "roncesvalles", address: "126 Roncesvalles Ave", postalCode: "M6R 2K9", lat: 43.6436, lng: -79.4471, hours: week("11:30", "22:00", { closedMon: true, sun: ["11:00", "21:00"] }), description: "Handmade pasta and wood-fired pizza. Sunday brunch.", brandColor: "#A4161A", instagram: "nonnastable.to", weight: 4, ticket: [2800, 11000], viaRep: true },
  { slug: "fresh-press-cleaners", name: "Fresh Press Cleaners", vertical: "dry_cleaning", neighbourhood: "roncesvalles", address: "350 Roncesvalles Ave", postalCode: "M6R 2M6", lat: 43.6503, lng: -79.4499, hours: week("07:30", "19:00", { sun: null, sat: ["09:00", "17:00"] }), description: "Dry cleaning, laundry by the pound and alterations. In by 9, out by 5.", brandColor: "#3A86FF", instagram: "freshpress.to", weight: 2, ticket: [1200, 4500], viaRep: false },
  { slug: "village-green-grocer", name: "Village Green Grocer", vertical: "grocery", neighbourhood: "roncesvalles", address: "398 Roncesvalles Ave", postalCode: "M6R 2N1", lat: 43.6517, lng: -79.4502, hours: week("08:00", "21:00", { sun: ["09:00", "20:00"] }), description: "Ontario produce, deli counter and pantry staples.", brandColor: "#38B000", instagram: "villagegreengrocer", weight: 6, ticket: [900, 7500], viaRep: true },
  { slug: "copper-kettle-pub", name: "The Copper Kettle Pub", vertical: "bar", neighbourhood: "roncesvalles", address: "245 Roncesvalles Ave", postalCode: "M6R 2L6", lat: 43.6469, lng: -79.4486, hours: week("12:00", "23:59", { sun: ["12:00", "22:00"] }), description: "Neighbourhood pub with 12 Ontario taps and Tuesday trivia.", brandColor: "#B87333", instagram: "copperkettle.roncy", weight: 3, ticket: [2200, 7500], viaRep: false },
  { slug: "rise-yoga-studio", name: "Rise Yoga Studio", vertical: "fitness", neighbourhood: "roncesvalles", address: "487 Roncesvalles Ave", postalCode: "M6R 2N5", lat: 43.6545, lng: -79.4515, hours: week("06:30", "21:00", { sun: ["08:00", "18:00"] }), description: "Vinyasa, yin and prenatal classes. First class free.", brandColor: "#8E7DBE", instagram: "riseyoga.to", weight: 3, ticket: [2000, 2500], viaRep: true },
  { slug: "stitch-perfect", name: "Stitch Perfect Tailoring", vertical: "alterations", neighbourhood: "roncesvalles", address: "172 Roncesvalles Ave", postalCode: "M6R 2L4", lat: 43.6448, lng: -79.4477, hours: week("10:00", "18:00", { sun: null }), description: "Hems, zippers and suit tailoring, usually ready in 3 days.", brandColor: "#5E548E", instagram: "stitchperfect.to", weight: 1, ticket: [1500, 6000], viaRep: false },
  // A couple of early sign-ups on the next strips.
  { slug: "leslie-loaf", name: "Leslie Loaf", vertical: "bakery", neighbourhood: "leslieville", address: "1120 Queen St E", postalCode: "M4M 1K8", lat: 43.6618, lng: -79.3371, hours: week("07:00", "16:00", { closedMon: true }), description: "Morning buns and rye loaves.", brandColor: "#9C6644", instagram: "leslieloaf", weight: 0, ticket: [500, 2000], viaRep: true },
  { slug: "danforth-family-pharmacy", name: "Danforth Family Pharmacy", vertical: "pharmacy", neighbourhood: "the-danforth", address: "512 Danforth Ave", postalCode: "M4K 1P6", lat: 43.6781, lng: -79.3489, hours: week("09:00", "19:00", { sun: null }), description: "Family pharmacy and compounding.", brandColor: "#0077B6", instagram: "danforthfamilypharmacy", weight: 0, ticket: [800, 5000], viaRep: true },
];

export const FIRST_NAMES = [
  "Ava", "Liam", "Olivia", "Noah", "Emma", "Lucas", "Sophia", "Ethan", "Mia", "Mason", "Chloe", "Leo", "Zoe", "Arjun", "Priya", "Wei", "Mei", "Hiroshi", "Yuki", "Fatima",
  "Omar", "Amara", "Kwame", "Sofia", "Mateo", "Isabella", "Gabriel", "Ana", "Tomasz", "Kasia", "Marta", "Piotr", "Nikos", "Eleni", "Siobhan", "Declan", "Aisha", "Hassan", "Grace", "Daniel",
];
export const LAST_NAMES = [
  "Nguyen", "Smith", "Patel", "Kowalski", "Chen", "Wong", "Singh", "Brown", "Tremblay", "Gagnon", "Silva", "Santos", "Murphy", "O'Brien", "Kim", "Lee", "Ali", "Khan", "Novak", "Papadopoulos",
  "Rossi", "Romano", "Haddad", "Mensah", "Okafor", "Ivanova", "Garcia", "Martinez", "Wilson", "Campbell",
];

export interface DemoLead {
  businessName: string;
  vertical: Vertical;
  neighbourhood: string;
  address: string;
  contactName: string;
  stage: "new" | "contacted" | "visit_booked" | "lost";
  currentLoyalty: string;
  notes: string;
  activities: { kind: "call" | "email" | "visit" | "note"; outcome: string; notes: string; daysAgo: number }[];
  nextActionInDays: number | null;
}

export const LEADS: DemoLead[] = [
  { businessName: "Queen East Coffee House", vertical: "cafe", neighbourhood: "leslieville", address: "1095 Queen St E", contactName: "Marisol", stage: "visit_booked", currentLoyalty: "paper punch card", notes: "Wants it running before the holiday rush.", activities: [{ kind: "call", outcome: "interested", notes: "Asked about the counter stand.", daysAgo: 6 }, { kind: "email", outcome: "sent one-pager", notes: "", daysAgo: 5 }], nextActionInDays: 2 },
  { businessName: "Carlaw Cycle Repair", vertical: "repair_electronics", neighbourhood: "leslieville", address: "1001 Queen St E", contactName: "Theo", stage: "contacted", currentLoyalty: "none", notes: "Big fit for Pro later (repair approvals).", activities: [{ kind: "visit", outcome: "left kit", notes: "Owner was busy; come back Thursday.", daysAgo: 3 }], nextActionInDays: 1 },
  { businessName: "Greenwood Grocer", vertical: "grocery", neighbourhood: "the-danforth", address: "1400 Danforth Ave", contactName: "Dimitra", stage: "new", currentLoyalty: "SoPoints", notes: "Currently on SoPoints — pitch free migration.", activities: [], nextActionInDays: 0 },
  { businessName: "Pappas Souvlaki", vertical: "restaurant", neighbourhood: "the-danforth", address: "650 Danforth Ave", contactName: "Yannis", stage: "contacted", currentLoyalty: "none", notes: "", activities: [{ kind: "call", outcome: "call back", notes: "Lunch rush, try after 3pm.", daysAgo: 2 }], nextActionInDays: 3 },
  { businessName: "Leslieville Pet Spa", vertical: "pet", neighbourhood: "leslieville", address: "1220 Queen St E", contactName: "Rachel", stage: "lost", currentLoyalty: "Square Loyalty", notes: "Happy with Square for now. Revisit when Square integration ships.", activities: [{ kind: "visit", outcome: "not interested", notes: "Paying $60/mo for Square Loyalty but fine with it.", daysAgo: 12 }], nextActionInDays: 60 },
  { businessName: "Danforth Dry Cleaning", vertical: "dry_cleaning", neighbourhood: "the-danforth", address: "700 Danforth Ave", contactName: "Sun", stage: "new", currentLoyalty: "paper punch card", notes: "", activities: [], nextActionInDays: 4 },
  { businessName: "Roncy Bike Shop", vertical: "retail", neighbourhood: "roncesvalles", address: "460 Roncesvalles Ave", contactName: "Marek", stage: "visit_booked", currentLoyalty: "none", notes: "Saw the counter stand at Pinecone.", activities: [{ kind: "call", outcome: "booked visit", notes: "Tuesday 10am.", daysAgo: 1 }], nextActionInDays: 5 },
  { businessName: "Sorauren Tea Room", vertical: "cafe", neighbourhood: "roncesvalles", address: "95 Roncesvalles Ave", contactName: "Agnes", stage: "contacted", currentLoyalty: "stamp app", notes: "Uses a stamp app; wants to import 300 customers (CSV import).", activities: [{ kind: "email", outcome: "sent migration guide", notes: "", daysAgo: 4 }], nextActionInDays: 1 },
];
