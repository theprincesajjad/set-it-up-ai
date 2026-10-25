/**
 * Menu tabs for the corridor restaurants (the desi-restaurants Figma frame 11): each shop's dishes sorted into
 * realistic categories, in tab order, with names in [hi, ur, pa]. Dishes are matched by name so the item
 * order and ids in restaurants.ts stay as they are. Pre-order pots always land in the Degh tab on the menu page.
 */
type Tr = [string, string, string];
export interface SeedCategory {
  name: string;
  tr: Tr;
  dishes: string[];
}

const T = {
  biryani: ["बिरयानी", "بریانی", "ਬਿਰਯਾਨੀ"] as Tr,
  biryaniRice: ["बिरयानी और चावल", "بریانی اور چاول", "ਬਿਰਯਾਨੀ ਤੇ ਚੌਲ"] as Tr,
  curries: ["करी", "سالن", "ਕਰੀ"] as Tr,
  karahi: ["करी और कड़ाही", "کڑاہی اور سالن", "ਕੜਾਹੀ ਤੇ ਕਰੀ"] as Tr,
  tandoor: ["तंदूर", "تندور", "ਤੰਦੂਰ"] as Tr,
  tandoorGrill: ["तंदूर और ग्रिल", "تندور اور گرل", "ਤੰਦੂਰ ਤੇ ਗ੍ਰਿਲ"] as Tr,
  breads: ["रोटियाँ", "روٹیاں", "ਰੋਟੀਆਂ"] as Tr,
  sides: ["साइड और रायता", "سائیڈز اور رائتہ", "ਸਾਈਡ ਤੇ ਰਾਇਤਾ"] as Tr,
  sweetsChai: ["मिठाई और चाय", "میٹھا اور چائے", "ਮਿੱਠਾ ਤੇ ਚਾਹ"] as Tr,
  desserts: ["मीठा", "میٹھا", "ਮਿੱਠਾ"] as Tr,
  drinks: ["पेय", "مشروبات", "ਪੀਣ ਵਾਲੇ ਪਦਾਰਥ"] as Tr,
  pots: ["प्री-ऑर्डर देग", "پیشگی آرڈر دیگ", "ਪ੍ਰੀ-ਆਰਡਰ ਦੇਗ"] as Tr,
  thalis: ["थाली", "تھالی", "ਥਾਲੀ"] as Tr,
  farsan: ["नाश्ता और फरसाण", "ناشتہ اور فرسان", "ਨਾਸ਼ਤਾ ਤੇ ਫਰਸਾਣ"] as Tr,
  snacks: ["नाश्ता", "ناشتہ", "ਨਾਸ਼ਤਾ"] as Tr,
  chaat: ["चाट और नाश्ता", "چاٹ اور ناشتہ", "ਚਾਟ ਤੇ ਨਾਸ਼ਤਾ"] as Tr,
  mains: ["मुख्य व्यंजन", "مین ڈشز", "ਮੁੱਖ ਪਕਵਾਨ"] as Tr,
  kottu: ["कोट्टू रोटी", "کوتّو روٹی", "ਕੋੱਟੂ ਰੋਟੀ"] as Tr,
  hoppers: ["हॉपर्स और भात", "ہاپرز اور چاول", "ਹੌਪਰਜ਼ ਤੇ ਚੌਲ"] as Tr,
  dumplings: ["डम्पलिंग्स", "ڈمپلنگز", "ਡੰਪਲਿੰਗ"] as Tr,
  mithai: ["मिठाई", "مٹھائی", "ਮਿਠਾਈ"] as Tr,
  festival: ["त्योहार बॉक्स", "تہوار باکس", "ਤਿਉਹਾਰ ਡੱਬੇ"] as Tr,
  packages: ["कैटरिंग पैकेज", "کیٹرنگ پیکجز", "ਕੈਟਰਿੰਗ ਪੈਕੇਜ"] as Tr,
};

