/**
 * Desi / South Asian festival calendar, 2026–2028, with suggested campaign
 * templates and recommended send offsets (restaurant.festival_campaigns).
 *
 * Dates are Gregorian "YYYY-MM-DD" in the shop's local calendar day.
 * Fixed-date occasions (Independence Days, Vaisakhi, Lohri, Victory Day) are
 * exact. Lunar dates (Islamic calendar, Hindu and Sikh lunisolar festivals)
 * are `approximate: true`: Islamic dates follow the Umm al-Qura calendar and
 * can land a day later where the moon is sighted locally (often Pakistan, India,
 * Bangladesh and many Canadian masjids); Hindu and Sikh dates follow the
 * tithi and vary by a day with region. Always show "confirm locally" next to them.
 *
 * Template placeholders:
 *  - `{{merchant}}`, `{{first_name}}` are filled per recipient by the messaging service.
 *  - `{{festival_date}}` is filled with a readable date when a draft is created.
 */

export type FestivalTradition = "islamic" | "hindu" | "sikh" | "national";

export interface FestivalTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
  /** Plain SMS (the server adds the shop name and STOP line). */
  sms: string;
  /** Free-form WhatsApp text, usable inside the 24 hour window. */
  whatsapp: string;
  /** Suggested approved WhatsApp template name for broadcasts (merchant must get it approved in Meta). */
  whatsappTemplateName: string;
}

export interface FestivalSend {
  /** Days relative to the festival start date (negative = before). */
  offsetDays: number;
  templateId: string;
  label: string;
  /** Repeat every N days until `untilOffsetDays` (inclusive), e.g. iftar specials every day of Ramadan. */
  repeat?: { everyDays: number; untilOffsetDays: number };
}

export interface FestivalDef {
  id: string;
  name: string;
  /** Greeting in the community's own script, for the shop's own copy. */
  greeting: { en: string; hi?: string; ur?: string; pa?: string };
  tradition: FestivalTradition;
  /** True for lunar-calendar festivals: dates are approximate, confirm locally. */
  approximate: boolean;
  /** Shown next to approximate dates. */
  dateNote: string;
  /** Start date per year (end date when it spans days). */
  dates: Record<string, { start: string; end?: string }>;
  templates: FestivalTemplate[];
  sends: FestivalSend[];
}

const ISLAMIC_NOTE = "Approximate, confirm locally: moon sighting can move this date by a day.";
const HINDU_NOTE = "Approximate, confirm locally: follows the lunar calendar and can differ by a day between regions.";
const SIKH_NOTE = "Approximate, confirm locally: follows the lunar calendar and can differ by a day.";
const FIXED_NOTE = "Fixed date.";

const t = (id: string, label: string, subject: string, body: string, sms: string, whatsapp: string, whatsappTemplateName: string): FestivalTemplate => ({
  id,
  label,
  subject,
  body,
  sms,
  whatsapp,
  whatsappTemplateName,
});

