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
    sub: "Open it and it tells you how today compares with a usual day, who is waiting on a reward and which regulars have gone quiet. These are screens from the app, not mock-ups.",
    rows: [
      {
        id: "today",
        tone: "peach",
        shot: { src: "/brand/screens/today-cafe.webp", w: 1500, h: 870, alt: "Today screen for a café: 21 visits so far, busier than a usual Wednesday, 24 stamps given, 2 rewards redeemed, 3 new members, and a Needs you list." },
        title: "Your day, at a glance",
        body: "Visits, stamps given, rewards redeemed and new members, with a line that says how today compares with a usual day. Anything that needs you sits right under it.",
        points: ["See who has a reward waiting", "Spot regulars who have gone quiet", "Basic reports are free forever"],
      },
      {
        id: "counter",
        tone: "mint",
        shot: { src: "/brand/screens/counter-cafe.webp", w: 1500, h: 708, alt: "The counter screen: a keypad for the last four digits of a phone number, regulars to tap, and a Recent at the counter list with an Undo on each line." },
        title: "A counter built for a queue",
        body: "Scan the card or type the last four digits of a phone number. Regulars who have not been in yet today are one tap away, and every stamp can be undone.",
        points: ["Runs in a browser on any tablet or phone", "Unlimited staff and locations, free", "Each line shows who, when and what"],
      },
      {
        id: "pass",
        tone: "lilac",
        phones: [
          { src: "/brand/screens/pass-barber.webp", w: 720, h: 1043, alt: "A customer's card at a barbershop, in oxblood and navy, with eight scissor stamps filled and a Show my code button." },
          { src: "/brand/screens/pass-studio.webp", w: 720, h: 1043, alt: "A customer's card at a yoga studio, in green, with 40 of 100 points and a Show my code button." },
        ],
        title: "A card in their phone",
        body: "Customers add the pass to Apple Wallet or Google Wallet, or keep the web card. There is no app to download, and the card wears your trade’s colour.",
        points: ["Stamps and points never expire", "Free for customers and for you", "One card works at every shop on the street"],
      },
      {
        id: "reports",
        tone: "butter",
        shot: { src: "/brand/screens/reports-cafe.webp", w: 1500, h: 882, alt: "Reports screen: visits, new members, free drinks given, a visits heat map by weekday and hour, and rewards owed right now." },
        title: "Reports you can read",
        body: "Visits, new members, free drinks given and what you owe in rewards, shown in plain numbers. The basic reports on your loyalty program are free forever.",
        points: ["Compare this week with earlier weeks", "See the busy hours", "Know what rewards you owe"],
      },
    ],
  },
  trades: {
    eyebrow: "One look, your colour",
    title: "every trade gets its own colour.",
    body: "Your dashboard and your customers’ card wear your trade’s colour. The layout stays the same, so staff who move between shops always know where things are.",
    shots: [
      { src: "/brand/screens/today-restaurant.webp", w: 1600, h: 1000, alt: "Today screen for a restaurant, in saffron and chilli: 12 visits so far, 1,580 points given, 4 rewards redeemed.", label: "Restaurant" },
      { src: "/brand/screens/today-salon.webp", w: 1600, h: 1000, alt: "Today screen for a hair salon, in rose: 15 appointments, 26 visits, 2 new members, and a list of clients arriving.", label: "Salon" },
    ],
  },
  cta: {
    title: "your regulars are already on your street.",
    sub: "Set up in about 5 minutes. Free forever for your loyalty program, with no fee on loyalty.",
    primary: "Get started free",
  },
} as const;
