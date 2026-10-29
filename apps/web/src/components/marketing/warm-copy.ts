/**
 * English copy added by the Main Street Warm rebuild of the marketing site. Every claim here is on docs/business/pricing.md:
 * the loyalty program, the wallet pass, the customer directory and basic reports are free forever; texts to customers and campaigns are paid.
 */
export const WARM = {
  heroCaption: "Sample shop, sample numbers. Your own shop fills in as you stamp.",
  madeFor: "Made for",
  seeDemo: "Book a visit",
  showcase: {
    eyebrow: "What you get",
    title: "a dashboard that talks like a person.",
    sub: "Real screens from the app, not mock-ups.",
    rows: [
      {
        id: "today",
        tone: "peach",
        shot: { src: "/brand/screens/today-cafe.webp", w: 1500, h: 870, alt: "Today screen for a café: 21 visits so far, busier than a usual Wednesday, 24 stamps given, 2 rewards redeemed, 3 new members, and a Needs you list." },
        title: "Your day, at a glance",
        body: "Today against a usual day, and what needs you.",
        points: ["Who has a reward waiting", "Regulars who have gone quiet", "Basic reports, free forever"],
      },
      {
        id: "counter",
        tone: "mint",
        shot: { src: "/brand/screens/counter-cafe.webp", w: 1500, h: 708, alt: "The counter screen: a keypad for the last four digits of a phone number, regulars to tap, and a Recent at the counter list with an Undo on each line." },
        title: "A counter built for a queue",
        body: "Scan the card or type four digits. Every stamp can be undone.",
        points: ["Any tablet or phone", "Unlimited staff and locations, free", "Who, when and what, every line"],
      },
      {
        id: "pass",
        tone: "lilac",
        phones: [
          { src: "/brand/screens/pass-barber.webp", w: 720, h: 1043, alt: "A customer's card at a barbershop, in oxblood and navy, with eight scissor stamps filled and a Show my code button." },
          { src: "/brand/screens/pass-studio.webp", w: 720, h: 1043, alt: "A customer's card at a yoga studio, in green, with 40 of 100 points and a Show my code button." },
        ],
        title: "A card in their phone",
        body: "Apple Wallet, Google Wallet or the web card. No app.",
        points: ["Stamps and points never expire", "Free for customers and for you", "One card, every shop on the street"],
      },
      {
        id: "reports",
        tone: "butter",
        shot: { src: "/brand/screens/reports-cafe.webp", w: 1500, h: 882, alt: "Reports screen: visits, new members, free drinks given, a visits heat map by weekday and hour, and rewards owed right now." },
        title: "Reports you can read",
        body: "Plain numbers: visits, new members, rewards owed.",
        points: ["This week against last week", "The busy hours", "What rewards you owe"],
      },
    ],
  },
  trades: {
    eyebrow: "One look, your colour",
    title: "every trade gets its own colour.",
    body: "Your dashboard and your customers’ card wear your trade’s colour.",
    shots: [
      { src: "/brand/screens/today-restaurant.webp", w: 1600, h: 1000, alt: "Today screen for a restaurant, in saffron and chilli: 12 visits so far, 1,580 points given, 4 rewards redeemed.", label: "Restaurant" },
      { src: "/brand/screens/today-salon.webp", w: 1600, h: 1000, alt: "Today screen for a hair salon, in rose: 15 appointments, 26 visits, 2 new members, and a list of clients arriving.", label: "Salon" },
    ],
  },
  cta: {
    title: "your regulars are already on your street.",
    sub: "About 5 minutes. Free forever, no fee on loyalty.",
    primary: "Get started free",
  },
} as const;