export const FESTIVALS: readonly FestivalDef[] = [
  {
    id: "ramadan",
    name: "Ramadan",
    greeting: { en: "Ramadan Mubarak", hi: "रमज़ान मुबारक", ur: "رمضان مبارک", pa: "ਰਮਜ਼ਾਨ ਮੁਬਾਰਕ" },
    tradition: "islamic",
    approximate: true,
    dateNote: ISLAMIC_NOTE,
    dates: {
      "2026": { start: "2026-02-18", end: "2026-03-19" },
      "2027": { start: "2027-02-08", end: "2027-03-08" },
      "2028": { start: "2028-01-28", end: "2028-02-25" },
    },
    templates: [
      t(
        "ramadan_announce",
        "Ramadan is coming",
        "Iftar boxes and pot pre-orders at {{merchant}}",
        "Ramadan Mubarak, {{first_name}}.\n\nRamadan is expected to begin around {{festival_date}}. This year {{merchant}} will have iftar boxes, samosa and pakora trays, dates and fresh sharbat ready for pickup every evening. Pre-order for your family or your masjid iftar and we will have it hot at the time you choose.",
        "Ramadan Mubarak from {{merchant}}. Iftar boxes, samosa and pakora trays are available daily. Pre-order for your family or masjid.",
        "Ramadan Mubarak, {{first_name}}. {{merchant}} has iftar boxes, samosa and pakora trays ready every evening from about {{festival_date}}. Reply MENU to order, or pre-order for your family or masjid.",
        "ramadan_announce",
      ),
      t(
        "ramadan_iftar_daily",
        "Today's iftar special",
        "Today's iftar special at {{merchant}}",
        "{{first_name}}, today's iftar special is ready at {{merchant}}: fresh samosa, pakora, haleem and dates. Order ahead and pick up just before maghrib.",
        "Today's iftar special is ready at {{merchant}}. Order ahead and pick up before maghrib.",
        "Today's iftar special is ready at {{merchant}}: samosa, pakora and haleem. Reply MENU to order ahead and pick up before maghrib.",
        "ramadan_iftar_special",
      ),
    ],
    sends: [
      { offsetDays: -10, templateId: "ramadan_announce", label: "Announce iftar boxes and pre-orders" },
      { offsetDays: 0, templateId: "ramadan_iftar_daily", label: "Daily iftar special (optional, send on the days you run one)", repeat: { everyDays: 1, untilOffsetDays: 27 } },
    ],
  },
  {
    id: "chaand_raat",
    name: "Chaand Raat",
    greeting: { en: "Chaand Raat Mubarak", hi: "चांद रात मुबारक", ur: "چاند رات مبارک", pa: "ਚੰਨ ਰਾਤ ਮੁਬਾਰਕ" },
    tradition: "islamic",
    approximate: true,
    dateNote: ISLAMIC_NOTE,
    dates: {
      "2026": { start: "2026-03-19" },
      "2027": { start: "2027-03-08" },
      "2028": { start: "2028-02-25" },
    },
    templates: [
      t(
        "chaand_raat",
        "Chaand Raat pickup",
        "Chaand Raat pickups at {{merchant}}",
        "Chaand Raat Mubarak, {{first_name}}.\n\n{{merchant}} is open late tonight ({{festival_date}}) for last-minute Eid orders: sheer khurma, mithai boxes and biryani pots. Order ahead so it is packed when you arrive.",
        "Chaand Raat Mubarak from {{merchant}}. Open late tonight for sheer khurma, mithai and biryani. Order ahead.",
        "Chaand Raat Mubarak, {{first_name}}. {{merchant}} is open late tonight for sheer khurma, mithai boxes and biryani pots. Reply MENU to order ahead.",
        "chaand_raat_late",
      ),
    ],
    sends: [{ offsetDays: -1, templateId: "chaand_raat", label: "Chaand Raat late-night pickup" }],
  },
  {
    id: "eid_al_fitr",
    name: "Eid al-Fitr",
    greeting: { en: "Eid Mubarak", hi: "ईद मुबारक", ur: "عید مبارک", pa: "ਈਦ ਮੁਬਾਰਕ" },
    tradition: "islamic",
    approximate: true,
    dateNote: ISLAMIC_NOTE,
    dates: {
      "2026": { start: "2026-03-20" },
      "2027": { start: "2027-03-09" },
      "2028": { start: "2028-02-26" },
    },
    templates: [
      t(
        "eid_fitr_preorder",
        "Eid mithai and biryani pre-orders",
        "Pre-order your Eid mithai and biryani at {{merchant}}",
        "Eid Mubarak in advance, {{first_name}}.\n\nEid al-Fitr is expected around {{festival_date}}. Pre-order mithai boxes, sheer khurma, biryani pots and kebab trays at {{merchant}} now so your table is ready. Pre-orders close two days before Eid.",
        "Eid mithai, sheer khurma and biryani pots: pre-order now at {{merchant}}. Pre-orders close 2 days before Eid.",
        "Eid Mubarak in advance, {{first_name}}. Pre-order mithai boxes, sheer khurma and biryani pots at {{merchant}}. Reply MENU to order. Pre-orders close two days before Eid.",
        "eid_preorder",
      ),
      t(
        "eid_greeting",
        "Eid greeting",
        "Eid Mubarak from {{merchant}}",
        "Eid Mubarak, {{first_name}}. From all of us at {{merchant}}, thank you for being part of our community. We are open today with fresh biryani, kebabs and mithai.",
        "Eid Mubarak from all of us at {{merchant}}. Thank you for being part of our community.",
        "Eid Mubarak, {{first_name}}. From all of us at {{merchant}}, thank you for being part of our community.",
        "eid_greeting",
      ),
    ],
    sends: [
      { offsetDays: -10, templateId: "eid_fitr_preorder", label: "Mithai and biryani pre-orders open" },
      { offsetDays: 0, templateId: "eid_greeting", label: "Eid greeting" },
    ],
  },
  {
    id: "eid_al_adha",
    name: "Eid al-Adha",
    greeting: { en: "Eid Mubarak", hi: "ईद अल-अज़हा मुबारक", ur: "عید الاضحیٰ مبارک", pa: "ਈਦ ਮੁਬਾਰਕ" },
    tradition: "islamic",
    approximate: true,
    dateNote: ISLAMIC_NOTE,
    dates: {
      "2026": { start: "2026-05-27" },
      "2027": { start: "2027-05-16" },
      "2028": { start: "2028-05-05" },
    },
    templates: [
      t(
        "eid_adha_preorder",
        "Eid al-Adha feast pre-orders",
        "Eid al-Adha feast trays at {{merchant}}",
        "Eid Mubarak in advance, {{first_name}}.\n\nEid al-Adha is expected around {{festival_date}}. {{merchant}} is taking pre-orders for karahi, nihari, biryani pots and mithai trays to feed the whole family. Order early, we book up fast.",
        "Eid al-Adha feast trays: karahi, nihari, biryani and mithai. Pre-order now at {{merchant}}.",
        "Eid Mubarak in advance, {{first_name}}. {{merchant}} is taking pre-orders for karahi, nihari, biryani pots and mithai trays for Eid al-Adha. Reply MENU to order early.",
        "eid_adha_preorder",
      ),
      t(
        "eid_greeting",
        "Eid greeting",
        "Eid Mubarak from {{merchant}}",
        "Eid Mubarak, {{first_name}}. From all of us at {{merchant}}, thank you for being part of our community.",
        "Eid Mubarak from all of us at {{merchant}}.",
        "Eid Mubarak, {{first_name}}. From all of us at {{merchant}}, thank you for being part of our community.",
        "eid_greeting",
      ),
    ],
    sends: [
      { offsetDays: -10, templateId: "eid_adha_preorder", label: "Feast tray pre-orders open" },
      { offsetDays: 0, templateId: "eid_greeting", label: "Eid greeting" },
    ],
  },
  {
    id: "muharram",
    name: "Islamic New Year (Muharram)",
    greeting: { en: "Happy Islamic New Year", hi: "नया इस्लामी साल मुबारक", ur: "اسلامی نیا سال مبارک", pa: "ਇਸਲਾਮੀ ਨਵਾਂ ਸਾਲ ਮੁਬਾਰਕ" },
    tradition: "islamic",
    approximate: true,
    dateNote: ISLAMIC_NOTE,
    dates: {
      "2026": { start: "2026-06-16" },
      "2027": { start: "2027-06-06" },
      "2028": { start: "2028-05-25" },
    },
    templates: [
      t(
        "muharram_greeting",
        "Islamic New Year greeting",
        "Wishing you a blessed new year from {{merchant}}",
        "{{first_name}}, {{merchant}} wishes you and your family a peaceful and blessed Islamic New Year.",
        "{{merchant}} wishes you a peaceful and blessed Islamic New Year.",
        "{{first_name}}, {{merchant}} wishes you and your family a peaceful and blessed Islamic New Year.",
        "islamic_new_year",
      ),
    ],
    sends: [{ offsetDays: 0, templateId: "muharram_greeting", label: "New year greeting (optional)" }],
  },
  {
    id: "ashura",
    name: "Ashura",
    greeting: { en: "Ashura", hi: "आशूरा", ur: "عاشورہ", pa: "ਆਸ਼ੂਰਾ" },
    tradition: "islamic",
    approximate: true,
    dateNote: ISLAMIC_NOTE,
    dates: {
      "2026": { start: "2026-06-25" },
      "2027": { start: "2027-06-15" },
      "2028": { start: "2028-06-03" },
    },
    templates: [
      t(
        "ashura_nazr",
        "Nazr and niaz orders",
        "Niaz and nazr orders at {{merchant}}",
        "{{first_name}}, for Ashura ({{festival_date}}) {{merchant}} is taking orders for haleem, biryani and sharbat by the pot for niaz and nazr. Please order at least two days ahead so we can prepare it properly.",
        "Haleem, biryani and sharbat by the pot for Ashura niaz. Order 2 days ahead at {{merchant}}.",
        "{{first_name}}, {{merchant}} is taking orders for haleem, biryani and sharbat by the pot for Ashura niaz. Please order at least two days ahead. Reply MENU to start.",
        "ashura_niaz",
      ),
    ],
    sends: [{ offsetDays: -5, templateId: "ashura_nazr", label: "Niaz and nazr pot orders" }],
  },
  {
    id: "mawlid",
    name: "Mawlid (Eid Milad un Nabi)",
    greeting: { en: "Eid Milad un Nabi Mubarak", hi: "ईद मिलादुन्नबी मुबारक", ur: "عید میلاد النبی مبارک", pa: "ਈਦ ਮਿਲਾਦ ਉਨ ਨਬੀ ਮੁਬਾਰਕ" },
    tradition: "islamic",
    approximate: true,
    dateNote: ISLAMIC_NOTE,
    dates: {
      "2026": { start: "2026-08-25" },
      "2027": { start: "2027-08-14" },
      "2028": { start: "2028-08-03" },
    },
    templates: [
      t(
        "mawlid_trays",
        "Mawlid gathering trays",
        "Mawlid gathering trays at {{merchant}}",
        "{{first_name}}, for Mawlid ({{festival_date}}) {{merchant}} can prepare sweet trays, zarda, biryani pots and tea for your gathering. Please order two days ahead.",
        "Mawlid gathering trays: mithai, zarda and biryani pots at {{merchant}}. Order 2 days ahead.",
        "{{first_name}}, {{merchant}} can prepare mithai trays, zarda and biryani pots for your Mawlid gathering. Reply MENU to order, two days ahead please.",
        "mawlid_trays",
      ),
    ],
    sends: [{ offsetDays: -7, templateId: "mawlid_trays", label: "Gathering tray pre-orders" }],
  },
  {
    id: "diwali",
    name: "Diwali",
    greeting: { en: "Happy Diwali", hi: "दीपावली की शुभकामनाएं", ur: "دیوالی مبارک", pa: "ਦੀਵਾਲੀ ਦੀਆਂ ਮੁਬਾਰਕਾਂ" },
    tradition: "hindu",
    approximate: true,
    dateNote: HINDU_NOTE,
    dates: {
      "2026": { start: "2026-11-08" },
      "2027": { start: "2027-10-29" },
      "2028": { start: "2028-10-17" },
    },
    templates: [
      t(
        "diwali_mithai_preorder",
        "Diwali mithai pre-orders",
        "Pre-order Diwali mithai boxes at {{merchant}}",
        "Happy Diwali in advance, {{first_name}}.\n\nDiwali is expected around {{festival_date}}. Pre-order mithai boxes, barfi, ladoo, jalebi and snack trays at {{merchant}} for gifting and your family table. Boxes can be packed for corporate gifts too. Pre-orders close three days before Diwali.",
        "Diwali mithai boxes: barfi, ladoo, jalebi. Pre-order now at {{merchant}}. Closes 3 days before Diwali.",
        "Happy Diwali in advance, {{first_name}}. Pre-order mithai boxes, barfi, ladoo and snack trays at {{merchant}} for gifting. Reply MENU to order. Pre-orders close three days before Diwali.",
        "diwali_preorder",
      ),
      t(
        "diwali_greeting",
        "Diwali greeting",
        "Happy Diwali from {{merchant}}",
        "Happy Diwali, {{first_name}}. May your home be full of light and sweetness. Thank you from all of us at {{merchant}}.",
        "Happy Diwali from all of us at {{merchant}}. May your home be full of light and sweetness.",
        "Happy Diwali, {{first_name}}. May your home be full of light and sweetness. Thank you from all of us at {{merchant}}.",
        "diwali_greeting",
      ),
    ],
    sends: [
      { offsetDays: -10, templateId: "diwali_mithai_preorder", label: "Mithai box pre-orders open" },
      { offsetDays: 0, templateId: "diwali_greeting", label: "Diwali greeting" },
    ],
  },
  {
    id: "holi",
    name: "Holi",
    greeting: { en: "Happy Holi", hi: "होली की शुभकामनाएं", pa: "ਹੋਲੀ ਦੀਆਂ ਮੁਬਾਰਕਾਂ" },
    tradition: "hindu",
    approximate: true,
    dateNote: HINDU_NOTE,
    dates: {
      "2026": { start: "2026-03-04" },
      "2027": { start: "2027-03-22" },
      "2028": { start: "2028-03-12" },
    },
    templates: [
      t(
        "holi_party_trays",
        "Holi party trays",
        "Holi party trays at {{merchant}}",
        "Happy Holi in advance, {{first_name}}. Hosting friends on {{festival_date}}? {{merchant}} has gujiya, thandai, chaat and snack trays ready for pickup. Order a day ahead.",
        "Holi party trays: gujiya, thandai, chaat at {{merchant}}. Order a day ahead.",
        "Happy Holi in advance, {{first_name}}. {{merchant}} has gujiya, thandai, chaat and snack trays for your Holi party. Reply MENU to order a day ahead.",
        "holi_party_trays",
      ),
    ],
    sends: [{ offsetDays: -5, templateId: "holi_party_trays", label: "Party tray pre-orders" }],
  },
  {
    id: "vaisakhi",
    name: "Vaisakhi",
    greeting: { en: "Happy Vaisakhi", hi: "वैसाखी की बधाई", pa: "ਵੈਸਾਖੀ ਦੀਆਂ ਵਧਾਈਆਂ" },
    tradition: "sikh",
    approximate: false,
    dateNote: FIXED_NOTE,
    dates: {
      "2026": { start: "2026-04-14" },
      "2027": { start: "2027-04-14" },
      "2028": { start: "2028-04-13" },
    },
    templates: [
      t(
        "vaisakhi_nagar_kirtan",
        "Vaisakhi catering and pickup",
        "Vaisakhi catering and pickups at {{merchant}}",
        "Vaisakhi di lakh lakh vadhaiyan, {{first_name}}. {{merchant}} is taking orders for pakora, chole bhature, jalebi and langar-style trays for your family and community celebrations around {{festival_date}}. Order early for large trays.",
        "Vaisakhi di vadhai from {{merchant}}. Pakora, chole bhature and jalebi trays. Order early.",
        "Vaisakhi di lakh lakh vadhaiyan, {{first_name}}. {{merchant}} is taking orders for pakora, chole bhature, jalebi and trays for your celebrations. Reply MENU to order early.",
        "vaisakhi_trays",
      ),
    ],
    sends: [{ offsetDays: -7, templateId: "vaisakhi_nagar_kirtan", label: "Celebration tray orders" }],
  },
  {
    id: "navratri",
    name: "Navratri",
    greeting: { en: "Happy Navratri", hi: "नवरात्रि की शुभकामनाएं", pa: "ਨਰਾਤਿਆਂ ਦੀਆਂ ਮੁਬਾਰਕਾਂ" },
    tradition: "hindu",
    approximate: true,
    dateNote: HINDU_NOTE,
    dates: {
      "2026": { start: "2026-10-11", end: "2026-10-19" },
      "2027": { start: "2027-10-01", end: "2027-10-09" },
      "2028": { start: "2028-09-20", end: "2028-09-27" },
    },
    templates: [
      t(
        "navratri_vrat_menu",
        "Navratri vrat menu",
        "Navratri fasting menu at {{merchant}}",
        "Happy Navratri, {{first_name}}. From {{festival_date}} {{merchant}} serves a vrat menu with no onion or garlic: sabudana khichdi, kuttu puri, aloo sabzi and singhare ke atte ki puri. Order ahead for lunch or dinner.",
        "Navratri vrat menu (no onion or garlic) at {{merchant}}: sabudana khichdi, kuttu puri. Order ahead.",
        "Happy Navratri, {{first_name}}. {{merchant}} serves a vrat menu with no onion or garlic: sabudana khichdi, kuttu puri, aloo sabzi. Reply MENU to order ahead.",
        "navratri_vrat",
      ),
    ],
    sends: [{ offsetDays: -3, templateId: "navratri_vrat_menu", label: "Vrat menu announcement" }],
  },
  {
    id: "dussehra",
    name: "Dussehra",
    greeting: { en: "Happy Dussehra", hi: "दशहरा की शुभकामनाएं", pa: "ਦੁਸਹਿਰੇ ਦੀਆਂ ਮੁਬਾਰਕਾਂ" },
    tradition: "hindu",
    approximate: true,
    dateNote: HINDU_NOTE,
    dates: {
      "2026": { start: "2026-10-20" },
      "2027": { start: "2027-10-10" },
      "2028": { start: "2028-09-28" },
    },
    templates: [
      t(
        "dussehra_jalebi",
        "Dussehra jalebi and fafda",
        "Dussehra jalebi and fafda at {{merchant}}",
        "Happy Dussehra, {{first_name}}. Fresh jalebi, fafda and mithai boxes are ready at {{merchant}} on {{festival_date}}. Order ahead to skip the line.",
        "Happy Dussehra from {{merchant}}. Fresh jalebi, fafda and mithai boxes. Order ahead.",
        "Happy Dussehra, {{first_name}}. Fresh jalebi, fafda and mithai boxes are ready at {{merchant}}. Reply MENU to order ahead.",
        "dussehra_jalebi",
      ),
    ],
    sends: [{ offsetDays: -2, templateId: "dussehra_jalebi", label: "Jalebi and mithai pre-orders" }],
  },
  {
    id: "raksha_bandhan",
    name: "Raksha Bandhan",
    greeting: { en: "Happy Raksha Bandhan", hi: "रक्षा बंधन की शुभकामनाएं", pa: "ਰੱਖੜੀ ਦੀਆਂ ਮੁਬਾਰਕਾਂ" },
    tradition: "hindu",
    approximate: true,
    dateNote: HINDU_NOTE,
    dates: {
      "2026": { start: "2026-08-28" },
      "2027": { start: "2027-08-17" },
      "2028": { start: "2028-08-05" },
    },
    templates: [
      t(
        "rakhi_mithai",
        "Rakhi mithai boxes",
        "Rakhi mithai boxes at {{merchant}}",
        "{{first_name}}, Raksha Bandhan is expected around {{festival_date}}. Pre-order a mithai box at {{merchant}} for your brother or sister, packed and ready for pickup.",
        "Rakhi mithai boxes for your brother or sister. Pre-order at {{merchant}}.",
        "{{first_name}}, Raksha Bandhan is coming. Pre-order a mithai box at {{merchant}}, packed and ready for pickup. Reply MENU to order.",
        "rakhi_mithai",
      ),
    ],
    sends: [{ offsetDays: -7, templateId: "rakhi_mithai", label: "Mithai box pre-orders" }],
  },
  {
    id: "lohri",
    name: "Lohri",
    greeting: { en: "Happy Lohri", hi: "लोहड़ी की बधाई", pa: "ਲੋਹੜੀ ਦੀਆਂ ਵਧਾਈਆਂ" },
    tradition: "sikh",
    approximate: false,
    dateNote: FIXED_NOTE,
    dates: {
      "2026": { start: "2026-01-13" },
      "2027": { start: "2027-01-13" },
      "2028": { start: "2028-01-13" },
    },
    templates: [
      t(
        "lohri_bonfire",
        "Lohri gathering trays",
        "Lohri trays at {{merchant}}",
        "Happy Lohri, {{first_name}}. {{merchant}} has makki di roti and sarson da saag, gajak, rewri and peanut trays for your Lohri gathering on {{festival_date}}. Order ahead.",
        "Lohri trays: makki di roti, sarson da saag, gajak and rewri at {{merchant}}. Order ahead.",
        "Happy Lohri, {{first_name}}. {{merchant}} has makki di roti, sarson da saag, gajak and rewri for your Lohri gathering. Reply MENU to order ahead.",
        "lohri_trays",
      ),
    ],
    sends: [{ offsetDays: -4, templateId: "lohri_bonfire", label: "Gathering tray orders" }],
  },
  {
    id: "karva_chauth",
    name: "Karva Chauth",
    greeting: { en: "Happy Karva Chauth", hi: "करवा चौथ की शुभकामनाएं", pa: "ਕਰਵਾ ਚੌਥ ਦੀਆਂ ਮੁਬਾਰਕਾਂ" },
    tradition: "hindu",
    approximate: true,
    dateNote: HINDU_NOTE,
    dates: {
      "2026": { start: "2026-10-29" },
      "2027": { start: "2027-10-18" },
      "2028": { start: "2028-10-06" },
    },
    templates: [
      t(
        "karva_chauth_thali",
        "Karva Chauth thali",
        "Karva Chauth evening thali at {{merchant}}",
        "{{first_name}}, for Karva Chauth ({{festival_date}}) {{merchant}} is packing evening thalis with puri, sabzi, halwa and mathri for when the moon rises. Order ahead and pick up in the afternoon.",
        "Karva Chauth evening thali at {{merchant}}: puri, sabzi, halwa, mathri. Order ahead.",
        "{{first_name}}, {{merchant}} is packing Karva Chauth evening thalis with puri, sabzi, halwa and mathri. Reply MENU to order ahead.",
        "karva_chauth_thali",
      ),
    ],
    sends: [{ offsetDays: -3, templateId: "karva_chauth_thali", label: "Evening thali pre-orders" }],
  },
  {
    id: "gurpurab",
    name: "Guru Nanak Gurpurab",
    greeting: { en: "Happy Gurpurab", hi: "गुरपर्व की बधाई", pa: "ਗੁਰਪੁਰਬ ਦੀਆਂ ਲੱਖ ਲੱਖ ਵਧਾਈਆਂ" },
    tradition: "sikh",
    approximate: true,
    dateNote: SIKH_NOTE,
    dates: {
      "2026": { start: "2026-11-24" },
      "2027": { start: "2027-11-14" },
      "2028": { start: "2028-11-02" },
    },
    templates: [
      t(
        "gurpurab_greeting",
        "Gurpurab greeting and sweet trays",
        "Gurpurab wishes from {{merchant}}",
        "Gurpurab diyan lakh lakh vadhaiyan, {{first_name}}. {{merchant}} is taking orders for sweet trays and snack boxes for your gurdwara and family gatherings around {{festival_date}}. Order early for large trays.",
        "Gurpurab diyan vadhaiyan from {{merchant}}. Sweet and snack trays for gatherings. Order early.",
        "Gurpurab diyan lakh lakh vadhaiyan, {{first_name}}. {{merchant}} is taking orders for sweet and snack trays for your gatherings. Reply MENU to order early.",
        "gurpurab_trays",
      ),
    ],
    sends: [{ offsetDays: -7, templateId: "gurpurab_greeting", label: "Tray orders and greeting" }],
  },
  {
    id: "pakistan_independence",
    name: "Pakistan Independence Day",
    greeting: { en: "Happy Independence Day", ur: "یوم آزادی مبارک", hi: "पाकिस्तान स्वतंत्रता दिवस मुबारक", pa: "ਆਜ਼ਾਦੀ ਦਿਵਸ ਮੁਬਾਰਕ" },
    tradition: "national",
    approximate: false,
    dateNote: FIXED_NOTE,
    dates: { "2026": { start: "2026-08-14" }, "2027": { start: "2027-08-14" }, "2028": { start: "2028-08-14" } },
    templates: [
      t(
        "pk_independence",
        "Independence Day greeting",
        "Pakistan Independence Day at {{merchant}}",
        "Jashn-e-Azadi Mubarak, {{first_name}}. Celebrate with a family feast: {{merchant}} has biryani, nihari, kebabs and kheer ready for pickup on {{festival_date}}. Order ahead.",
        "Jashn-e-Azadi Mubarak from {{merchant}}. Biryani, nihari and kheer for your feast. Order ahead.",
        "Jashn-e-Azadi Mubarak, {{first_name}}. {{merchant}} has biryani, nihari, kebabs and kheer for your family feast. Reply MENU to order ahead.",
        "pk_independence",
      ),
    ],
    sends: [{ offsetDays: -4, templateId: "pk_independence", label: "Family feast orders" }],
  },
  {
    id: "india_independence",
    name: "India Independence Day",
    greeting: { en: "Happy Independence Day", hi: "स्वतंत्रता दिवस की शुभकामनाएं", pa: "ਆਜ਼ਾਦੀ ਦਿਵਸ ਦੀਆਂ ਵਧਾਈਆਂ", ur: "یوم آزادی مبارک" },
    tradition: "national",
    approximate: false,
    dateNote: FIXED_NOTE,
    dates: { "2026": { start: "2026-08-15" }, "2027": { start: "2027-08-15" }, "2028": { start: "2028-08-15" } },
    templates: [
      t(
        "in_independence",
        "Independence Day greeting",
        "Independence Day at {{merchant}}",
        "Happy Independence Day, {{first_name}}. Celebrate with tricolour thalis, chaat and mithai from {{merchant}} on {{festival_date}}. Order ahead for your gathering.",
        "Happy Independence Day from {{merchant}}. Thalis, chaat and mithai for your gathering. Order ahead.",
        "Happy Independence Day, {{first_name}}. {{merchant}} has thalis, chaat and mithai for your gathering. Reply MENU to order ahead.",
        "in_independence",
      ),
    ],
    sends: [{ offsetDays: -4, templateId: "in_independence", label: "Gathering orders" }],
  },
  {
    id: "bangladesh_victory",
    name: "Bangladesh Victory Day",
    greeting: { en: "Happy Victory Day", hi: "बांग्लादेश विजय दिवस", ur: "بنگلہ دیش یوم فتح", pa: "ਬੰਗਲਾਦੇਸ਼ ਵਿਜੈ ਦਿਵਸ" },
    tradition: "national",
    approximate: false,
    dateNote: FIXED_NOTE,
    dates: { "2026": { start: "2026-12-16" }, "2027": { start: "2027-12-16" }, "2028": { start: "2028-12-16" } },
    templates: [
      t(
        "bd_victory",
        "Victory Day greeting",
        "Victory Day at {{merchant}}",
        "Bijoy Dibosh er shubhechha, {{first_name}}. Gather your family for a Bengali feast: {{merchant}} has kacchi biryani, bhuna khichuri and pitha ready for pickup on {{festival_date}}. Order ahead.",
        "Victory Day wishes from {{merchant}}. Kacchi biryani, khichuri and pitha. Order ahead.",
        "Bijoy Dibosh er shubhechha, {{first_name}}. {{merchant}} has kacchi biryani, khichuri and pitha for your family. Reply MENU to order ahead.",
        "bd_victory",
      ),
    ],
    sends: [{ offsetDays: -4, templateId: "bd_victory", label: "Family feast orders" }],
  },
];

