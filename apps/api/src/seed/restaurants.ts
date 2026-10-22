/**
 * Demo corridor for the restaurant pack: "Ridgeway Plaza", a fictional South Asian food strip in
 * Mississauga. Ten fictional shops across every restaurant tier (a Pro Hyderabadi biryani house with a
 * banquet hall and kitchen display, Growth Lahori / Gujarati tiffin / catering kitchens, Starter dhaba,
 * mithai, Bangladeshi, Sri Lankan and Afghan shops) plus a non-food neighbour in the loyalty network.
 *
 * Business names, phones (555 range), emails (example.com), halal certifiers and addresses are
 * fictional. Points only move through services/ledger.ts (awardPurchase / redeemReward); afterwards
 * only timestamps are back-dated. Everything else is inserted as consistent rows (orders, tiffin
 * subscriptions, catering, halls, WhatsApp, phone calls, reviews).
 *
 * Deterministic (seeded RNG, relative dates) and idempotent (skips when the neighbourhood exists).
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { FeatureKey, Vertical } from "@ll/shared";
import {
  catalogItems,
  cateringEvents,
  featureOverrides,
  hallBookings,
  halls,
  ledgerTransactions,
  merchantAddOns,
  merchantCategories,
  merchantCounters,
  merchantMembers,
  merchantStaff,
  merchants,
  messages,
  neighbourhoods,
  networkPerkAwards,
  networkPerks,
  orderItems,
  orderSplits,
  orders,
  phoneCalls,
  redemptions,
  reviewRequests,
  rewards,
  subscriptions,
  tiffinCharges,
  tiffinDeliveries,
  tiffinMenus,
  tiffinPlans,
  tiffinRoutes,
  tiffinSkips,
  tiffinSubscriptions,
  users,
  visits,
  whatsappSessions,
  type Db,
  type DietaryTags,
  type Translations,
} from "@ll/db";
import { loadConfig, type Config } from "../config.js";
import type { AppContext } from "../context.js";
import { createProviders } from "../providers/index.js";
import { awardPurchase, findOrCreateCustomerByPhone, generateMemberCode, redeemReward } from "../services/ledger.js";
import { createMerchantWithTemplate } from "../services/merchant.js";
import { computeTax } from "../services/tax.js";

const DAY = 86400000;
const MIN = 60000;

type Tier = "starter" | "growth" | "pro";
type Hours = Record<string, [string, string][]>;

export const CORRIDOR_SLUG = "ridgeway-plaza";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
  };
}

const week = (open: string, close: string, o: { sun?: [string, string] | null; closedMon?: boolean } = {}): Hours => ({
  mon: o.closedMon ? [] : [[open, close]],
  tue: [[open, close]],
  wed: [[open, close]],
  thu: [[open, close]],
  fri: [[open, close]],
  sat: [[open, close]],
  sun: o.sun === null ? [] : [o.sun ?? [open, close]],
});

/** Local (America/Toronto) calendar date key, YYYY-MM-DD. */
const dateKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

interface DishTags {
  veg?: boolean;
  vegan?: boolean;
  jain?: boolean;
  gf?: boolean;
  spice?: 0 | 1 | 2 | 3;
  al?: string[];
  /** Not halal even when the shop is (e.g. nothing today); leave unset normally. */
  noHalal?: boolean;
}
interface Dish {
  name: string;
  desc?: string;
  price: number;
  tags?: DishTags;
  /** Names in [hi, ur, pa] (Devanagari, Urdu, Gurmukhi). */
  tr?: [string, string, string];
  /** Descriptions in [hi, ur, pa]. */
  trd?: [string, string, string];
  station?: "tandoor" | "curry" | "rice";
  /** Pre-order only: lead hours, serves, deposit bps. */
  pre?: { lead: number; serves: number; dep: number };
  category?: string;
}