export const MENU_CATEGORIES: Record<string, SeedCategory[]> = {
  "nawab-biryani-house": [
    { name: "Biryani", tr: T.biryani, dishes: ["Hyderabadi Chicken Dum Biryani", "Hyderabadi Goat Dum Biryani", "Vegetable Dum Biryani"] },
    { name: "Curries", tr: T.curries, dishes: ["Mirchi ka Salan", "Bagara Baingan", "Haleem", "Nihari", "Butter Chicken"] },
    { name: "Tandoor", tr: T.tandoor, dishes: ["Chicken Tikka", "Seekh Kebab", "Tandoori Chicken (half)"] },
    { name: "Breads", tr: T.breads, dishes: ["Garlic Naan"] },
    { name: "Sweets & chai", tr: T.sweetsChai, dishes: ["Double ka Meetha", "Qubani ka Meetha", "Irani Chai"] },
    { name: "Pre-order pots", tr: T.pots, dishes: ["Chicken Biryani Degh", "Goat Biryani Degh", "Vegetable Biryani Degh"] },
  ],
  "lahori-karahi-and-bbq": [
    { name: "Karahi & curries", tr: T.karahi, dishes: ["Chicken Karahi (serves 2 to 3)", "Mutton Karahi (serves 2 to 3)", "Beef Nihari", "Siri Paye"] },
    { name: "Tandoor & grill", tr: T.tandoorGrill, dishes: ["Chapli Kebab", "Seekh Kebab Platter", "Chicken Tikka Boti (8 pc)", "Lahori Fried Fish"] },
    { name: "Breads", tr: T.breads, dishes: ["Tandoori Naan"] },
    { name: "Drinks", tr: T.drinks, dishes: ["Sweet Lassi"] },
    { name: "Desserts", tr: T.desserts, dishes: ["Falooda", "Gajar ka Halwa"] },
    { name: "Pre-order pots", tr: T.pots, dishes: ["Chicken Karahi Degh (serves 20)", "Mutton Pulao Degh (serves 20)", "Zarda Degh (serves 20)", "BBQ Tray: Seekh, Boti and Chapli (serves 12)"] },
  ],
  "shree-thali-and-tiffin": [
    { name: "Thalis", tr: T.thalis, dishes: ["Gujarati Thali (lunch)", "Jain Thali (lunch)", "Undhiyu with Puri", "Khichdi Kadhi", "Dal Dhokli", "Trial Tiffin: Single Lunch"] },
    { name: "Snacks & farsan", tr: T.farsan, dishes: ["Khaman Dhokla", "Methi Thepla (4 pc) with Chhundo", "Fafda Jalebi", "Sev Khamani"] },
    { name: "Drinks", tr: T.drinks, dishes: ["Masala Chaas"] },
    { name: "Desserts", tr: T.desserts, dishes: ["Shrikhand (cup)"] },
  ],
  "sarson-dhaba": [
    { name: "Curries", tr: T.curries, dishes: ["Sarson da Saag and Makki di Roti", "Dal Makhani", "Butter Chicken", "Rajma Chawal", "Baingan Bharta"] },
    { name: "Tandoor", tr: T.tandoor, dishes: ["Paneer Tikka"] },
    { name: "Breads", tr: T.breads, dishes: ["Chole Bhature", "Amritsari Kulcha", "Aloo Paratha with Dahi", "Tandoori Roti"] },
    { name: "Drinks", tr: T.drinks, dishes: ["Sweet Lassi", "Masala Chai"] },
    { name: "Desserts", tr: T.desserts, dishes: ["Gulab Jamun (2 pc)"] },
  ],
  "meethi-mithai-and-chai": [
    { name: "Mithai", tr: T.mithai, dishes: ["Kaju Katli (1 lb)", "Motichoor Laddu (1 lb)", "Gulab Jamun (6 pc)", "Rasmalai (4 pc)", "Fresh Jalebi (1 lb)"] },
    { name: "Snacks", tr: T.snacks, dishes: ["Samosa (6 pc) with Chutney", "Kachori (4 pc)"] },
    { name: "Chai & drinks", tr: T.drinks, dishes: ["Kadak Chai", "Masala Chai (large)", "Badam Milk"] },
    { name: "Festival boxes", tr: T.festival, dishes: ["Diwali Mithai Box (1 kg assorted)", "Diwali Dry Fruit Hamper", "Eid Sheer Khurma Tray (serves 10)", "Eid Mithai Box (1 kg)"] },
  ],
  "padma-bangladeshi-kitchen": [
    { name: "Biryani & rice", tr: T.biryaniRice, dishes: ["Kacchi Biryani", "Bhuna Khichuri"] },
    { name: "Curries", tr: T.curries, dishes: ["Ilish Bhuna", "Beef Bhuna", "Chingri Malai Curry"] },
    { name: "Sides & raita", tr: T.sides, dishes: ["Aloo Bhorta", "Begun Bhaja"] },
    { name: "Chaat & snacks", tr: T.chaat, dishes: ["Fuchka (8 pc)", "Chotpoti"] },
    { name: "Desserts", tr: T.desserts, dishes: ["Mishti Doi"] },
    { name: "Drinks", tr: T.drinks, dishes: ["Borhani"] },
  ],
  "jaffna-kottu-house": [
    { name: "Kottu roti", tr: T.kottu, dishes: ["Chicken Kottu Roti", "Vegetable Kottu Roti", "Egg Kottu Roti", "Cheese Kottu Roti"] },
    { name: "Mains", tr: T.mains, dishes: ["Jaffna Crab Curry", "Lamprais"] },
    { name: "Hoppers & rice", tr: T.hoppers, dishes: ["Egg Hoppers (2 pc)", "String Hoppers with Sothi"] },
    { name: "Snacks", tr: T.snacks, dishes: ["Mutton Rolls (3 pc)", "Vadai (3 pc)"] },
    { name: "Desserts", tr: T.desserts, dishes: ["Wattalapam"] },
    { name: "Drinks", tr: T.drinks, dishes: ["Ginger Beer"] },
  ],
  "kabul-garden-grill": [
    { name: "Biryani & rice", tr: T.biryaniRice, dishes: ["Kabuli Pulao with Lamb"] },
    { name: "Tandoor & grill", tr: T.tandoorGrill, dishes: ["Chicken Kabob Platter", "Lamb Chops (Chopan)"] },
    { name: "Dumplings", tr: T.dumplings, dishes: ["Mantu (8 pc)", "Aushak"] },
    { name: "Curries", tr: T.curries, dishes: ["Borani Banjan", "Shorwa"] },
    { name: "Breads", tr: T.breads, dishes: ["Bolani", "Naan-e-Afghani"] },
    { name: "Desserts", tr: T.desserts, dishes: ["Firni"] },
    { name: "Drinks", tr: T.drinks, dishes: ["Doogh", "Afghan Green Tea"] },
  ],
  "zeenat-catering": [
    { name: "Catering packages", tr: T.packages, dishes: ["Walima Dinner Package (per guest)", "Mehndi Night Package (per guest)", "Aqiqah Package (goat for 40)", "Eid Lunch Tray: Biryani and Korma (serves 10)", "Corporate Lunch Box"] },
  ],
};