export const FESTIVAL_YEARS = [2026, 2027, 2028] as const;

export function getFestival(id: string): FestivalDef | undefined {
  return FESTIVALS.find((f) => f.id === id);
}

export interface FestivalSendDate {
  date: string;
  offsetDays: number;
  templateId: string;
  label: string;
  /** Last date when the send repeats (inclusive). */
  repeatUntil?: string;
  repeatEveryDays?: number;
}

export interface FestivalOccurrence {
  festivalId: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string | null;
  tradition: FestivalTradition;
  approximate: boolean;
  dateNote: string;
  greeting: FestivalDef["greeting"];
  /** Whole days from `from` to the start date (negative once started). */
  daysUntil: number;
  sends: FestivalSendDate[];
}

const DAY_MS = 86_400_000;
const parseDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const addDays = (d: string, n: number): string => new Date(parseDay(d) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => Math.round((parseDay(to) - parseDay(from)) / DAY_MS);

export function sendDates(f: FestivalDef, start: string): FestivalSendDate[] {
  return f.sends.map((s) => ({
    date: addDays(start, s.offsetDays),
    offsetDays: s.offsetDays,
    templateId: s.templateId,
    label: s.label,
    ...(s.repeat ? { repeatEveryDays: s.repeat.everyDays, repeatUntil: addDays(start, s.repeat.untilOffsetDays) } : {}),
  }));
}

/**
 * Festivals that are under way on `from`, start in [from, to] (YYYY-MM-DD, inclusive), or have a
 * recommended send in that window. Sorted by start date.
 */
export function festivalOccurrences(from: string, to: string): FestivalOccurrence[] {
  const out: FestivalOccurrence[] = [];
  for (const f of FESTIVALS) {
    for (const [year, d] of Object.entries(f.dates)) {
      const end = d.end ?? d.start;
      const sends = sendDates(f, d.start);
      const underway = d.start <= from && end >= from;
      const startsInWindow = d.start >= from && d.start <= to;
      const sendInWindow = sends.some((s) => s.date <= to && (s.repeatUntil ?? s.date) >= from);
      if (!(underway || startsInWindow || sendInWindow)) continue;
      out.push({
        festivalId: f.id,
        name: f.name,
        year: Number(year),
        startDate: d.start,
        endDate: d.end ?? null,
        tradition: f.tradition,
        approximate: f.approximate,
        dateNote: f.dateNote,
        greeting: f.greeting,
        daysUntil: daysBetween(from, d.start),
        sends,
      });
    }
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.festivalId.localeCompare(b.festivalId));
}

/** Readable date, e.g. "Sunday, November 8" (en-CA, UTC so the calendar day never shifts). */
export function formatFestivalDate(date: string): string {
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(parseDay(date)));
}