interface Shop {
  slug: string;
  name: string;
  vertical: Vertical;
  tier: Tier | null;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  hours: Hours;
  description: string;
  brandColor: string;
  instagram: string;
  languages: string[];
  founding?: boolean;
  /** Halal claim by the shop itself (never claimed for them by us). */
  halal?: { zabihah: boolean; certifier?: string };
  cashDiscountBps?: number;
  preorderDailyCap?: number;
  whatsapp?: string;
  menu: Dish[];
  /** Order volume over the last 30 days and the mix of channels. */
  orderPlan?: { n: number; mix: Partial<Record<"pickup" | "counter" | "whatsapp" | "phone" | "preorder" | "tiffin" | "catering", number>> };
  /** Weight for plain loyalty visits (walk-ins that aren't orders). */
  visitWeight: number;
  ticket: [number, number];
  reward?: { name: string; pointsCost: number };
  /** Days ago the shop joined. */
  joinedDaysAgo: number;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
const NAWAB_CERT = "Crescent Halal Council";
const LAHORI_CERT = "Al-Amanah Halal Certification";
const AFGHAN_CERT = "Safa Halal Certification";

const nawabMenu: Dish[] = [
  { name: "Hyderabadi Chicken Dum Biryani", desc: "Basmati and bone-in chicken sealed and slow-cooked on dum, with mirchi ka salan and raita.", price: 1899, station: "rice", tags: { spice: 2, al: ["dairy"] }, tr: ["हैदराबादी चिकन दम बिरयानी", "حیدرآبادی چکن دم بریانی", "ਹੈਦਰਾਬਾਦੀ ਚਿਕਨ ਦਮ ਬਿਰਯਾਨੀ"], trd: ["धीमी आँच पर दम पर पकी बासमती और मसालेदार चिकन, मिर्ची का सालन और रायते के साथ।", "ہلکی آنچ پر دم پر پکی باسمتی اور مسالہ دار چکن، مرچی کا سالن اور رائتے کے ساتھ۔", "ਹੌਲੀ ਅੱਗ ਤੇ ਦਮ ਤੇ ਪੱਕੇ ਬਾਸਮਤੀ ਚੌਲ ਤੇ ਮਸਾਲੇਦਾਰ ਚਿਕਨ, ਮਿਰਚੀ ਦੇ ਸਾਲਣ ਤੇ ਰਾਇਤੇ ਨਾਲ।"] },
  { name: "Hyderabadi Goat Dum Biryani", desc: "Bone-in goat marinated overnight, layered with saffron rice and sealed with dough.", price: 2299, station: "rice", tags: { spice: 3, al: ["dairy"] }, tr: ["हैदराबादी मटन दम बिरयानी", "حیدرآبادی مٹن دم بریانی", "ਹੈਦਰਾਬਾਦੀ ਮਟਨ ਦਮ ਬਿਰਯਾਨੀ"], trd: ["रात भर मैरिनेट किया हुआ बकरे का मांस, केसर वाले चावल की परतों के साथ।", "رات بھر میرینیٹ کیا ہوا بکرے کا گوشت، زعفرانی چاولوں کی تہوں کے ساتھ۔", "ਰਾਤ ਭਰ ਮਸਾਲੇ ਵਿੱਚ ਰੱਖਿਆ ਬੱਕਰੇ ਦਾ ਮੀਟ, ਕੇਸਰ ਵਾਲੇ ਚੌਲਾਂ ਦੀਆਂ ਪਰਤਾਂ ਨਾਲ।"] },
  { name: "Vegetable Dum Biryani", desc: "Seasonal vegetables and paneer on dum with fried onion and mint.", price: 1699, station: "rice", tags: { veg: true, spice: 1, al: ["dairy"] }, tr: ["वेज दम बिरयानी", "ویج دم بریانی", "ਵੈਜ ਦਮ ਬਿਰਯਾਨੀ"] },
  { name: "Mirchi ka Salan", desc: "Green chillies in a peanut, sesame and tamarind gravy.", price: 799, station: "curry", tags: { veg: true, vegan: true, gf: true, spice: 2, al: ["peanuts", "sesame"] }, tr: ["मिर्ची का सालन", "مرچی کا سالن", "ਮਿਰਚੀ ਦਾ ਸਾਲਣ"] },
  { name: "Bagara Baingan", desc: "Baby aubergines in a tangy peanut and coconut gravy.", price: 999, station: "curry", tags: { veg: true, vegan: true, gf: true, spice: 2, al: ["peanuts", "sesame"] }, tr: ["बघारे बैंगन", "بگھارے بیگن", "ਬਘਾਰੇ ਬੈਂਗਣ"] },
  { name: "Haleem", desc: "Slow-cooked wheat, lentils and beef, topped with fried onion, lemon and ginger.", price: 1499, station: "curry", tags: { spice: 2, al: ["wheat"] }, tr: ["हलीम", "حلیم", "ਹਲੀਮ"] },
  { name: "Nihari", desc: "Beef shank stewed overnight in a rich spiced gravy.", price: 1899, station: "curry", tags: { spice: 2, al: ["wheat"] }, tr: ["निहारी", "نہاری", "ਨਿਹਾਰੀ"] },
  { name: "Butter Chicken", desc: "Tandoori chicken in a creamy tomato and fenugreek sauce.", price: 1799, station: "curry", tags: { spice: 1, gf: true, al: ["dairy", "nuts"] }, tr: ["बटर चिकन", "بٹر چکن", "ਬਟਰ ਚਿਕਨ"] },
  { name: "Chicken Tikka", desc: "Yogurt and chili marinated chicken thigh from the tandoor.", price: 1499, station: "tandoor", tags: { spice: 2, gf: true, al: ["dairy"] }, tr: ["चिकन टिक्का", "چکن تکہ", "ਚਿਕਨ ਟਿੱਕਾ"] },
  { name: "Seekh Kebab", desc: "Minced beef and herbs on skewers, finished in the tandoor.", price: 1399, station: "tandoor", tags: { spice: 2, gf: true }, tr: ["सीख कबाब", "سیخ کباب", "ਸੀਖ ਕਬਾਬ"] },
  { name: "Tandoori Chicken (half)", desc: "Half a bone-in chicken, charred and juicy.", price: 1599, station: "tandoor", tags: { spice: 2, gf: true, al: ["dairy"] }, tr: ["तंदूरी चिकन (आधा)", "تندوری چکن (آدھا)", "ਤੰਦੂਰੀ ਚਿਕਨ (ਅੱਧਾ)"] },
  { name: "Garlic Naan", desc: "Tandoor-baked bread brushed with garlic butter.", price: 399, station: "tandoor", tags: { veg: true, al: ["wheat", "dairy"] }, tr: ["लहसुन नान", "لہسن نان", "ਲਸਣ ਨਾਨ"] },
  { name: "Double ka Meetha", desc: "Hyderabadi bread pudding with saffron, cardamom and nuts.", price: 699, tags: { veg: true, al: ["wheat", "dairy", "nuts"] }, tr: ["डबल का मीठा", "ڈبل کا میٹھا", "ਡਬਲ ਦਾ ਮਿੱਠਾ"] },
  { name: "Qubani ka Meetha", desc: "Stewed apricots with cream and almonds.", price: 799, tags: { veg: true, gf: true, al: ["dairy", "nuts"] }, tr: ["खुबानी का मीठा", "خوبانی کا میٹھا", "ਖੁਬਾਨੀ ਦਾ ਮਿੱਠਾ"] },
  { name: "Irani Chai", desc: "Milky, sweet and strong, the Hyderabad café way.", price: 399, tags: { veg: true, gf: true, al: ["dairy"] }, tr: ["ईरानी चाय", "ایرانی چائے", "ਇਰਾਨੀ ਚਾਹ"] },
  { name: "Chicken Biryani Degh (serves 15)", desc: "A full sealed pot for family gatherings. 24 hours notice.", price: 18900, station: "rice", tags: { spice: 2, al: ["dairy"] }, pre: { lead: 24, serves: 15, dep: 3000 }, tr: ["चिकन बिरयानी देग (15 लोगों के लिए)", "چکن بریانی دیگ (15 افراد کے لیے)", "ਚਿਕਨ ਬਿਰਯਾਨੀ ਦੇਗ (15 ਜਣਿਆਂ ਲਈ)"] },
  { name: "Goat Biryani Degh (serves 15)", desc: "Full pot of goat dum biryani with salan and raita. 48 hours notice.", price: 26900, station: "rice", tags: { spice: 3, al: ["dairy"] }, pre: { lead: 48, serves: 15, dep: 3000 }, tr: ["मटन बिरयानी देग (15 लोगों के लिए)", "مٹن بریانی دیگ (15 افراد کے لیے)", "ਮਟਨ ਬਿਰਯਾਨੀ ਦੇਗ (15 ਜਣਿਆਂ ਲਈ)"] },
  { name: "Vegetable Biryani Degh (serves 15)", price: 15900, station: "rice", tags: { veg: true, spice: 1, al: ["dairy"] }, pre: { lead: 24, serves: 15, dep: 3000 }, tr: ["वेज बिरयानी देग (15 लोगों के लिए)", "ویج بریانی دیگ (15 افراد کے لیے)", "ਵੈਜ ਬਿਰਯਾਨੀ ਦੇਗ (15 ਜਣਿਆਂ ਲਈ)"] },
];

const lahoriMenu: Dish[] = [
  { name: "Chicken Karahi (serves 2 to 3)", desc: "Cooked fast in a wok with tomato, ginger, green chili and black pepper. No cream, no shortcuts.", price: 2299, tags: { spice: 3, gf: true, al: ["dairy"] } },
  { name: "Mutton Karahi (serves 2 to 3)", desc: "Goat on the bone in its own juices with tomato and ginger.", price: 2899, tags: { spice: 3, gf: true } },
  { name: "Chapli Kebab", desc: "Peshawari-style beef patties with pomegranate seed and coriander, two pieces.", price: 1299, tags: { spice: 2, al: ["wheat"] } },
  { name: "Seekh Kebab Platter", desc: "Four beef and chicken seekh kebabs with naan, chutney and salad.", price: 1699, tags: { spice: 2, al: ["wheat", "dairy"] } },
  { name: "Chicken Tikka Boti (8 pc)", price: 1599, tags: { spice: 2, gf: true, al: ["dairy"] } },
  { name: "Beef Nihari", desc: "Overnight shank stew served with ginger, green chili and a kulcha.", price: 1699, tags: { spice: 2, al: ["wheat"] } },
  { name: "Siri Paye", desc: "Slow-cooked trotters and head, a Lahori Sunday breakfast.", price: 1599, tags: { spice: 2 } },
  { name: "Lahori Fried Fish", desc: "Spiced basa fillets fried in a gram flour batter.", price: 1899, tags: { spice: 2, al: ["fish"] } },
  { name: "Tandoori Naan", price: 249, tags: { veg: true, al: ["wheat"] } },
  { name: "Sweet Lassi", price: 549, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Falooda", desc: "Rose syrup, vermicelli, basil seeds and kulfi.", price: 799, tags: { veg: true, al: ["dairy", "nuts", "wheat"] } },
  { name: "Gajar ka Halwa", price: 599, tags: { veg: true, gf: true, al: ["dairy", "nuts"] } },
  { name: "Chicken Karahi Degh (serves 20)", desc: "A full degh for walima, aqiqah or Friday gatherings. 48 hours notice, 30% deposit.", price: 24900, tags: { spice: 2, gf: true, al: ["dairy"] }, pre: { lead: 48, serves: 20, dep: 3000 } },
  { name: "Mutton Pulao Degh (serves 20)", price: 32900, tags: { spice: 1, gf: true }, pre: { lead: 48, serves: 20, dep: 3000 } },
  { name: "Zarda Degh (serves 20)", desc: "Sweet saffron rice with nuts and khoya.", price: 14900, tags: { veg: true, gf: true, al: ["dairy", "nuts"] }, pre: { lead: 48, serves: 20, dep: 3000 } },
  { name: "BBQ Tray: Seekh, Boti and Chapli (serves 12)", price: 17900, tags: { spice: 2, al: ["wheat", "dairy"] }, pre: { lead: 48, serves: 12, dep: 3000 } },
];

const thaliMenu: Dish[] = [
  { name: "Gujarati Thali (lunch)", desc: "Two shaak, dal, kadhi, rice, rotli, farsan, shrikhand and chaas.", price: 1599, tags: { veg: true, spice: 1, al: ["wheat", "dairy", "peanuts"] } },
  { name: "Jain Thali (lunch)", desc: "Prepared without onion, garlic or root vegetables.", price: 1599, tags: { veg: true, jain: true, spice: 1, al: ["wheat", "dairy"] } },
  { name: "Undhiyu with Puri", desc: "Winter vegetables and muthia slow-cooked with coconut and sesame.", price: 1399, tags: { veg: true, vegan: true, spice: 2, al: ["wheat", "sesame", "peanuts"] } },
  { name: "Khaman Dhokla", desc: "Steamed chickpea flour cake with mustard seed and green chili.", price: 799, tags: { veg: true, vegan: true, gf: true, spice: 1 } },
  { name: "Methi Thepla (4 pc) with Chhundo", price: 899, tags: { veg: true, vegan: true, spice: 1, al: ["wheat"] } },
  { name: "Fafda Jalebi", desc: "Crisp gram flour fafda with papaya chutney and warm jalebi.", price: 999, tags: { veg: true, vegan: true, al: ["wheat"] } },
  { name: "Sev Khamani", price: 799, tags: { veg: true, vegan: true, gf: true, spice: 1, al: ["peanuts"] } },
  { name: "Khichdi Kadhi", desc: "Moong dal khichdi with tangy yogurt kadhi and ghee.", price: 1299, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Dal Dhokli", price: 1299, tags: { veg: true, vegan: true, spice: 1, al: ["wheat", "peanuts"] } },
  { name: "Masala Chaas", price: 399, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Shrikhand (cup)", price: 599, tags: { veg: true, gf: true, al: ["dairy", "nuts"] } },
  { name: "Trial Tiffin: Single Lunch", desc: "Try the tiffin before you subscribe.", price: 1299, tags: { veg: true, al: ["wheat", "dairy"] } },
];

const dhabaMenu: Dish[] = [
  { name: "Sarson da Saag and Makki di Roti", desc: "Slow-simmered mustard greens with white butter and corn flatbread.", price: 1499, tags: { veg: true, gf: true, spice: 1, al: ["dairy"] }, tr: ["सरसों का साग और मक्की की रोटी", "سرسوں کا ساگ اور مکئی کی روٹی", "ਸਰ੍ਹੋਂ ਦਾ ਸਾਗ ਤੇ ਮੱਕੀ ਦੀ ਰੋਟੀ"], trd: ["धीमी आँच पर पका सरसों का साग, सफ़ेद मक्खन और मक्की की रोटी के साथ।", "ہلکی آنچ پر پکا سرسوں کا ساگ، سفید مکھن اور مکئی کی روٹی کے ساتھ۔", "ਹੌਲੀ ਅੱਗ ਤੇ ਪੱਕਿਆ ਸਰ੍ਹੋਂ ਦਾ ਸਾਗ, ਚਿੱਟੇ ਮੱਖਣ ਤੇ ਮੱਕੀ ਦੀ ਰੋਟੀ ਨਾਲ।"] },
  { name: "Dal Makhani", desc: "Black lentils simmered overnight with butter and cream.", price: 1299, tags: { veg: true, gf: true, spice: 1, al: ["dairy"] }, tr: ["दाल मखनी", "دال مکھنی", "ਦਾਲ ਮੱਖਣੀ"] },
  { name: "Chole Bhature", price: 1199, tags: { veg: true, spice: 2, al: ["wheat", "dairy"] }, tr: ["छोले भटूरे", "چھولے بھٹورے", "ਛੋਲੇ ਭਟੂਰੇ"] },
  { name: "Amritsari Kulcha", desc: "Stuffed kulcha with chole, onion and mint chutney.", price: 1099, tags: { veg: true, spice: 1, al: ["wheat", "dairy"] }, tr: ["अमृतसरी कुलचा", "امرتسری کلچہ", "ਅੰਮ੍ਰਿਤਸਰੀ ਕੁਲਚਾ"] },
  { name: "Paneer Tikka", price: 1499, tags: { veg: true, gf: true, spice: 2, al: ["dairy"] }, tr: ["पनीर टिक्का", "پنیر ٹکہ", "ਪਨੀਰ ਟਿੱਕਾ"] },
  { name: "Butter Chicken", price: 1699, tags: { spice: 1, gf: true, al: ["dairy", "nuts"] }, tr: ["बटर चिकन", "بٹر چکن", "ਬਟਰ ਚਿਕਨ"] },
  { name: "Aloo Paratha with Dahi", price: 899, tags: { veg: true, spice: 1, al: ["wheat", "dairy"] }, tr: ["आलू पराठा दही के साथ", "آلو پراٹھا دہی کے ساتھ", "ਆਲੂ ਪਰਾਂਠਾ ਦਹੀਂ ਨਾਲ"] },
  { name: "Rajma Chawal", desc: "Kidney beans in a slow tomato gravy with steamed rice.", price: 1199, tags: { veg: true, vegan: true, gf: true, spice: 1 }, tr: ["राजमा चावल", "راجما چاول", "ਰਾਜਮਾਂ ਚੌਲ"] },
  { name: "Baingan Bharta", price: 1199, tags: { veg: true, vegan: true, gf: true, spice: 2 }, tr: ["बैंगन का भर्ता", "بینگن کا بھرتہ", "ਬੈਂਗਣ ਦਾ ਭਰਥਾ"] },
  { name: "Tandoori Roti", price: 249, tags: { veg: true, vegan: true, al: ["wheat"] }, tr: ["तंदूरी रोटी", "تندوری روٹی", "ਤੰਦੂਰੀ ਰੋਟੀ"] },
  { name: "Sweet Lassi", price: 599, tags: { veg: true, gf: true, al: ["dairy"] }, tr: ["मीठी लस्सी", "میٹھی لسی", "ਮਿੱਠੀ ਲੱਸੀ"] },
  { name: "Masala Chai", price: 349, tags: { veg: true, gf: true, al: ["dairy"] }, tr: ["मसाला चाय", "مسالہ چائے", "ਮਸਾਲਾ ਚਾਹ"] },
  { name: "Gulab Jamun (2 pc)", price: 499, tags: { veg: true, al: ["dairy", "wheat"] }, tr: ["गुलाब जामुन (2 पीस)", "گلاب جامن (2 عدد)", "ਗੁਲਾਬ ਜਾਮੁਨ (2 ਪੀਸ)"] },
];

const mithaiMenu: Dish[] = [
  { name: "Kaju Katli (1 lb)", price: 3299, tags: { veg: true, gf: true, al: ["nuts"] } },
  { name: "Motichoor Laddu (1 lb)", price: 1999, tags: { veg: true, gf: true, al: ["dairy", "nuts"] } },
  { name: "Gulab Jamun (6 pc)", price: 899, tags: { veg: true, al: ["dairy", "wheat"] } },
  { name: "Rasmalai (4 pc)", price: 1199, tags: { veg: true, gf: true, al: ["dairy", "nuts"] } },
  { name: "Fresh Jalebi (1 lb)", price: 1299, tags: { veg: true, vegan: true, al: ["wheat"] } },
  { name: "Samosa (6 pc) with Chutney", price: 899, tags: { veg: true, vegan: true, spice: 1, al: ["wheat"] } },
  { name: "Kachori (4 pc)", price: 799, tags: { veg: true, vegan: true, spice: 2, al: ["wheat"] } },
  { name: "Kadak Chai", price: 299, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Masala Chai (large)", price: 379, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Badam Milk", price: 499, tags: { veg: true, gf: true, al: ["dairy", "nuts"] } },
  { name: "Diwali Mithai Box (1 kg assorted)", desc: "Kaju katli, laddu, barfi and soan papdi in a gift box. Order 48 hours ahead.", price: 4999, tags: { veg: true, al: ["dairy", "nuts", "wheat"] }, pre: { lead: 48, serves: 8, dep: 2000 } },
  { name: "Diwali Dry Fruit Hamper", price: 7999, tags: { veg: true, gf: true, al: ["nuts"] }, pre: { lead: 72, serves: 10, dep: 2000 } },
  { name: "Eid Sheer Khurma Tray (serves 10)", desc: "Vermicelli simmered in milk with dates, nuts and cardamom.", price: 5999, tags: { veg: true, al: ["dairy", "nuts", "wheat"] }, pre: { lead: 48, serves: 10, dep: 2000 } },
  { name: "Eid Mithai Box (1 kg)", price: 4599, tags: { veg: true, al: ["dairy", "nuts"] }, pre: { lead: 48, serves: 8, dep: 2000 } },
];

const padmaMenu: Dish[] = [
  { name: "Kacchi Biryani", desc: "Raw-marinated goat layered with fragrant rice, Dhaka style.", price: 2199, tags: { spice: 2, al: ["dairy"] } },
  { name: "Ilish Bhuna", desc: "Hilsa in mustard and onion masala, on the bone.", price: 2299, tags: { spice: 2, gf: true, al: ["fish"] } },
  { name: "Beef Bhuna", price: 1799, tags: { spice: 3, gf: true } },
  { name: "Bhuna Khichuri", desc: "Roasted lentil and rice cooked with ghee and whole spices.", price: 1499, tags: { spice: 1, gf: true, al: ["dairy"] } },
  { name: "Chingri Malai Curry", price: 2199, tags: { spice: 1, gf: true, al: ["shellfish"] } },
  { name: "Aloo Bhorta", desc: "Mashed potato with mustard oil, onion and green chili.", price: 799, tags: { veg: true, vegan: true, gf: true, spice: 2 } },
  { name: "Begun Bhaja", price: 899, tags: { veg: true, vegan: true, gf: true } },
  { name: "Fuchka (8 pc)", price: 799, tags: { veg: true, vegan: true, spice: 2, al: ["wheat"] } },
  { name: "Chotpoti", price: 899, tags: { veg: true, vegan: true, spice: 2 } },
  { name: "Mishti Doi", price: 599, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Borhani", price: 399, tags: { veg: true, gf: true, spice: 1, al: ["dairy"] } },
];

const kottuMenu: Dish[] = [
  { name: "Chicken Kottu Roti", desc: "Chopped godamba roti on the griddle with chicken, egg, leeks and curry sauce.", price: 1699, tags: { spice: 3, al: ["wheat", "egg"] } },
  { name: "Vegetable Kottu Roti", price: 1399, tags: { veg: true, spice: 2, al: ["wheat"] } },
  { name: "Egg Kottu Roti", price: 1499, tags: { spice: 2, al: ["wheat", "egg"] } },
  { name: "Cheese Kottu Roti", price: 1799, tags: { veg: true, spice: 1, al: ["wheat", "dairy"] } },
  { name: "Jaffna Crab Curry", desc: "Whole crab in a roasted curry powder gravy. Spicy by design.", price: 3299, tags: { spice: 3, gf: true, al: ["shellfish"] } },
  { name: "Egg Hoppers (2 pc)", price: 999, tags: { veg: true, gf: true, al: ["egg"] } },
  { name: "String Hoppers with Sothi", desc: "Rice noodle nests with a light coconut milk gravy and pol sambol.", price: 1299, tags: { veg: true, vegan: true, gf: true, spice: 1 } },
  { name: "Mutton Rolls (3 pc)", price: 1099, tags: { spice: 2, al: ["wheat", "egg"] } },
  { name: "Vadai (3 pc)", price: 699, tags: { veg: true, vegan: true, gf: true, spice: 1 } },
  { name: "Lamprais", desc: "Rice, meat curry and sambol baked in a banana leaf. Order 24 hours ahead.", price: 1899, tags: { spice: 2, al: ["egg"] }, pre: { lead: 24, serves: 1, dep: 0 } },
  { name: "Wattalapam", price: 699, tags: { veg: true, gf: true, al: ["egg", "dairy", "nuts"] } },
  { name: "Ginger Beer", price: 399, tags: { veg: true, vegan: true, gf: true } },
];

const afghanMenu: Dish[] = [
  { name: "Kabuli Pulao with Lamb", desc: "Long-grain rice with caramelized carrot, raisins and a lamb shank.", price: 2199, tags: { spice: 0, gf: true, al: ["nuts"] } },
  { name: "Chicken Kabob Platter", price: 1899, tags: { spice: 1, gf: true, al: ["dairy"] } },
  { name: "Lamb Chops (Chopan)", price: 2599, tags: { spice: 1, gf: true } },
  { name: "Mantu (8 pc)", desc: "Steamed dumplings with beef, yogurt, split pea sauce and dried mint.", price: 1699, tags: { spice: 1, al: ["wheat", "dairy"] } },
  { name: "Aushak", desc: "Leek dumplings with mint yogurt and tomato sauce.", price: 1599, tags: { veg: true, spice: 0, al: ["wheat", "dairy"] } },
  { name: "Bolani", desc: "Crisp flatbread stuffed with potato and green onion.", price: 899, tags: { veg: true, vegan: true, spice: 1, al: ["wheat"] } },
  { name: "Borani Banjan", price: 1399, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Shorwa", desc: "Lamb and chickpea soup.", price: 1099, tags: { spice: 1, gf: true } },
  { name: "Naan-e-Afghani", price: 399, tags: { veg: true, vegan: true, al: ["wheat"] } },
  { name: "Doogh", price: 449, tags: { veg: true, gf: true, al: ["dairy"] } },
  { name: "Firni", desc: "Cardamom milk pudding with pistachio.", price: 599, tags: { veg: true, gf: true, al: ["dairy", "nuts"] } },
  { name: "Afghan Green Tea", price: 299, tags: { veg: true, vegan: true, gf: true } },
];

const caterMenu: Dish[] = [
  { name: "Walima Dinner Package (per guest)", desc: "Biryani, chicken qorma, naan, salad, raita, kheer. Minimum 100 guests.", price: 2800, tags: { spice: 1, al: ["dairy", "wheat", "nuts"] }, pre: { lead: 336, serves: 1, dep: 3000 } },
  { name: "Mehndi Night Package (per guest)", desc: "Seekh kebab, chicken karahi, pulao, naan, gulab jamun and chai.", price: 2400, tags: { spice: 2, al: ["dairy", "wheat"] }, pre: { lead: 336, serves: 1, dep: 3000 } },
  { name: "Aqiqah Package (goat for 40)", price: 79900, tags: { spice: 1, gf: true }, pre: { lead: 72, serves: 40, dep: 3000 } },
  { name: "Eid Lunch Tray: Biryani and Korma (serves 10)", price: 15900, tags: { spice: 2, al: ["dairy"] }, pre: { lead: 48, serves: 10, dep: 3000 } },
  { name: "Corporate Lunch Box", desc: "Chicken karahi or paneer, rice, naan, salad and a sweet. Minimum 20.", price: 1699, tags: { spice: 1, al: ["dairy", "wheat"] }, pre: { lead: 48, serves: 1, dep: 0 } },
];

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------
export interface CorridorShop {
  slug: string;
  name: string;
  tier: Tier | null;
}

const SHOPS: Shop[] = [
  { slug: "nawab-biryani-house", name: "Nawab Biryani House", vertical: "restaurant", tier: "pro", address: "Ridgeway Plaza, Unit 1, 3250 Ridgecrest Blvd", postalCode: "L5R 3K2", lat: 43.5961, lng: -79.6489, hours: week("11:00", "23:00"), description: "Hyderabadi dum biryani, haleem and tandoor. Noor Hall seats 250 for weddings and walimas.", brandColor: "#8C2F1B", instagram: "nawabbiryanihouse", languages: ["en", "ur", "hi"], founding: true, halal: { zabihah: true, certifier: NAWAB_CERT }, cashDiscountBps: 300, whatsapp: "+19055550101", menu: nawabMenu, orderPlan: { n: 38, mix: { pickup: 40, counter: 33, whatsapp: 10, phone: 9, preorder: 8 } }, visitWeight: 6, ticket: [1800, 7500], reward: { name: "Free Double ka Meetha", pointsCost: 300 }, joinedDaysAgo: 62 },
  { slug: "lahori-karahi-and-bbq", name: "Lahori Karahi & BBQ", vertical: "restaurant", tier: "growth", address: "Ridgeway Plaza, Unit 4, 3250 Ridgecrest Blvd", postalCode: "L5R 3K2", lat: 43.5963, lng: -79.6484, hours: week("12:00", "00:00"), description: "Wok-cooked karahi, charcoal BBQ and degh for weddings and Fridays. Pre-order degh 48 hours ahead.", brandColor: "#B3541E", instagram: "lahorikarahibbq", languages: ["en", "ur", "pa"], halal: { zabihah: true, certifier: LAHORI_CERT }, preorderDailyCap: 12, whatsapp: "+19055550102", menu: lahoriMenu, orderPlan: { n: 24, mix: { pickup: 33, counter: 20, whatsapp: 27, preorder: 20 } }, visitWeight: 5, ticket: [1700, 6500], joinedDaysAgo: 58 },
  { slug: "shree-thali-and-tiffin", name: "Shree Gujarati Thali & Tiffin", vertical: "restaurant", tier: "growth", address: "Ridgeway Plaza, Unit 7, 3250 Ridgecrest Blvd", postalCode: "L5R 3K2", lat: 43.5959, lng: -79.6478, hours: week("10:30", "21:00", { sun: ["11:00", "20:00"] }), description: "Pure vegetarian Gujarati thali, farsan and daily tiffin delivery to Mississauga and Brampton. Jain meals on request.", brandColor: "#D98E04", instagram: "shreethalitiffin", languages: ["en", "hi"], founding: true, menu: thaliMenu, orderPlan: { n: 18, mix: { pickup: 55, counter: 25, tiffin: 20 } }, visitWeight: 4, ticket: [1400, 4800], reward: { name: "Free Shrikhand", pointsCost: 150 }, joinedDaysAgo: 55 },
  { slug: "sarson-dhaba", name: "Sarson Dhaba", vertical: "restaurant", tier: "starter", address: "Ridgeway Plaza, Unit 9, 3250 Ridgecrest Blvd", postalCode: "L5R 3K2", lat: 43.5957, lng: -79.6472, hours: week("11:00", "22:00"), description: "Punjabi dhaba food: sarson da saag in winter, kulcha, dal makhani and lassi by the glass.", brandColor: "#2E7D32", instagram: "sarsondhaba", languages: ["en", "pa", "hi"], menu: dhabaMenu, orderPlan: { n: 22, mix: { pickup: 50, counter: 50 } }, visitWeight: 6, ticket: [1200, 4800], reward: { name: "Free Masala Chai", pointsCost: 150 }, joinedDaysAgo: 50 },
  { slug: "meethi-mithai-and-chai", name: "Meethi Mithai & Chai", vertical: "bakery", tier: "starter", address: "Ridgeway Plaza, Unit 11, 3250 Ridgecrest Blvd", postalCode: "L5R 3K2", lat: 43.5955, lng: -79.6469, hours: week("09:00", "21:00"), description: "Fresh jalebi, laddu and kaju katli, plus kadak chai all day. Diwali and Eid boxes by pre-order.", brandColor: "#C2185B", instagram: "meethimithaichai", languages: ["en", "hi", "pa"], founding: true, menu: mithaiMenu, orderPlan: { n: 18, mix: { pickup: 50, counter: 32, preorder: 18 } }, visitWeight: 6, ticket: [500, 4500], joinedDaysAgo: 52 },
  { slug: "padma-bangladeshi-kitchen", name: "Padma Bangladeshi Kitchen", vertical: "restaurant", tier: "starter", address: "Ridgeway Plaza, Unit 14, 3250 Ridgecrest Blvd", postalCode: "L5V 1P4", lat: 43.5953, lng: -79.6463, hours: week("11:30", "22:00", { closedMon: true }), description: "Home-style Bangladeshi: kacchi on Fridays, hilsa when it is in, and fuchka by the plate.", brandColor: "#006A4E", instagram: "padmabdkitchen", languages: ["en"], halal: { zabihah: false }, menu: padmaMenu, orderPlan: { n: 10, mix: { pickup: 55, counter: 45 } }, visitWeight: 3, ticket: [1500, 5200], joinedDaysAgo: 45 },
  { slug: "jaffna-kottu-house", name: "Jaffna Kottu House", vertical: "restaurant", tier: "starter", address: "Ridgeway Plaza, Unit 16, 3250 Ridgecrest Blvd", postalCode: "L5V 1P4", lat: 43.5951, lng: -79.6458, hours: week("12:00", "23:00"), description: "Sri Lankan and Jaffna Tamil: kottu on the griddle, crab curry, hoppers and lamprais.", brandColor: "#7A1F5C", instagram: "jaffnakottuhouse", languages: ["en"], menu: kottuMenu, orderPlan: { n: 10, mix: { pickup: 60, counter: 40 } }, visitWeight: 3, ticket: [1400, 5500], joinedDaysAgo: 44 },
  { slug: "kabul-garden-grill", name: "Kabul Garden Grill", vertical: "restaurant", tier: "starter", address: "Ridgeway Plaza, Unit 18, 3250 Ridgecrest Blvd", postalCode: "L4Z 2B6", lat: 43.5949, lng: -79.6452, hours: week("11:30", "22:30"), description: "Halal Afghan grill: kabuli pulao, mantu, charcoal kabobs and fresh naan.", brandColor: "#5D4037", instagram: "kabulgardengrill", languages: ["en", "ur"], halal: { zabihah: true, certifier: AFGHAN_CERT }, menu: afghanMenu, orderPlan: { n: 10, mix: { pickup: 60, counter: 40 } }, visitWeight: 3, ticket: [1800, 6000], joinedDaysAgo: 40 },
  { slug: "zeenat-catering", name: "Zeenat Catering Co.", vertical: "restaurant", tier: "growth", address: "Ridgeway Plaza, Unit 21, 3250 Ridgecrest Blvd", postalCode: "L4Z 2B6", lat: 43.5947, lng: -79.6447, hours: week("09:00", "18:00", { sun: null }), description: "Halal wedding, walima and mehndi catering for 50 to 500 guests across Peel and Halton. Tastings by appointment.", brandColor: "#1B5E7B", instagram: "zeenatcatering", languages: ["en", "ur", "hi"], halal: { zabihah: true, certifier: AFGHAN_CERT }, menu: caterMenu, orderPlan: { n: 4, mix: { catering: 100 } }, visitWeight: 0, ticket: [2000, 8000], joinedDaysAgo: 48 },
  { slug: "rangrez-beauty-studio", name: "Rangrez Beauty Studio", vertical: "salon", tier: null, address: "Ridgeway Plaza, Unit 24, 3250 Ridgecrest Blvd", postalCode: "L4Z 2B6", lat: 43.5945, lng: -79.6442, hours: week("10:00", "20:00", { sun: ["11:00", "17:00"] }), description: "Bridal henna, threading, facials and hair. Walk-ins welcome on weekdays.", brandColor: "#AD1457", instagram: "rangrezbeauty", languages: ["en", "hi", "ur", "pa"], menu: [], visitWeight: 4, ticket: [2500, 22000], joinedDaysAgo: 42 },
];

export const RESTAURANT_SHOPS: CorridorShop[] = SHOPS.map((s) => ({ slug: s.slug, name: s.name, tier: s.tier }));

/** Demo logins for the corridor: owner + <slug>, plus the named staff below. */
const STAFF: { shop: string; key: string; name: string; role: "manager" | "staff"; locale: string; station?: string }[] = [
  { shop: "nawab-biryani-house", key: "manager", name: "Imran Siddiqui", role: "manager", locale: "ur" },
  { shop: "nawab-biryani-house", key: "tandoor", name: "Gurpreet Dhillon", role: "staff", locale: "pa", station: "tandoor" },
  { shop: "nawab-biryani-house", key: "curry", name: "Venkat Reddy", role: "staff", locale: "en", station: "curry" },
  { shop: "nawab-biryani-house", key: "rice", name: "Sanjay Verma", role: "staff", locale: "hi", station: "rice" },
  { shop: "lahori-karahi-and-bbq", key: "manager", name: "Bilal Chaudhry", role: "manager", locale: "ur" },
  { shop: "shree-thali-and-tiffin", key: "kitchen", name: "Jignesh Patel", role: "staff", locale: "hi" },
  { shop: "sarson-dhaba", key: "counter", name: "Harpreet Kaur", role: "staff", locale: "pa" },
  { shop: "zeenat-catering", key: "manager", name: "Ayesha Farooq", role: "manager", locale: "ur" },
];
export const staffEmail = (shop: string, key: string) => `staff+${shop}-${key}@example.com`;
export const STAFF_LOGINS = STAFF.map((s) => ({ email: staffEmail(s.shop, s.key), shop: s.shop, name: s.name, locale: s.locale, station: s.station }));

/** Paid Plus features the restaurant pack shops need in the demo (hidden at launch, like the pilot shops). */
const CORRIDOR_FEATURES: FeatureKey[] = ["payments.in_app", "orders.order_ahead", "orders.pickup_status", "marketing.email", "marketing.sms", "customers.csv_export", "reports.advanced"];

const CUSTOMER_NAMES = [
  "Ayesha Khan", "Bilal Ahmed", "Fatima Malik", "Usman Raza", "Hira Siddiqui", "Zain Abbasi", "Sana Qureshi", "Omar Farooqi", "Mariam Sheikh", "Hamza Butt",
  "Harpreet Singh", "Simran Kaur", "Gurdeep Sandhu", "Jasleen Gill", "Amandeep Dhillon", "Navjot Brar", "Manpreet Sidhu", "Rajveer Grewal",
  "Priya Patel", "Kunal Shah", "Neha Desai", "Jay Mehta", "Riya Joshi", "Dhruv Trivedi", "Hetal Parikh", "Anil Kumar", "Sunita Sharma", "Rohan Kapoor",
  "Nasrin Akter", "Rafiq Hossain", "Tanvir Rahman", "Shabnam Begum", "Kavitha Selvam", "Arun Thirunavukarasu", "Dilani Fernando", "Mahesh Rajendran",
  "Zarmina Noori", "Farid Ahmadi", "Wahida Safi", "Jamal Sultani",
];
const STREETS = ["Ridgecrest Blvd", "Maple Grove Dr", "Cedar Hollow Cres", "Hillside Terrace", "Brookview Rd", "Lakeshore Gate", "Orchard Park Way", "Sandalwood Lane"];

// ---------------------------------------------------------------------------
// Options and result
// ---------------------------------------------------------------------------
export interface RestaurantSeedOptions {
  config?: Config;
  seed?: number;
  /** Shared demo owner password / counter PIN (same as the Roncesvalles demo). */
  ownerPassword: string;
  staffPin: string;
  log?: (msg: string) => void;
}

export interface RestaurantSeedResult {
  skipped: boolean;
  merchants: number;
  customers: number;
  visits: number;
  redemptions: number;
  orders: number;
}

type ItemRow = { dish: Dish; id: string; price: number; station: string | null; categoryId: string | null };

export async function seedRestaurantCorridor(db: Db, opts: RestaurantSeedOptions): Promise<RestaurantSeedResult> {
  const log = opts.log ?? (() => {});
  const [existing] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, CORRIDOR_SLUG)).limit(1);
  if (existing) {
    log(`Restaurant corridor already present (neighbourhood '${CORRIDOR_SLUG}' exists), skipping.`);
    return { skipped: true, merchants: 0, customers: 0, visits: 0, redemptions: 0, orders: 0 };
  }

  const R = rng(opts.seed ?? 20261022);
  const config = { ...(opts.config ?? loadConfig({ NODE_ENV: "development" })) };
  const clock = { now: new Date() };
  const ctx: AppContext = { db, config, providers: createProviders({ ...config, env: "test" }), now: () => clock.now };
  const realStart = new Date();
  const today = dateKey(realStart);
  const ago = (days: number, hourUtc = 17) => {
    const d = new Date(realStart.getTime() - days * DAY);
    d.setUTCHours(hourUtc, R.int(0, 59), 0, 0);
    return d;
  };
  const ahead = (days: number, hourUtc = 17) => ago(-days, hourUtc);
  const minutesAgo = (m: number) => new Date(realStart.getTime() - m * MIN);

  // ---- Neighbourhood + perk ----
  const [hood] = await db
    .insert(neighbourhoods)
    .values({
      slug: CORRIDOR_SLUG,
      name: "Ridgeway Plaza",
      city: "Mississauga",
      province: "ON",
      status: "pilot",
      centerLat: 43.5955,
      centerLng: -79.6465,
      radiusMetres: 500,
      biaName: "Ridgeway Plaza Merchants Association",
      biaContactName: "Farhan Qadri",
      biaContactEmail: "merchants-ridgeway@example.com",
      storefrontEstimate: 28,
      notes: "South Asian food corridor on a Mississauga strip plaza. Biryani, karahi, tiffin, mithai and catering. Founding restaurant offer open to the first 20 shops.",
      createdAt: ago(70),
    })
    .returning({ id: neighbourhoods.id });
  const hoodId = hood!.id;
  await db.insert(networkPerks).values({
    neighbourhoodId: hoodId,
    name: "Ridgeway Food Trail",
    description: "Eat at 3 different shops in Ridgeway Plaza within 30 days and get 50 bonus points, on us.",
    threshold: 3,
    windowDays: 30,
    bonusPoints: 50,
    createdAt: ago(60),
  });

  // ---- Owners, merchants ----
  const ownerHash = await bcrypt.hash(opts.ownerPassword, 10);
  const pinHash = await bcrypt.hash(opts.staffPin, 8);
  const mkUser = async (v: Partial<typeof users.$inferInsert>) => {
    const [u] = await db
      .insert(users)
      .values({ memberCode: await generateMemberCode(db), createdAt: ago(70), emailVerifiedAt: v.email ? ago(70) : null, ...v })
      .returning();
    return u!;
  };

  const shops: { s: Shop; id: string; locationId: string; createdAt: Date; ownerId: string; items: ItemRow[] }[] = [];
  for (const [i, s] of SHOPS.entries()) {
    const owner = await mkUser({ email: `owner+${s.slug}@example.com`, name: ownerName(s.slug), passwordHash: ownerHash, locale: s.languages.includes("ur") ? "ur-CA" : "en-CA" });
    const signedAt = ago(s.joinedDaysAgo, 15);
    clock.now = signedAt;
    const { merchant, location } = await createMerchantWithTemplate(ctx, {
      body: { name: s.name, vertical: s.vertical, address: s.address, city: "Mississauga", postalCode: s.postalCode, phone: `+1905555${String(2000 + i).padStart(4, "0")}`, neighbourhoodId: hoodId, lat: s.lat, lng: s.lng, hours: s.hours },
      ownerUserId: owner.id,
      repUserId: null,
      actorUserId: owner.id,
    });
    await db
      .update(merchants)
      .set({
        slug: s.slug,
        description: s.description,
        brandColor: s.brandColor,
        instagram: s.instagram,
        email: `hello+${s.slug}@example.com`,
        website: `https://${s.slug}.example.com`,
        logoUrl: null,
        coverUrl: null,
        createdAt: signedAt,
        status: "active",
        restaurantTier: s.tier,
        foundingOffer: !!s.founding,
        languages: s.languages,
        cashDiscountBps: s.cashDiscountBps ?? 0,
        preorderDailyCap: s.preorderDailyCap ?? null,
        whatsappNumber: s.whatsapp ?? null,
        whatsappCreditsUsed: s.whatsapp ? (s.tier === "pro" ? 1180 : 412) : 0,
        whatsappCreditsExtra: s.slug === "lahori-karahi-and-bbq" ? 1000 : 0,
        googleReviewUrl: s.tier ? `https://reviews.example.com/g/${s.slug}` : null,
        // Restaurant-tier shops are fully onboarded on the fake Stripe Connect provider so customers can pay and subscribe locally.
        ...(s.tier ? { stripeAccountId: `acct_demo_${s.slug}`, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true } : {}),
      })
      .where(eq(merchants.id, merchant.id));
    if (s.tier) {
      await db.insert(subscriptions).values({ merchantId: merchant.id, plan: "free", restaurantTier: s.tier, status: "active", interval: "month", currentPeriodEnd: ahead(R.int(5, 25)), createdAt: signedAt });
      await db.insert(featureOverrides).values(CORRIDOR_FEATURES.map((key) => ({ merchantId: merchant.id, key, enabled: true, reason: "Demo restaurant pack shop", createdAt: signedAt })));
    }
    if (s.reward) await db.insert(rewards).values({ merchantId: merchant.id, name: s.reward.name, pointsCost: s.reward.pointsCost, rewardType: "free_item", value: 0, sortOrder: 5, createdAt: signedAt });
    shops.push({ s, id: merchant.id, locationId: location.id, createdAt: signedAt, ownerId: owner.id, items: [] });
  }
  const shop = (slug: string) => shops.find((x) => x.s.slug === slug)!;
  const nawab = shop("nawab-biryani-house");
  const lahori = shop("lahori-karahi-and-bbq");
  const shree = shop("shree-thali-and-tiffin");
  const dhaba = shop("sarson-dhaba");
  const zeenat = shop("zeenat-catering");
  log(`Restaurant corridor: ${shops.length} shops in Ridgeway Plaza`);

  // ---- Add-ons, staff ----
  await db.insert(merchantAddOns).values([
    { merchantId: nawab.id, addOnId: "phone_ai", quantity: 1, status: "active", createdAt: nawab.createdAt },
    { merchantId: lahori.id, addOnId: "whatsapp_1000", quantity: 1, status: "active", createdAt: lahori.createdAt },
  ]);
  for (const st of STAFF) {
    const sh = shop(st.shop);
    const u = await mkUser({ email: staffEmail(st.shop, st.key), name: st.name, passwordHash: ownerHash, locale: `${st.locale}-CA` });
    await db.insert(merchantStaff).values({ merchantId: sh.id, userId: u.id, role: st.role, pinHash, locale: st.locale, station: st.station ?? null, createdAt: sh.createdAt });
  }

  // ---- Catalog ----
  for (const sh of shops) {
    if (!sh.s.menu.length) continue;
    const cats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, sh.id));
    const food = cats.find((c) => c.name === "Food") ?? cats[0] ?? null;
    const rows = sh.s.menu.map((d, idx) => {
      const base: DietaryTags = {};
      if (sh.s.halal) {
        base.halal = true;
        base.zabihah = sh.s.halal.zabihah;
        if (sh.s.halal.certifier) base.halalCertifier = sh.s.halal.certifier;
      }
      const t = d.tags ?? {};
      const dietary: DietaryTags = { ...base, ...(t.veg ? { vegetarian: true } : {}), ...(t.vegan ? { vegan: true } : {}), ...(t.jain ? { jain: true } : {}), ...(t.gf ? { glutenFree: true } : {}), ...(t.spice !== undefined ? { spice: t.spice } : {}), allergens: t.al ?? [] };
      const translations: Translations = {};
      if (d.tr && d.tr[0]) {
        (["hi", "ur", "pa"] as const).forEach((lang, k) => {
          translations[lang] = { name: d.tr![k]!, ...(d.trd?.[k] ? { description: d.trd[k] } : {}) };
        });
      }
      return {
        id: randomUUID(),
        merchantId: sh.id,
        categoryId: food?.id ?? null,
        name: d.name,
        description: d.desc ?? null,
        priceCents: d.price,
        orderable: true,
        sortOrder: idx,
        dietary,
        translations,
        preorderOnly: !!d.pre,
        leadTimeHours: d.pre?.lead ?? 0,
        serves: d.pre?.serves ?? null,
        station: sh.s.tier === "pro" ? (d.station ?? null) : null,
        depositBps: d.pre?.dep ?? 0,
        createdAt: sh.createdAt,
      };
    });
    await db.insert(catalogItems).values(rows);
    sh.items = rows.map((r, k) => ({ dish: sh.s.menu[k]!, id: r.id, price: r.priceCents, station: r.station, categoryId: r.categoryId }));
  }
  const itemByName = (sh: (typeof shops)[number], name: string) => sh.items.find((i) => i.dish.name === name)!;

  // ---- Customers ----
  const customers: { id: string; phone: string; name: string; consent: boolean; postal: string; tongue: string }[] = [];
  for (const [i, name] of CUSTOMER_NAMES.entries()) {
    const phone = `+1905555${String(3000 + i).padStart(4, "0")}`;
    const { user } = await findOrCreateCustomerByPhone(db, phone, name);
    const postal = ["L5R", "L5V", "L4Z"][i % 3]! + ` ${1 + (i % 9)}${"ABCEGHJK"[i % 8]}${1 + ((i * 3) % 9)}`;
    const tongue = i < 10 ? "ur" : i < 18 ? "pa" : i < 28 ? "hi" : "en";
    await db
      .update(users)
      .set({ email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${i}@example.com`, postalCode: postal.slice(0, 3), locale: `${tongue}-CA`, createdAt: ago(R.int(35, 68)) })
      .where(eq(users.id, user.id));
    customers.push({ id: user.id, phone, name, consent: R.chance(0.65), postal, tongue });
  }

  // ---- Order + visit events (chronological, loyalty via the ledger) ----
  type Kind = "pickup" | "counter" | "whatsapp" | "phone" | "preorder" | "tiffin" | "catering";
  interface Ev {
    at: Date;
    sh: (typeof shops)[number];
    kind: Kind | "visit";
  }
  const events: Ev[] = [];
  const weekendDays = Array.from({ length: 30 }, (_, d) => d).filter((d) => [5, 6, 0].includes(new Date(realStart.getTime() - d * DAY).getUTCDay()));
  for (const sh of shops) {
    const plan = sh.s.orderPlan;
    if (plan) {
      const entries = Object.entries(plan.mix) as [Kind, number][];
      const total = entries.reduce((a, [, w]) => a + w, 0);
      for (let n = 0; n < plan.n; n++) {
        let r = R.next() * total;
        let kind = entries[0]![0];
        for (const [k, w] of entries) if ((r -= w) <= 0) { kind = k; break; }
        // Spread across 30 days, a little heavier on weekends (Fri to Sun).
        const day = R.chance(0.3) ? R.pick(weekendDays) : R.int(0, 29);
        const lunch = R.chance(0.45);
        const at = ago(day, lunch ? R.int(16, 18) : R.int(21, 23));
        if (at.getTime() > realStart.getTime() - 40 * MIN) continue;
        events.push({ at, sh, kind });
      }
    }
    // Plain visits (walk-ins that aren't orders).
    const visitsN = sh.s.visitWeight * 4;
    for (let v = 0; v < visitsN; v++) {
      const at = ago(R.int(0, 29), R.int(16, 23));
      if (at.getTime() > realStart.getTime() - 40 * MIN) continue;
      events.push({ at, sh, kind: "visit" });
    }
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const customerMembers = new Map<string, string[]>(); // customer id -> shop ids (for network overlap)
  const seenUsers = new Set<string>();
  const backdate = async (memberId: string, userId: string, at: Date) => {
    const since = realStart;
    await db.update(visits).set({ createdAt: at }).where(and(eq(visits.memberId, memberId), gt(visits.createdAt, since)));
    await db.update(ledgerTransactions).set({ createdAt: at }).where(and(eq(ledgerTransactions.memberId, memberId), gt(ledgerTransactions.createdAt, since)));
    await db.update(redemptions).set({ createdAt: at }).where(and(eq(redemptions.memberId, memberId), gt(redemptions.createdAt, since)));
    await db.update(merchantMembers).set({ createdAt: at }).where(and(eq(merchantMembers.id, memberId), gt(merchantMembers.createdAt, since)));
    await db.update(networkPerkAwards).set({ createdAt: at }).where(and(eq(networkPerkAwards.userId, userId), gt(networkPerkAwards.createdAt, since)));
    seenUsers.add(userId);
  };

  const orderNumbers = new Map<string, number>();
  const nextOrderNo = (merchantId: string) => {
    const n = (orderNumbers.get(merchantId) ?? 0) + 1;
    orderNumbers.set(merchantId, n);
    return n;
  };
  const orderRows: (typeof orders.$inferInsert)[] = [];
  const itemRows: (typeof orderItems.$inferInsert)[] = [];
  const completedByShop = new Map<string, { id: string; userId: string; at: Date }[]>();
  const whatsappOrders: { shopId: string; userId: string; orderId: string; at: Date }[] = [];

  interface Line { item: ItemRow; qty: number; kitchenStatus?: string; notes?: string }
  const priceLines = (lines: Line[]) => lines.reduce((s, l) => s + l.item.price * l.qty, 0);
  const pushOrder = (sh: (typeof shops)[number], o: Partial<typeof orders.$inferInsert> & { userId: string; kind: string; channel: string; at: Date }, lines: Line[], opts2: { cash?: boolean; tipPct?: number; deposit?: boolean } = {}) => {
    const id = randomUUID();
    const subtotal = priceLines(lines);
    const bps = opts2.cash ? (sh.s.cashDiscountBps ?? 0) : 0;
    const cashDiscount = Math.round((subtotal * bps) / 10000);
    const tax = computeTax(subtotal - cashDiscount, "ON").taxCents;
    const tip = opts2.tipPct ? Math.round((subtotal * opts2.tipPct) / 100 / 25) * 25 : 0;
    const total = subtotal - cashDiscount + tax + tip;
    const depositCents = opts2.deposit ? lines.reduce((s, l) => s + Math.round((l.item.price * l.qty * (l.item.dish.pre?.dep ?? 0)) / 10000), 0) : 0;
    const { at, ...rest } = o;
    const row: typeof orders.$inferInsert = {
      id,
      merchantId: sh.id,
      locationId: sh.locationId,
      number: nextOrderNo(sh.id),
      status: "picked_up",
      subtotalCents: subtotal,
      taxCents: tax,
      tipCents: tip,
      totalCents: total,
      cashDiscountCents: cashDiscount,
      depositCents,
      paymentMethod: "at_pickup",
      paymentStatus: "paid",
      paidAt: at,
      createdAt: at,
      updatedAt: at,
      ...rest,
    };
    orderRows.push(row);
    for (const l of lines) {
      itemRows.push({ orderId: id, catalogItemId: l.item.id, name: l.item.dish.name, quantity: l.qty, unitPriceCents: l.item.price, station: l.item.station, kitchenStatus: l.kitchenStatus ?? "ready", notes: l.notes ?? null, categoryId: l.item.categoryId });
    }
    return { id, subtotal, total, row };
  };

  const regularItems = (sh: (typeof shops)[number]) => sh.items.filter((i) => !i.dish.pre && !i.dish.name.startsWith("Trial Tiffin"));
  const pickLines = (pool: ItemRow[], n: number): Line[] => {
    const chosen = new Set<ItemRow>();
    for (let k = 0; k < n * 3 && chosen.size < n; k++) chosen.add(R.pick(pool));
    return [...chosen].map((item) => ({ item, qty: R.chance(0.2) ? 2 : 1 }));
  };

  let visitCount = 0;
  let redemptionCount = 0;
  let orderCount = 0;
  let cancelTick = 0;
  for (const e of events) {
    clock.now = e.at;
    const cust = R.pick(customers);
    const sh = e.sh;
    let amount: number;
    let source: "staff_app" | "customer_app" | "api" = "staff_app";
    let record: { id: string; subtotal: number; row: typeof orders.$inferInsert } | null = null;
    let status: "picked_up" | "cancelled" | "refunded" = "picked_up";
    const ordersKind = e.kind;
    if (ordersKind === "visit") {
      amount = Math.round(R.int(sh.s.ticket[0], sh.s.ticket[1]) / 5) * 5;
    } else {
      cancelTick++;
      status = cancelTick % 19 === 0 ? "cancelled" : cancelTick % 41 === 0 ? "refunded" : "picked_up";
      const isPre = ordersKind === "preorder";
      let lines: Line[];
      if (ordersKind === "tiffin") lines = [{ item: itemByName(sh, "Trial Tiffin: Single Lunch"), qty: R.int(1, 3) }];
      else if (ordersKind === "catering") lines = [{ item: R.pick(sh.items.filter((i) => i.dish.pre && i.dish.pre.serves > 1)), qty: R.int(1, 2) }];
      else if (isPre) lines = [{ item: R.pick(sh.items.filter((i) => i.dish.pre)), qty: 1 }];
      else lines = pickLines(regularItems(sh), R.int(1, 4));
      const cash = ordersKind === "counter" && (sh.s.cashDiscountBps ?? 0) > 0 && R.chance(0.6);
      const channel = ordersKind === "counter" ? "counter" : ordersKind === "whatsapp" ? "whatsapp" : ordersKind === "phone" ? "phone" : ordersKind === "catering" ? (R.chance(0.5) ? "phone" : "web") : R.chance(0.7) ? "app" : "web";
      const orderKind = ordersKind === "counter" || ordersKind === "whatsapp" || ordersKind === "phone" ? "pickup" : ordersKind;
      const inApp = channel === "app" || channel === "web" || channel === "whatsapp";
      const wanted = isPre || ordersKind === "catering" ? e.at.getTime() + R.int(1, 4) * DAY : e.at.getTime() + R.int(15, 35) * MIN;
      const pickupAt = new Date(Math.min(wanted, realStart.getTime() - 30 * MIN));
      const pickedAt = status === "picked_up" ? new Date(Math.min(pickupAt.getTime() + 5 * MIN, realStart.getTime() - 10 * MIN)) : null;
      const isNawab = sh.id === nawab.id;
      const pushed = pushOrder(
        sh,
        {
          userId: cust.id,
          kind: orderKind,
          channel,
          at: e.at,
          status,
          pickupAt,
          readyAt: status === "picked_up" ? new Date(e.at.getTime() + R.int(12, 25) * MIN) : null,
          pickedUpAt: pickedAt,
          paymentMethod: inApp ? "in_app" : "at_pickup",
          paymentStatus: status === "refunded" ? "refunded" : status === "cancelled" ? "unpaid" : "paid",
          paidAt: status === "cancelled" ? null : e.at,
          cancelReason: status === "cancelled" ? R.pick(["Customer changed plans", "Kitchen sold out of an item", "Duplicate order"]) : null,
          notes: R.chance(0.15) ? R.pick(["Extra spicy please", "Less salt", "Please add extra raita", "No onion on the side salad", "Call when outside"]) : null,
          firedAt: isNawab ? e.at : null,
          bumpedAt: isNawab ? new Date(e.at.getTime() + R.int(10, 22) * MIN) : null,
          ...(isPre ? { depositPaidAt: e.at } : {}),
          ...(ordersKind === "catering" ? { depositPaidAt: e.at } : {}),
        },
        lines,
        { cash, tipPct: ordersKind === "counter" ? R.pick([0, 10, 15, 18]) : 0, deposit: isPre || ordersKind === "catering" },
      );
      record = pushed;
      orderCount++;
      amount = pushed.subtotal - (cash ? Math.round((pushed.subtotal * (sh.s.cashDiscountBps ?? 0)) / 10000) : 0);
      source = channel === "counter" ? "staff_app" : channel === "app" || channel === "web" ? "customer_app" : "api";
      if (status === "picked_up") {
        const list = completedByShop.get(sh.id) ?? [];
        list.push({ id: pushed.id, userId: cust.id, at: e.at });
        completedByShop.set(sh.id, list);
      }
      if (ordersKind === "whatsapp") whatsappOrders.push({ shopId: sh.id, userId: cust.id, orderId: pushed.id, at: e.at });
    }
    if (record && status !== "picked_up") continue; // cancelled and refunded orders earn nothing
    try {
      const r = await awardPurchase(ctx, {
        merchantId: sh.id,
        userId: cust.id,
        amountCents: amount,
        source,
        locationId: sh.locationId,
        joinedVia: source === "customer_app" ? "app" : R.chance(0.6) ? "qr" : "phone",
        consent: cust.consent ? { text: `Yes, send me offers from ${sh.s.name}. Unsubscribe anytime.`, source: "counter" } : null,
        ignoreCooldown: true,
      });
      visitCount++;
      if (record) record.row.pointsEarned = r.transaction?.points ?? 0;
      if (r.rewardsAvailable.length && R.chance(0.12)) {
        clock.now = new Date(e.at.getTime() + 60000);
        await redeemReward(ctx, { merchantId: sh.id, memberId: r.member.id, rewardId: r.rewardsAvailable[0]!.id, source: "staff_app", locationId: sh.locationId });
        redemptionCount++;
      }
      await backdate(r.member.id, r.member.userId, e.at);
      const list = customerMembers.get(cust.id) ?? [];
      list.push(sh.id);
      customerMembers.set(cust.id, list);
    } catch (err) {
      log(`  skipped a visit: ${(err as Error).message}`);
    }
  }
  clock.now = realStart;

  // ---- Special orders: open KDS tickets, banquet deposit, split bill ----
  const N = (name: string) => itemByName(nawab, name);
  const lc = (n: number) => customers[n % customers.length]!;
  const openIds: string[] = [];
  const ticket = (n: number, mins: number, status: "accepted" | "preparing" | "ready", channel: string, lines: Line[], extra: Partial<typeof orders.$inferInsert> = {}, unpaid = false) => {
    const at = minutesAgo(mins);
    const p = pushOrder(
      nawab,
      {
        userId: lc(n).id,
        kind: "pickup",
        channel,
        at,
        status,
        pickupAt: new Date(at.getTime() + 25 * MIN),
        paymentMethod: channel === "app" || channel === "whatsapp" ? "in_app" : "at_pickup",
        paymentStatus: unpaid ? "unpaid" : "paid",
        paidAt: unpaid ? null : at,
        firedAt: at,
        bumpedAt: null,
        readyAt: status === "ready" ? minutesAgo(Math.max(1, mins - 14)) : null,
        pickedUpAt: null,
        ...extra,
      },
      lines,
      { tipPct: 0 },
    );
    openIds.push(p.id);
    return p;
  };
  const splitOrder = ticket(1, 38, "preparing", "counter", [
    { item: N("Hyderabadi Chicken Dum Biryani"), qty: 2, kitchenStatus: "cooking", notes: "One medium, one extra spicy" },
    { item: N("Hyderabadi Goat Dum Biryani"), qty: 1, kitchenStatus: "cooking" },
    { item: N("Seekh Kebab"), qty: 1, kitchenStatus: "cooking" },
    { item: N("Chicken Tikka"), qty: 1, kitchenStatus: "queued" },
    { item: N("Garlic Naan"), qty: 4, kitchenStatus: "queued" },
    { item: N("Double ka Meetha"), qty: 2, kitchenStatus: "queued" },
  ], { notes: "Table 6, family of 5, split three ways" }, true);
  ticket(2, 14, "accepted", "app", [{ item: N("Vegetable Dum Biryani"), qty: 1, kitchenStatus: "queued" }, { item: N("Mirchi ka Salan"), qty: 1, kitchenStatus: "queued" }]);
  const phoneOpen = ticket(3, 31, "ready", "phone", [{ item: N("Hyderabadi Goat Dum Biryani"), qty: 1 }, { item: N("Mirchi ka Salan"), qty: 1 }]);
  const waOpen = ticket(4, 22, "preparing", "whatsapp", [{ item: N("Butter Chicken"), qty: 2, kitchenStatus: "cooking" }, { item: N("Garlic Naan"), qty: 3, kitchenStatus: "queued" }]);
  whatsappOrders.push({ shopId: nawab.id, userId: lc(4).id, orderId: waOpen.id, at: minutesAgo(22) });
  ticket(5, 9, "accepted", "counter", [{ item: N("Nihari"), qty: 1, kitchenStatus: "queued" }, { item: N("Garlic Naan"), qty: 2, kitchenStatus: "queued" }], {}, true);
  ticket(6, 5, "accepted", "app", [{ item: N("Tandoori Chicken (half)"), qty: 2, kitchenStatus: "queued" }, { item: N("Chicken Tikka"), qty: 1, kitchenStatus: "queued" }, { item: N("Irani Chai"), qty: 3, kitchenStatus: "queued" }]);
  ticket(7, 27, "preparing", "counter", [{ item: N("Haleem"), qty: 3, kitchenStatus: "cooking" }, { item: N("Garlic Naan"), qty: 3, kitchenStatus: "ready" }], {}, true);
  orderCount += openIds.length;

  // Two confirmed phone-assistant orders from earlier this week (the calls below reference them).
  const phoneHist = (n: number, daysAgo: number, lines: Line[]) => {
    const at = ago(daysAgo, 22);
    return pushOrder(nawab, { userId: lc(n).id, kind: "pickup", channel: "phone", at, status: "picked_up", pickupAt: new Date(at.getTime() + 30 * MIN), readyAt: new Date(at.getTime() + 22 * MIN), pickedUpAt: new Date(at.getTime() + 33 * MIN), paymentMethod: "at_pickup", paymentStatus: "paid", paidAt: at, firedAt: at, bumpedAt: new Date(at.getTime() + 18 * MIN) }, lines);
  };
  const callOrder1 = phoneHist(1, 4, [{ item: N("Hyderabadi Chicken Dum Biryani"), qty: 2 }, { item: N("Mirchi ka Salan"), qty: 1 }]);
  const callOrder2 = phoneHist(12, 9, [{ item: N("Vegetable Dum Biryani"), qty: 1 }, { item: N("Garlic Naan"), qty: 2 }]);
  orderCount += 2;

  // Upcoming degh pre-orders (deposit paid, balance at pickup) at the Growth and Pro shops, plus mithai boxes.
  const upcoming: { sh: (typeof shops)[number]; item: string; qty: number; inDays: number; cust: number; channel: string }[] = [
    { sh: lahori, item: "Chicken Karahi Degh (serves 20)", qty: 1, inDays: 2, cust: 8, channel: "web" },
    { sh: lahori, item: "Zarda Degh (serves 20)", qty: 2, inDays: 2, cust: 11, channel: "whatsapp" },
    { sh: lahori, item: "Mutton Pulao Degh (serves 20)", qty: 1, inDays: 4, cust: 14, channel: "phone" },
    { sh: nawab, item: "Goat Biryani Degh (serves 15)", qty: 2, inDays: 1, cust: 3, channel: "app" },
    { sh: nawab, item: "Chicken Biryani Degh (serves 15)", qty: 1, inDays: 3, cust: 17, channel: "whatsapp" },
    { sh: shop("meethi-mithai-and-chai"), item: "Diwali Mithai Box (1 kg assorted)", qty: 6, inDays: 8, cust: 20, channel: "app" },
    { sh: shop("meethi-mithai-and-chai"), item: "Diwali Dry Fruit Hamper", qty: 2, inDays: 10, cust: 22, channel: "web" },
  ];
  for (const u of upcoming) {
    const at = ago(R.int(1, 3), 18);
    const p = pushOrder(u.sh, { userId: lc(u.cust).id, kind: "preorder", channel: u.channel, at, status: "accepted", pickupAt: ahead(u.inDays, 20), paymentMethod: "in_app", paymentStatus: "authorized", paidAt: null, depositPaidAt: at, notes: "Pick up before 4 pm" }, [{ item: itemByName(u.sh, u.item), qty: u.qty }], { deposit: true });
    orderCount++;
    if (u.channel === "whatsapp") whatsappOrders.push({ shopId: u.sh.id, userId: lc(u.cust).id, orderId: p.id, at });
  }

  // Noor Hall deposit order (kind banquet) lives with the hall booking below.
  const HALL_BASE = 250000;
  const GOLD_PER_HEAD = 5800;
  const hallSub = HALL_BASE + GOLD_PER_HEAD * 220;
  const hallTotal = hallSub + computeTax(hallSub, "ON").taxCents;
  const bnqId = randomUUID();
  const bnqAt = ago(5, 18);
  orderRows.push({ id: bnqId, merchantId: nawab.id, locationId: nawab.locationId, userId: lc(9).id, number: nextOrderNo(nawab.id), status: "accepted", kind: "banquet", channel: "web", subtotalCents: hallSub, taxCents: hallTotal - hallSub, totalCents: hallTotal, depositCents: Math.round(hallTotal * 0.25), depositPaidAt: bnqAt, paymentMethod: "in_app", paymentStatus: "authorized", notes: "Noor Hall deposit: Gold package, 220 guests", createdAt: bnqAt, updatedAt: bnqAt });
  itemRows.push({ orderId: bnqId, name: "Noor Hall: Gold package (220 guests, room hire included)", quantity: 1, unitPriceCents: hallSub, kitchenStatus: "ready" });
  orderCount++;

  for (let i = 0; i < orderRows.length; i += 80) await db.insert(orders).values(orderRows.slice(i, i + 80));
  for (let i = 0; i < itemRows.length; i += 200) await db.insert(orderItems).values(itemRows.slice(i, i + 200));
  for (const [merchantId, n] of orderNumbers) await db.insert(merchantCounters).values({ merchantId, name: "order", value: n });

  // Split bill on the open counter ticket: one seat paid, two still open.
  const splitTotal = orderRows.find((o) => o.id === splitOrder.id)!.totalCents!;
  const part = Math.floor(splitTotal / 3);
  await db.insert(orderSplits).values([
    { orderId: splitOrder.id, label: "Seat 1 (Ayesha)", amountCents: part, tipCents: 300, status: "paid", payToken: `split-${splitOrder.id.slice(0, 8)}-1`, paidAt: minutesAgo(3), createdAt: minutesAgo(10) },
    { orderId: splitOrder.id, label: "Seat 2 (Bilal)", amountCents: part, tipCents: 0, status: "open", payToken: `split-${splitOrder.id.slice(0, 8)}-2`, createdAt: minutesAgo(10) },
    { orderId: splitOrder.id, label: "Seat 3 (Fatima)", amountCents: splitTotal - 2 * part, tipCents: 0, status: "open", payToken: `split-${splitOrder.id.slice(0, 8)}-3`, createdAt: minutesAgo(10) },
  ]);

  // ---- Reviews (private ratings, 4 and 5 go on to Google) ----
  const feedbackLow = ["Biryani was lukewarm when I picked it up.", "Waited 40 minutes past the pickup time.", "Good food but the portion was smaller than last time.", "Too salty this time, usually perfect."];
  const feedbackHigh = ["Best in the GTA, tastes like home.", "Perfectly spiced and the staff are lovely.", "Ordered a degh for 40 and everyone asked where it was from.", "Fresh, hot and on time.", "Authentic flavours. Will order again for Eid.", "The saag was exactly like my mother's."];
  const reviewRows: (typeof reviewRequests.$inferInsert)[] = [];
  let tokenN = 0;
  for (const sh of shops) {
    if (!sh.s.menu.length) continue;
    const done = completedByShop.get(sh.id) ?? [];
    const n = sh.id === dhaba.id ? Math.min(14, done.length) : Math.min(sh.s.tier === "pro" ? 10 : 5, done.length);
    for (let k = 0; k < n; k++) {
      const o = done[(k * 2) % done.length]!;
      const rating = R.chance(0.75) ? R.pick([5, 5, 5, 4, 4]) : R.pick([2, 3, 3, 4]);
      const answered = R.chance(0.85);
      reviewRows.push({
        merchantId: sh.id,
        userId: o.userId,
        orderId: o.id,
        channel: R.pick(sh.s.whatsapp ? ["sms", "whatsapp", "email"] : ["sms", "email", "push"]),
        token: `rv-${sh.s.slug}-${tokenN++}`,
        rating: answered ? rating : null,
        feedback: answered && R.chance(0.6) ? (rating >= 4 ? R.pick(feedbackHigh) : R.pick(feedbackLow)) : null,
        sentAt: new Date(o.at.getTime() + 2 * 3600_000),
        clickedAt: answered ? new Date(o.at.getTime() + 3 * 3600_000) : null,
        createdAt: new Date(o.at.getTime() + 2 * 3600_000),
      });
    }
  }
  // Deterministic, unanswered review links for demos and the e2e specs (apps/web/e2e/restaurant-messaging.spec.ts):
  // /r/demo-review-sarson-5 (answer with 5 stars) and /r/demo-review-sarson-low (answer with 1-3). Sarson Dhaba has a Google link.
  const demoDone = completedByShop.get(dhaba.id) ?? [];
  if (demoDone.length >= 2) {
    for (const [i, token] of ["demo-review-sarson-5", "demo-review-sarson-low"].entries()) {
      const o = demoDone[demoDone.length - 1 - i]!;
      reviewRows.push({ merchantId: dhaba.id, userId: o.userId, orderId: o.id, channel: "sms", token, rating: null, feedback: null, sentAt: minutesAgo(90), clickedAt: null, createdAt: minutesAgo(90) });
    }
  }
  await db.insert(reviewRequests).values(reviewRows);

  // ---- WhatsApp sessions and opt-ins (Nawab, Lahori) ----
  const waSessions: (typeof whatsappSessions.$inferInsert)[] = [];
  const waShops = [nawab, lahori];
  for (const sh of waShops) {
    // One session per phone: the latest WhatsApp order wins.
    const latest = new Map<string, (typeof whatsappOrders)[number]>();
    for (const w of whatsappOrders.filter((x) => x.shopId === sh.id)) {
      const prev = latest.get(w.userId);
      if (!prev || prev.at < w.at) latest.set(w.userId, w);
    }
    for (const w of latest.values()) {
      const c = customers.find((x) => x.id === w.userId)!;
      waSessions.push({ merchantId: sh.id, phone: c.phone, userId: c.id, state: "done", language: c.tongue, cart: [], orderId: w.orderId, lastInboundAt: w.at, marketingOptInAt: c.consent ? w.at : null, createdAt: w.at, updatedAt: w.at });
    }
    const live: { c: number; state: string; mins: number; cart: [string, number][]; opt: boolean }[] = [
      { c: 25, state: "browsing", mins: 12, cart: [], opt: true },
      { c: 26, state: "cart", mins: 35, cart: [[sh.items[0]!.dish.name, 2]], opt: false },
      { c: 27, state: "checkout", mins: 50, cart: [[sh.items[1]!.dish.name, 1], [sh.items[3]!.dish.name, 2]], opt: true },
      { c: 28, state: "awaiting_payment", mins: 90, cart: [[sh.items[0]!.dish.name, 1]], opt: true },
      { c: 29, state: "browsing", mins: 60 * 30, cart: [], opt: false },
    ];
    for (const l of live) {
      const c = customers[l.c]!;
      if (waSessions.some((x) => x.merchantId === sh.id && x.phone === c.phone)) continue;
      const cart = l.cart.map(([name, quantity]) => ({ catalogItemId: sh.items.find((i) => i.dish.name === name)!.id, quantity }));
      waSessions.push({ merchantId: sh.id, phone: c.phone, userId: c.id, state: l.state, language: c.tongue, cart, orderId: null, lastInboundAt: minutesAgo(l.mins), marketingOptInAt: l.opt ? minutesAgo(60 * 24 * 12) : null, createdAt: minutesAgo(l.mins + 5), updatedAt: minutesAgo(l.mins) });
    }
    // A shopper who never signed up as a customer: a bare phone with an opt-in.
    waSessions.push({ merchantId: sh.id, phone: `+1647555${sh.id === nawab.id ? "7701" : "7702"}`, userId: null, state: "browsing", language: "ur", cart: [], orderId: null, lastInboundAt: minutesAgo(180), marketingOptInAt: minutesAgo(60 * 24 * 3), createdAt: minutesAgo(185), updatedAt: minutesAgo(180) });
  }
  await db.insert(whatsappSessions).values(waSessions);

  // ---- Phone assistant calls (Nawab, phone_ai add-on) ----
  const ur = "کالر: السلام علیکم، مجھے دو چکن دم بریانی اور ایک مرچی کا سالن چاہیے۔\nاسسٹنٹ: وعلیکم السلام! دو چکن دم بریانی اور ایک مرچی کا سالن۔ آپ کتنے بجے لینے آئیں گے؟\nکالر: سات بجے تک آ جاؤں گا۔\nاسسٹنٹ: ٹھیک ہے، سات بجے آرڈر تیار ہوگا۔ شکریہ۔";
  const hi = "कॉलर: नमस्ते, मुझे एक वेज दम बिरयानी और दो गार्लिक नान चाहिए।\nअसिस्टेंट: नमस्ते! एक वेज दम बिरयानी और दो गार्लिक नान। आप कितने बजे लेने आएँगे?\nकॉलर: साढ़े छह बजे।\nअसिस्टेंट: ठीक है, साढ़े छह बजे तक तैयार रहेगा। धन्यवाद।";
  const pa = "ਕਾਲਰ: ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਨੂੰ ਇੱਕ ਮਟਨ ਦਮ ਬਿਰਯਾਨੀ ਚਾਹੀਦੀ ਹੈ।\nਅਸਿਸਟੈਂਟ: ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਇੱਕ ਮਟਨ ਦਮ ਬਿਰਯਾਨੀ। ਤੁਸੀਂ ਕਦੋਂ ਲੈਣ ਆਵੋਗੇ?\nਕਾਲਰ: ਅੱਠ ਵਜੇ ਤੱਕ।";
  const en1 = "Caller: Hi, can I get a goat biryani and a mirchi ka salan for pickup?\nAssistant: Of course. One Hyderabadi goat dum biryani and one mirchi ka salan. What time will you be in?\nCaller: About 25 minutes.\nAssistant: Great, I have that ready for you in 25 minutes. Can I get a name for the order?\nCaller: Mariam.";
  const en2 = "Caller: I want to book a biryani degh for Saturday, a chicken one.\nAssistant: A chicken biryani degh serves 15. We need 24 hours notice and a 30 percent deposit. What time on Saturday?\nCaller: Around 5 pm, and I will need two.\nAssistant: Two chicken biryani deghs for Saturday at 5 pm. I will send you a payment link for the deposit.";
  const nawabItem = (name: string) => N(name).id;
  await db.insert(phoneCalls).values([
    { merchantId: nawab.id, fromPhone: lc(1).phone, language: "ur", transcript: ur, draftOrder: { items: [{ catalogItemId: nawabItem("Hyderabadi Chicken Dum Biryani"), name: "Hyderabadi Chicken Dum Biryani", quantity: 2 }, { catalogItemId: nawabItem("Mirchi ka Salan"), name: "Mirchi ka Salan", quantity: 1 }], pickupAt: ago(4, 23).toISOString() }, orderId: callOrder1.id, status: "confirmed", providerCallId: "call_demo_0001", createdAt: callOrder1.row.createdAt as Date },
    { merchantId: nawab.id, fromPhone: lc(12).phone, language: "hi", transcript: hi, draftOrder: { items: [{ catalogItemId: nawabItem("Vegetable Dum Biryani"), name: "Vegetable Dum Biryani", quantity: 1 }, { catalogItemId: nawabItem("Garlic Naan"), name: "Garlic Naan", quantity: 2 }] }, orderId: callOrder2.id, status: "confirmed", providerCallId: "call_demo_0002", createdAt: callOrder2.row.createdAt as Date },
    { merchantId: nawab.id, fromPhone: lc(3).phone, language: "en", transcript: en1, draftOrder: { items: [{ catalogItemId: nawabItem("Hyderabadi Goat Dum Biryani"), name: "Hyderabadi Goat Dum Biryani", quantity: 1 }, { catalogItemId: nawabItem("Mirchi ka Salan"), name: "Mirchi ka Salan", quantity: 1 }], notes: "Name: Mariam" }, orderId: phoneOpen.id, status: "confirmed", providerCallId: "call_demo_0003", createdAt: minutesAgo(40) },
    { merchantId: nawab.id, fromPhone: lc(17).phone, language: "en", transcript: en2, draftOrder: { items: [{ catalogItemId: nawabItem("Chicken Biryani Degh (serves 15)"), name: "Chicken Biryani Degh (serves 15)", quantity: 2 }], pickupAt: ahead(2, 21).toISOString(), notes: "Deposit link not yet paid" }, orderId: null, status: "drafted", providerCallId: "call_demo_0004", createdAt: minutesAgo(70) },
    { merchantId: nawab.id, fromPhone: lc(18).phone, language: "pa", transcript: pa, draftOrder: { items: [{ catalogItemId: nawabItem("Hyderabadi Goat Dum Biryani"), name: "Hyderabadi Goat Dum Biryani", quantity: 1 }], pickupAt: ahead(0, 24).toISOString() }, orderId: null, status: "drafted", providerCallId: "call_demo_0005", createdAt: minutesAgo(20) },
    { merchantId: nawab.id, fromPhone: "+16475558801", language: "ur", transcript: "کالر: ہیلو؟ ہیلو؟ آواز نہیں آ رہی۔\n[call dropped after 6 seconds]", draftOrder: null, orderId: null, status: "failed", providerCallId: "call_demo_0006", createdAt: ago(2, 23) },
    { merchantId: nawab.id, fromPhone: "+16475558802", language: "en", transcript: "Caller: Are you open on Sunday and do you have haleem?\nAssistant: Yes, we are open from 11 am to 11 pm and haleem is on the menu every day. Would you like to place an order?\nCaller: No thanks, just checking.", draftOrder: null, orderId: null, status: "received", providerCallId: "call_demo_0007", createdAt: ago(1, 20) },
  ]);

  // ---- Tiffin (Shree) ----
  const plans = await db
    .insert(tiffinPlans)
    .values([
      { merchantId: shree.id, name: "Weekday Lunch Tiffin (weekly)", description: "A four-compartment Gujarati lunch, Monday to Saturday. Pause any week.", cadence: "weekly", daysOfWeek: [1, 2, 3, 4, 5, 6], mealsPerDay: 1, priceCents: 6900, extraServingCents: 5400, maxServings: 4, dietary: { vegetarian: true, spice: 1 }, deliveryFeeCents: 500, cutoffHours: 24, sortOrder: 0, translations: { hi: { name: "सप्ताहिक दोपहर का टिफिन", description: "सोमवार से शनिवार, चार डिब्बों में गुजराती दोपहर का खाना।" }, ur: { name: "ہفتہ وار دوپہر کا ٹفن", description: "پیر سے ہفتہ، چار خانوں میں گجراتی دوپہر کا کھانا۔ کوئی بھی ہفتہ روک سکتے ہیں۔" }, pa: { name: "ਹਫ਼ਤਾਵਾਰੀ ਦੁਪਹਿਰ ਦਾ ਟਿਫ਼ਿਨ", description: "ਸੋਮਵਾਰ ਤੋਂ ਸ਼ਨਿੱਚਰਵਾਰ, ਚਾਰ ਖਾਨਿਆਂ ਵਿੱਚ ਗੁਜਰਾਤੀ ਦੁਪਹਿਰ ਦਾ ਖਾਣਾ। ਕੋਈ ਵੀ ਹਫ਼ਤਾ ਰੋਕ ਸਕਦੇ ਹੋ।" } }, createdAt: shree.createdAt },
      { merchantId: shree.id, name: "Dinner Tiffin, 7 days (monthly)", description: "Dal, shaak, rotli and rice every evening, including Sundays.", cadence: "monthly", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], mealsPerDay: 1, priceCents: 23900, extraServingCents: 19000, maxServings: 5, dietary: { vegetarian: true, spice: 1 }, deliveryFeeCents: 2000, cutoffHours: 24, sortOrder: 1, translations: { hi: { name: "मासिक रात का टिफिन (7 दिन)", description: "हर शाम दाल, सब्ज़ी, रोटी और चावल, रविवार सहित।" }, ur: { name: "ماہانہ رات کا ٹفن (7 دن)", description: "ہر شام دال، سبزی، روٹی اور چاول، اتوار سمیت۔" }, pa: { name: "ਮਹੀਨਾਵਾਰ ਰਾਤ ਦਾ ਟਿਫ਼ਿਨ (7 ਦਿਨ)", description: "ਹਰ ਸ਼ਾਮ ਦਾਲ, ਸਬਜ਼ੀ, ਰੋਟੀ ਅਤੇ ਚੌਲ, ਐਤਵਾਰ ਸਮੇਤ।" } }, createdAt: shree.createdAt },
      { merchantId: shree.id, name: "Jain Lunch Tiffin (monthly)", description: "No onion, garlic or root vegetables. Monday to Friday.", cadence: "monthly", daysOfWeek: [1, 2, 3, 4, 5], mealsPerDay: 1, priceCents: 21900, extraServingCents: 17500, maxServings: 3, dietary: { vegetarian: true, jain: true, spice: 1 }, deliveryFeeCents: 2000, cutoffHours: 48, sortOrder: 2, translations: { hi: { name: "जैन दोपहर का टिफिन (मासिक)", description: "प्याज़, लहसुन और कंदमूल के बिना। सोमवार से शुक्रवार।" }, ur: { name: "جین دوپہر کا ٹفن (ماہانہ)", description: "پیاز، لہسن اور زمین کے اندر اگنے والی سبزیوں کے بغیر۔ پیر سے جمعہ۔" }, pa: { name: "ਜੈਨ ਦੁਪਹਿਰ ਦਾ ਟਿਫ਼ਿਨ (ਮਹੀਨਾਵਾਰ)", description: "ਪਿਆਜ਼, ਲਸਣ ਅਤੇ ਜ਼ਮੀਨ ਹੇਠਲੀਆਂ ਸਬਜ਼ੀਆਂ ਤੋਂ ਬਿਨਾਂ। ਸੋਮਵਾਰ ਤੋਂ ਸ਼ੁੱਕਰਵਾਰ।" } }, createdAt: shree.createdAt },
    ])
    .returning();
  const [weekly, dinner, jain] = plans as [(typeof plans)[number], (typeof plans)[number], (typeof plans)[number]];
  const routes = await db
    .insert(tiffinRoutes)
    .values([
      { merchantId: shree.id, name: "Route A: Hurontario and Britannia", driverName: "Harjit Bains", driverPhone: "+19055550181", areas: ["L5R", "L5V"], sortOrder: 0, createdAt: shree.createdAt },
      { merchantId: shree.id, name: "Route B: Eglinton and Square One", driverName: "Dev Parmar", driverPhone: "+19055550182", areas: ["L4Z", "L5V"], sortOrder: 1, createdAt: shree.createdAt },
    ])
    .returning();
  const routeFor = (postal: string) => (postal.startsWith("L4Z") ? routes[1]! : routes[0]!);

  // Menus for the next 14 days: one per plan per service day.
  const lunchRota: { name: string; description?: string; dietary?: DietaryTags }[][] = [
    [{ name: "Bhindi nu shaak" }, { name: "Dal and rice" }, { name: "Rotli (4)" }, { name: "Kachumber salad" }, { name: "Mohanthal", description: "A sweet gram flour square" }],
    [{ name: "Ringan bateta shaak" }, { name: "Gujarati kadhi" }, { name: "Bajra rotla" }, { name: "Jeera rice" }, { name: "Papad and chhundo" }],
    [{ name: "Sev tameta nu shaak" }, { name: "Toor dal" }, { name: "Thepla (3)" }, { name: "Vaghareli khichdi" }, { name: "Shrikhand cup" }],
    [{ name: "Tindora sambharo" }, { name: "Mag nu shaak" }, { name: "Puri (4)" }, { name: "Steamed rice" }, { name: "Khaman dhokla (3)" }],
    [{ name: "Undhiyu (seasonal)", description: "Winter vegetables with muthia" }, { name: "Dal" }, { name: "Puri (4)" }, { name: "Jalebi (2)" }, { name: "Masala chaas" }],
    [{ name: "Dudhi chana dal" }, { name: "Gujarati kadhi" }, { name: "Rotli (4)" }, { name: "Bhaat" }, { name: "Chakri" }],
  ];

  // hi / ur / pa words for the rota dishes (shown on the public tiffin page in the customer's language).
  const DISH_TR: Record<string, Record<"hi" | "ur" | "pa", string>> = {
    "Bhindi nu shaak": { hi: "भिंडी की सब्ज़ी", ur: "بھنڈی کی سبزی", pa: "ਭਿੰਡੀ ਦੀ ਸਬਜ਼ੀ" },
    "Dal and rice": { hi: "दाल और चावल", ur: "دال اور چاول", pa: "ਦਾਲ ਅਤੇ ਚੌਲ" },
    "Rotli (4)": { hi: "रोटली (4)", ur: "روٹلی (4)", pa: "ਰੋਟਲੀ (4)" },
    "Kachumber salad": { hi: "कचुंबर सलाद", ur: "کچومبر سلاد", pa: "ਕਚੁੰਬਰ ਸਲਾਦ" },
    "Mohanthal": { hi: "मोहनथाल", ur: "موہن تھال", pa: "ਮੋਹਨਥਾਲ" },
    "Ringan bateta shaak": { hi: "बैंगन आलू की सब्ज़ी", ur: "بینگن آلو کی سبزی", pa: "ਬੈਂਗਣ ਆਲੂ ਦੀ ਸਬਜ਼ੀ" },
    "Gujarati kadhi": { hi: "गुजराती कढ़ी", ur: "گجراتی کڑھی", pa: "ਗੁਜਰਾਤੀ ਕੜ੍ਹੀ" },
    "Bajra rotla": { hi: "बाजरे का रोटला", ur: "باجرے کا روٹلا", pa: "ਬਾਜਰੇ ਦਾ ਰੋਟਲਾ" },
    "Jeera rice": { hi: "जीरा चावल", ur: "زیرہ چاول", pa: "ਜੀਰਾ ਚੌਲ" },
    "Papad and chhundo": { hi: "पापड़ और छुंदो", ur: "پاپڑ اور چھندو", pa: "ਪਾਪੜ ਅਤੇ ਛੁੰਦੋ" },
    "Sev tameta nu shaak": { hi: "सेव टमाटर की सब्ज़ी", ur: "سیو ٹماٹر کی سبزی", pa: "ਸੇਵ ਟਮਾਟਰ ਦੀ ਸਬਜ਼ੀ" },
    "Toor dal": { hi: "तूर दाल", ur: "ارہر کی دال", pa: "ਤੂਰ ਦਾਲ" },
    "Thepla (3)": { hi: "थेपला (3)", ur: "تھیپلا (3)", pa: "ਥੇਪਲਾ (3)" },
    "Vaghareli khichdi": { hi: "वघारेली खिचड़ी", ur: "تڑکے والی کھچڑی", pa: "ਤੜਕੇ ਵਾਲੀ ਖਿਚੜੀ" },
    "Shrikhand cup": { hi: "श्रीखंड कटोरी", ur: "شری کھنڈ کپ", pa: "ਸ਼੍ਰੀਖੰਡ ਕੱਪ" },
    "Tindora sambharo": { hi: "टिंडोरा संभारो", ur: "ٹنڈورا سمبھارو", pa: "ਟਿੰਡੋਰਾ ਸੰਭਾਰੋ" },
    "Mag nu shaak": { hi: "मूंग की सब्ज़ी", ur: "مونگ کی سبزی", pa: "ਮੂੰਗ ਦੀ ਸਬਜ਼ੀ" },
    "Puri (4)": { hi: "पूरी (4)", ur: "پوری (4)", pa: "ਪੂਰੀ (4)" },
    "Steamed rice": { hi: "सादा चावल", ur: "سادہ چاول", pa: "ਸਾਦੇ ਚੌਲ" },
    "Khaman dhokla (3)": { hi: "खमन ढोकला (3)", ur: "کھمن ڈھوکلا (3)", pa: "ਖਮਣ ਢੋਕਲਾ (3)" },
    "Undhiyu (seasonal)": { hi: "ऊंधियू (मौसमी)", ur: "اُندھیو (موسمی)", pa: "ਊਂਧੀਯੂ (ਮੌਸਮੀ)" },
    "Dal": { hi: "दाल", ur: "دال", pa: "ਦਾਲ" },
    "Jalebi (2)": { hi: "जलेबी (2)", ur: "جلیبی (2)", pa: "ਜਲੇਬੀ (2)" },
    "Masala chaas": { hi: "मसाला छाछ", ur: "مسالہ لسّی", pa: "ਮਸਾਲਾ ਛਾਛ" },
    "Dudhi chana dal": { hi: "लौकी चना दाल", ur: "لوکی چنے کی دال", pa: "ਲੌਕੀ ਛੋਲਿਆਂ ਦੀ ਦਾਲ" },
    "Bhaat": { hi: "भात", ur: "بھات", pa: "ਭਾਤ" },
    "Chakri": { hi: "चकरी", ur: "چکری", pa: "ਚਕਰੀ" },
  };
  const DISH_DESC_TR: Record<string, Record<"hi" | "ur" | "pa", string>> = {
    "A sweet gram flour square": { hi: "बेसन की मीठी बर्फ़ी", ur: "بیسن کی میٹھی برفی", pa: "ਬੇਸਣ ਦੀ ਮਿੱਠੀ ਬਰਫ਼ੀ" },
    "Winter vegetables with muthia": { hi: "सर्दियों की सब्ज़ियाँ और मुठिया", ur: "سردیوں کی سبزیاں اور مٹھیا", pa: "ਸਿਆਲ ਦੀਆਂ ਸਬਜ਼ੀਆਂ ਅਤੇ ਮੁਠੀਆ" },
  };
  const trOf = (name: string, description?: string) => {
    const n = DISH_TR[name];
    if (!n) return undefined;
    const d = description ? DISH_DESC_TR[description] : undefined;
    return Object.fromEntries((["hi", "ur", "pa"] as const).map((l) => [l, { name: n[l], ...(d ? { description: d[l] } : {}) }]));
  };
  const veg: DietaryTags = { vegetarian: true };
  const menuRows: (typeof tiffinMenus.$inferInsert)[] = [];
  for (let d = 0; d < 14; d++) {
    const key = addDays(today, d);
    const wd = weekday(key);
    for (const p of [weekly, dinner, jain]) {
      if (!(p.daysOfWeek as number[]).includes(wd)) continue;
      const rota = lunchRota[(d + (p === dinner ? 3 : p === jain ? 1 : 0)) % lunchRota.length]!;
      const items = rota.map((it) => ({ ...it, dietary: p === jain ? { vegetarian: true, jain: true } : veg, translations: trOf(it.name, it.description) }));
      // Jain days drop root-vegetable dishes.
      const filtered = p === jain ? items.filter((i) => !/bateta|Undhiyu|Tindora|Sev tameta/.test(i.name)) : items;
      menuRows.push({ merchantId: shree.id, planId: p.id, date: key, items: filtered, notes: p === jain ? "Jain: no onion, garlic or root vegetables" : null, createdAt: shree.createdAt });
    }
  }
  await db.insert(tiffinMenus).values(menuRows);

  // ~25 subscribers with skips, pauses, a past-due account and today's deliveries.
  const plansArr = [weekly, dinner, jain];
  const subSpec: { status: string; plan: number; servings: number; fulfilment: "delivery" | "pickup"; startAgo: number; skips?: number[]; pausedUntil?: number; method?: string }[] = [];
  const statuses = ["active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "active", "paused", "paused", "paused", "past_due", "pending", "cancelled", "active", "active"];
  for (const [i, status] of statuses.entries()) {
    subSpec.push({ status, plan: i % 3 === 2 ? 2 : i % 3, servings: i % 7 === 0 ? 2 : i % 11 === 0 ? 3 : 1, fulfilment: i % 8 === 5 ? "pickup" : "delivery", startAgo: [3, 9, 16, 24, 31, 38, 45, 52, 55, 14, 20, 28, 35, 42, 6, 11, 18, 33, 40, 26, 47, 1, 50, 8, 22][i]!, skips: i % 3 === 0 && status === "active" ? [1, 3].slice(0, 1 + (i % 2)) : undefined, pausedUntil: status === "paused" ? 6 + i : undefined, method: i % 4 === 0 ? "pad" : "card" });
  }
  const subRows: (typeof tiffinSubscriptions.$inferInsert & { id: string })[] = [];
  const chargeRows: (typeof tiffinCharges.$inferInsert)[] = [];
  const skipRows: (typeof tiffinSkips.$inferInsert)[] = [];
  const deliveryRows: (typeof tiffinDeliveries.$inferInsert)[] = [];
  const stops = new Map<string, number>();
  for (const [i, sp] of subSpec.entries()) {
    const c = customers[i]!;
    const plan = plansArr[sp.plan]!;
    const route = sp.fulfilment === "delivery" ? routeFor(c.postal) : null;
    const price = plan.priceCents + (sp.servings - 1) * plan.extraServingCents + (sp.fulfilment === "delivery" ? plan.deliveryFeeCents : 0);
    const start = addDays(today, -sp.startAgo);
    const monthly = plan.cadence === "monthly";
    // Current billing period, anchored to the start date.
    const span = monthly ? 30 : 7;
    const cycles = Math.floor(sp.startAgo / span);
    const pStart = addDays(start, cycles * span);
    const pEnd = addDays(pStart, span - 1);
    const id = randomUUID();
    const stopOrder = route ? (stops.set(route.id, (stops.get(route.id) ?? 0) + 1), stops.get(route.id)!) : null;
    subRows.push({
      id,
      merchantId: shree.id,
      planId: plan.id,
      userId: c.id,
      status: sp.status,
      servings: sp.servings,
      fulfilment: sp.fulfilment,
      address: sp.fulfilment === "delivery" ? `${100 + i * 17} ${STREETS[i % STREETS.length]}, Mississauga ON` : null,
      addressNotes: sp.fulfilment === "delivery" && i % 5 === 0 ? "Leave with the concierge" : null,
      postalCode: c.postal,
      routeId: route?.id ?? null,
      stopOrder,
      dietaryNotes: i % 9 === 0 ? "No peanuts, nut allergy in the family" : plan === jain ? "Jain" : null,
      startDate: start,
      pausedUntil: sp.pausedUntil ? addDays(today, sp.pausedUntil) : null,
      currentPeriodStart: sp.status === "pending" ? null : pStart,
      currentPeriodEnd: sp.status === "pending" ? null : pEnd,
      nextBillingDate: sp.status === "cancelled" || sp.status === "pending" ? null : addDays(pEnd, 1),
      priceCents: price,
      paymentMethod: sp.method ?? "card",
      cancelledAt: sp.status === "cancelled" ? ago(4) : null,
      cancelReason: sp.status === "cancelled" ? "Moving out of the area" : null,
      createdAt: new Date(`${start}T14:00:00Z`),
    });
    // Charges: the current period, plus the previous one when the subscription is older.
    const credit = sp.skips ? Math.round(price / (monthly ? 25 : 6)) * sp.skips.length : 0;
    const mk = (ps: string, pe: string, status: string) => ({ merchantId: shree.id, subscriptionId: id, periodStart: ps, periodEnd: pe, amountCents: price - credit, creditCents: credit, platformFeeCents: Math.round(((price - credit) * 100) / 10000), status, paidAt: status === "paid" ? new Date(`${ps}T13:00:00Z`) : null, createdAt: new Date(`${ps}T13:00:00Z`) });
    if (sp.status !== "pending") chargeRows.push(mk(pStart, pEnd, sp.status === "past_due" ? "failed" : "paid"));
    if (cycles >= 1 && sp.status !== "pending") chargeRows.push({ ...mk(addDays(pStart, -span), addDays(pStart, -1), "paid"), creditCents: 0, amountCents: price });
    if (sp.status === "pending") chargeRows.push({ ...mk(today, addDays(today, span - 1), "pending"), paidAt: null, creditCents: 0, amountCents: price });

    // Deliveries from a week back to the day after tomorrow.
    if (sp.status === "active") {
      const skipKeys = new Set<string>();
      let seen = 0;
      for (let d = 1; d <= 6 && seen < (sp.skips?.length ?? 0); d++) {
        const k = addDays(today, d);
        if ((plan.daysOfWeek as number[]).includes(weekday(k)) && k > start) { skipKeys.add(k); seen++; }
      }
      if (i % 6 === 1) skipKeys.add(addDays(today, -2)); // a past skip
      for (const k of skipKeys) skipRows.push({ subscriptionId: id, date: k, reason: R.pick(["Out of town", "Family visiting", "Fasting this week", "Away for a wedding"]), createdAt: ago(3) });
      for (let d = -6; d <= 2; d++) {
        const k = addDays(today, d);
        if (k < start || !(plan.daysOfWeek as number[]).includes(weekday(k))) continue;
        let status: string;
        let deliveredAt: Date | null = null;
        if (skipKeys.has(k)) status = "skipped";
        else if (d < 0) {
          status = sp.fulfilment === "pickup" ? "picked_up" : i % 17 === 3 && d === -3 ? "missed" : "delivered";
          deliveredAt = status === "missed" ? null : new Date(`${k}T17:${String(10 + (i % 40)).padStart(2, "0")}:00Z`);
        } else if (d === 0) {
          const early = i % 3 === 0;
          status = sp.fulfilment === "pickup" ? (early ? "picked_up" : "scheduled") : early ? "delivered" : i % 3 === 1 ? "out_for_delivery" : "scheduled";
          deliveredAt = status === "delivered" || status === "picked_up" ? minutesAgo(R.int(15, 120)) : null;
        } else status = "scheduled";
        deliveryRows.push({ merchantId: shree.id, subscriptionId: id, routeId: route?.id ?? null, date: k, servings: sp.servings, status, stopOrder, deliveredAt, note: status === "skipped" ? "Skipped by customer" : null, createdAt: ago(1) });
      }
    }
    if (sp.status === "paused") {
      // Delivered until a few days ago, then paused.
      for (let d = -6; d <= -3; d++) {
        const k = addDays(today, d);
        if (k < start || !(plan.daysOfWeek as number[]).includes(weekday(k))) continue;
        deliveryRows.push({ merchantId: shree.id, subscriptionId: id, routeId: route?.id ?? null, date: k, servings: sp.servings, status: sp.fulfilment === "pickup" ? "picked_up" : "delivered", stopOrder, deliveredAt: new Date(`${k}T17:20:00Z`), createdAt: ago(1) });
      }
    }
  }
  await db.insert(tiffinSubscriptions).values(subRows);
  await db.insert(tiffinCharges).values(chargeRows);
  if (skipRows.length) await db.insert(tiffinSkips).values(skipRows);
  for (let i = 0; i < deliveryRows.length; i += 150) await db.insert(tiffinDeliveries).values(deliveryRows.slice(i, i + 150));

  // ---- Banquet hall (Nawab, Noor Hall) and catering (Zeenat, plus the banquet event) ----
  const [noor] = await db
    .insert(halls)
    .values({
      merchantId: nawab.id,
      name: "Noor Hall",
      capacity: 250,
      description: "Seats 250 banquet style with a stage, bridal suite, separate prayer room and valet. Halal kitchen on site.",
      baseCents: 250000,
      depositBps: 2500,
      packages: [
        { name: "Silver", perHeadCents: 4200, includes: ["Chicken biryani", "Chicken qorma", "Naan", "Salad and raita", "Gulab jamun"] },
        { name: "Gold", perHeadCents: 5800, includes: ["Goat and chicken biryani", "Qorma and nihari", "Seekh kebab", "Naan", "Salad and raita", "Double ka meetha", "Chai"] },
        { name: "Platinum", perHeadCents: 7500, includes: ["Live tandoor station", "Goat dum biryani", "Chicken tikka", "Nihari and haleem", "Three desserts", "Chai and soft drinks"] },
      ],
      createdAt: nawab.createdAt,
    })
    .returning();
  const evTotals = (lines: { description: string; quantity: number; unitPriceCents: number }[]) => {
    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    const tax = computeTax(subtotal, "ON").taxCents;
    return { subtotal, tax, total: subtotal + tax };
  };
  const cateringRows: (typeof cateringEvents.$inferInsert)[] = [];
  const cNo = new Map<string, number>();
  const cNext = (id: string) => (cNo.set(id, (cNo.get(id) ?? 0) + 1), cNo.get(id)!);
  const tok = (slug: string, n: number) => `ce-${slug}-${n}-${R.int(100000, 999999)}`;
  const zItem = (name: string) => itemByName(zeenat, name);
  interface Cat { sh: (typeof shops)[number]; user: number; type: string; inDays: number; start: string; head: number; venue: string; addr: string; service: string; status: string; perHead: number; extras: { description: string; quantity: number; unitPriceCents: number }[]; menu: { name: string; perHeadCents?: number; quantity?: number; unitPriceCents?: number; catalogItemId?: string }[]; dietary?: string; notes?: string; sent?: number; approved?: boolean; depositPaid?: boolean; tasting?: number; bps?: number }
  const cats: Cat[] = [
    { sh: zeenat, user: 4, type: "walima", inDays: 21, start: "19:00", head: 300, venue: "Grand Meridian Banquet Hall", addr: "5500 Meridian Gate, Mississauga ON", service: "onsite", status: "confirmed", perHead: 2800, extras: [{ description: "Service staff and setup (8 servers, 2 chefs)", quantity: 1, unitPriceCents: 120000 }], menu: [{ name: "Walima Dinner Package (per guest)", perHeadCents: 2800, catalogItemId: zItem("Walima Dinner Package (per guest)").id }], dietary: "Zabihah only. 12 guests with nut allergies, keep kheer nut-free.", notes: "Bride's family prefers dinner service at 8 pm sharp.", sent: 14, approved: true, depositPaid: true },
    { sh: zeenat, user: 7, type: "mehndi", inDays: 35, start: "18:30", head: 150, venue: "Rose Garden Hall", addr: "88 Orchard Terrace, Brampton ON", service: "delivery", status: "quoted", perHead: 2400, extras: [{ description: "Live chai and jalebi counter", quantity: 1, unitPriceCents: 45000 }], menu: [{ name: "Mehndi Night Package (per guest)", perHeadCents: 2400, catalogItemId: zItem("Mehndi Night Package (per guest)").id }], notes: "Family asked to add a dessert table. Quote sent, waiting to hear back.", sent: 2 },
    { sh: zeenat, user: 10, type: "wedding", inDays: 62, start: "18:00", head: 400, venue: "Event venue not chosen yet", addr: "", service: "onsite", status: "inquiry", perHead: 0, extras: [], menu: [], notes: "Asked for a Pakistani wedding menu with a live BBQ station. Callback requested." },
    { sh: zeenat, user: 13, type: "aqiqah", inDays: 9, start: "13:00", head: 80, venue: "Home, Mississauga", addr: "41 Brookview Rd, Mississauga ON", service: "delivery", status: "tasting", perHead: 0, extras: [{ description: "Aqiqah package, goat for 40 guests", quantity: 2, unitPriceCents: 79900 }], menu: [{ name: "Aqiqah Package (goat for 40)", quantity: 2, unitPriceCents: 79900, catalogItemId: zItem("Aqiqah Package (goat for 40)").id }], tasting: 3, notes: "Tasting booked in 3 days." },
    { sh: zeenat, user: 15, type: "corporate", inDays: -14, start: "12:00", head: 120, venue: "Peel Tech Park, Building C", addr: "700 Innovation Dr, Mississauga ON", service: "delivery", status: "completed", perHead: 1699, extras: [{ description: "Disposable cutlery and chafing dishes", quantity: 1, unitPriceCents: 18000 }], menu: [{ name: "Corporate Lunch Box", perHeadCents: 1699, catalogItemId: zItem("Corporate Lunch Box").id }], dietary: "20 vegetarian, 8 halal-only (all food halal)", sent: 28, approved: true, depositPaid: true },
    { sh: zeenat, user: 16, type: "birthday", inDays: -6, start: "17:00", head: 60, venue: "Community centre hall", addr: "12 Lakeshore Gate, Mississauga ON", service: "pickup", status: "cancelled", perHead: 2100, extras: [], menu: [{ name: "Eid Lunch Tray: Biryani and Korma (serves 10)", quantity: 6, unitPriceCents: 15900, catalogItemId: zItem("Eid Lunch Tray: Biryani and Korma (serves 10)").id }], notes: "Cancelled by the host. Deposit not taken.", sent: 20 },
  ];
  const evIds: string[] = [];
  for (const c of cats) {
    const lines = [...(c.perHead ? [{ description: `${c.menu[0]?.name ?? "Catering"} x ${c.head}`, quantity: c.head, unitPriceCents: c.perHead }] : []), ...c.extras];
    const t = evTotals(lines);
    const bps = c.bps ?? 3000;
    const id = randomUUID();
    evIds.push(id);
    const sentAt = c.sent ? ago(c.sent) : null;
    cateringRows.push({
      id,
      merchantId: c.sh.id,
      userId: lc(c.user).id,
      number: cNext(c.sh.id),
      eventType: c.type,
      eventDate: addDays(today, c.inDays),
      startTime: c.start,
      headcount: c.head,
      venueName: c.venue,
      venueAddress: c.addr || null,
      service: c.service,
      status: c.status,
      menu: c.menu,
      perHeadCents: c.perHead,
      lineItems: lines,
      subtotalCents: t.subtotal,
      taxCents: t.tax,
      totalCents: t.total,
      depositBps: bps,
      depositCents: Math.round((t.total * bps) / 10000),
      dietaryNotes: c.dietary ?? null,
      notes: c.notes ?? null,
      tastingAt: c.tasting ? ahead(c.tasting, 20) : null,
      approvalToken: tok(c.sh.s.slug, cNo.get(c.sh.id)!),
      quoteSentAt: sentAt,
      approvedAt: c.approved ? new Date(sentAt!.getTime() + 2 * DAY) : null,
      signatureName: c.approved ? lc(c.user).name : null,
      signatureIp: c.approved ? "203.0.113.24" : null,
      signatureUserAgent: c.approved ? "Mozilla/5.0 (demo)" : null,
      depositPaidAt: c.depositPaid ? new Date(sentAt!.getTime() + 2 * DAY + 3600_000) : null,
      createdAt: ago(c.sent ? c.sent + 3 : 5),
      updatedAt: ago(c.sent ? Math.max(c.sent - 2, 0) : 2),
    });
  }
  // Nawab: a banquet event for a confirmed hall booking.
  const hallPkg = noor!.packages[1]!;
  const bookings = await db
    .insert(hallBookings)
    .values([
      { hallId: noor!.id, merchantId: nawab.id, userId: lc(9).id, eventType: "wedding", startsAt: ahead(28, 22), endsAt: ahead(29, 3), headcount: 220, packageName: "Gold", status: "confirmed", totalCents: hallTotal, depositCents: Math.round(hallTotal * 0.25), depositPaidAt: bnqAt, notes: "Walima reception. Stage and bridal suite requested.", createdAt: ago(8) },
      { hallId: noor!.id, merchantId: nawab.id, userId: lc(19).id, eventType: "engagement", startsAt: ahead(44, 22), endsAt: ahead(45, 2), headcount: 120, packageName: "Silver", status: "hold", holdExpiresAt: ahead(5, 16), totalCents: noor!.baseCents + 4200 * 120 + computeTax(noor!.baseCents + 4200 * 120, "ON").taxCents, depositCents: 0, notes: "Holding the date while the family confirms.", createdAt: ago(2) },
      { hallId: noor!.id, merchantId: nawab.id, userId: lc(21).id, eventType: "walima", startsAt: ago(12, 22), endsAt: ago(11, 2), headcount: 180, packageName: "Platinum", status: "completed", totalCents: 250000 + 7500 * 180 + computeTax(250000 + 7500 * 180, "ON").taxCents, depositCents: 400000, depositPaidAt: ago(40), createdAt: ago(45) },
      { hallId: noor!.id, merchantId: nawab.id, userId: lc(23).id, eventType: "birthday", startsAt: ahead(16, 22), endsAt: ahead(17, 1), headcount: 90, packageName: "Silver", status: "cancelled", totalCents: 0, depositCents: 0, notes: "Cancelled, date conflict.", createdAt: ago(10) },
    ])
    .returning();
  const bkConfirmed = bookings[0]!;
  const banquetEv = randomUUID();
  const banquetLines = [{ description: "Noor Hall rental", quantity: 1, unitPriceCents: noor!.baseCents }, { description: "Gold package x 220", quantity: 220, unitPriceCents: hallPkg.perHeadCents }];
  const bt = evTotals(banquetLines);
  cateringRows.push({ id: banquetEv, merchantId: nawab.id, userId: lc(9).id, number: cNext(nawab.id), eventType: "walima", eventDate: addDays(today, 28), startTime: "18:00", headcount: 220, venueName: "Noor Hall", venueAddress: nawab.s.address, service: "banquet", status: "confirmed", menu: [{ name: "Gold package", perHeadCents: hallPkg.perHeadCents }], perHeadCents: hallPkg.perHeadCents, lineItems: banquetLines, subtotalCents: bt.subtotal, taxCents: bt.tax, totalCents: bt.total, depositBps: 2500, depositCents: Math.round((bt.total * 2500) / 10000), dietaryNotes: "Zabihah. Separate vegetarian counter for 30 guests.", notes: "Linked to the Noor Hall booking.", approvalToken: tok(nawab.s.slug, 1), quoteSentAt: ago(8), approvedAt: ago(6), signatureName: lc(9).name, signatureIp: "203.0.113.31", signatureUserAgent: "Mozilla/5.0 (demo)", depositPaidAt: bnqAt, hallBookingId: bkConfirmed.id, createdAt: ago(9), updatedAt: ago(5) });
  await db.insert(cateringEvents).values(cateringRows);
  await db.update(hallBookings).set({ cateringEventId: banquetEv }).where(eq(hallBookings.id, bkConfirmed.id));
  for (const [merchantId, n] of cNo) await db.insert(merchantCounters).values({ merchantId, name: "catering", value: n }).onConflictDoNothing();

  // ---- Campaigns (festival and wedding season) ----
  const reachNote = Math.max(8, Math.round(customers.length * 0.6));
  await db.insert(messages).values([
    { merchantId: lahori.id, channel: "sms", subject: null, body: "Wedding season is here. Book your Lahori degh (chicken karahi, mutton pulao, zarda) with 48 hours notice and 30% deposit. Reply or order at our page.", segment: { kind: "all" }, status: "sent", sentAt: ago(12), recipientCount: reachNote, createdAt: ago(12) },
    { merchantId: lahori.id, channel: "email", subject: "Ramadan iftar boxes: pre-orders open in the new year", body: "Pakoras, samosas, chana chaat and dates, ready for iftar. Pre-order for Ramadan 2027.", segment: { kind: "all" }, status: "scheduled", scheduledAt: ahead(110), createdAt: ago(1) },
    { merchantId: shop("meethi-mithai-and-chai").id, channel: "sms", subject: null, body: "Diwali mithai boxes are ready to pre-order. Kaju katli, laddu and barfi. Order 48 hours ahead and pick up fresh.", segment: { kind: "all" }, status: "sent", sentAt: ago(6), recipientCount: reachNote, createdAt: ago(6) },
    { merchantId: shop("meethi-mithai-and-chai").id, channel: "email", subject: "Eid mithai and sheer khurma trays", body: "Reserve your sheer khurma tray and Eid mithai box early.", segment: { kind: "all" }, status: "draft", createdAt: ago(1) },
    { merchantId: dhaba.id, channel: "email", subject: "Sarson da saag is back", body: "Sarson da saag and makki di roti are back on the menu every weekend until March.", segment: { kind: "all" }, status: "draft", createdAt: ago(1) },
  ]);

  // ---- Corridor profile details: tag a few regulars ----
  const regular = await db.select({ id: merchantMembers.id }).from(merchantMembers).where(eq(merchantMembers.merchantId, nawab.id)).limit(4);
  if (regular.length) await db.update(merchantMembers).set({ tags: ["regular", "degh buyer"], notes: "Orders goat biryani degh for family Fridays" }).where(eq(merchantMembers.id, regular[0]!.id));

  log(`Corridor customers: ${customers.length}, visits: ${visitCount}, redemptions: ${redemptionCount}, orders: ${orderCount}`);
  return { skipped: false, merchants: shops.length, customers: customers.length, visits: visitCount, redemptions: redemptionCount, orders: orderCount };
}

const OWNERS: Record<string, string> = {
  "nawab-biryani-house": "Mir Asif Ali",
  "lahori-karahi-and-bbq": "Tariq Mehmood",
  "shree-thali-and-tiffin": "Bhavna Shah",
  "sarson-dhaba": "Balwinder Gill",
  "meethi-mithai-and-chai": "Rekha Agarwal",
  "padma-bangladeshi-kitchen": "Shirin Chowdhury",
  "jaffna-kottu-house": "Sivakumar Nadarajah",
  "kabul-garden-grill": "Najib Rahimi",
  "zeenat-catering": "Zeenat Hashmi",
  "rangrez-beauty-studio": "Sadia Iqbal",
};
const ownerName = (slug: string) => OWNERS[slug] ?? "Shop Owner";
