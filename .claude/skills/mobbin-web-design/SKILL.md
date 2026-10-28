---
name: mobbin-web-design
description: "Design and implement websites and web apps from Mobbin references (motion, flow, look, language, fonts, psychology). Requires mobbin-web-usage research first, or load after mobbin-design routes to web. For native mobile use appllama-app-design-skill instead."
license: MIT
metadata:
  author: customized from Appllama for Mobbin web
  version: "1.0.0"
  routed_by: mobbin-design@1.0.0
  requires:
    - mobbin-web-usage@1.0.0
  pairs_with:
    - mobbin-web-usage@1.0.0
  mobile_counterpart:
    - appllama-app-design-skill@1.4.1
    - appllama-usage@2.1.1
  mcp: "https://api.mobbin.com/mcp"
---

# Mobbin Web Design Skill

You are building web surfaces that will be compared — within seconds — to the best
sites and web apps in the Mobbin library. This skill is the **build layer**.
The **research layer** is **`mobbin-web-usage@1.0.0`**.

## Hard gate: call the usage skill first

**Before writing UI**, you MUST:

1. Load and follow **`mobbin-web-usage@1.0.0`** (search, analyze, shortlist).
2. Hold a shortlist of cited Mobbin `mobbin_url`s and a `patterns.md` (layout,
   type, color, motion cues, language, psychology).
3. Only then implement.

If Mobbin MCP is connected and you skip research, you are violating this skill.
If research already exists in-thread from `mobbin-web-usage`, reuse it — do not
re-burn Deep Search credits without need.

```
mobbin-web-usage@1.0.0  →  shortlist + patterns.md  →  mobbin-web-design@1.0.0
```

Mobile-native work still belongs to `appllama-app-design-skill` + `appllama-usage`.
This skill is **web only** (`platform: "web"` + Sites sections).

---

## Default stack (override only if the repo already differs)

- **Next.js + TypeScript + Tailwind CSS**
- **shadcn/ui** for primitives (Button, Input, Dialog, Sheet, …) — do not hand-roll
- Motion: CSS + View Transitions / small focused libraries already in the repo;
  prefer CSS scroll-driven and `transform`/`opacity` over layout thrash
- Fonts: expressive, purposeful families via `next/font` (or project equivalent) —
  **never** default to Inter / Roboto / Arial / system UI as the brand voice
  unless Mobbin references for *this* category clearly converge there **and**
  the brand asks for neutrality

---

## The Prime Directive: pattern, not pixels

From Mobbin previews, extract:

| Extract | Build |
|---|---|
| Layout skeleton | Your grid / sections |
| Hierarchy | Your type ramp + spacing |
| CTA grammar | Your buttons & verbs |
| Proof devices | Your logos/stats/quotes (real or honest placeholders) |
| Psychology | Your trial, trust, anchoring — adapted to your offer |
| Motion cues | Your purposeful animation plan |

Never copy trademarks, proprietary illustrations, or 1:1 brand chrome.
Same proven skeleton; **your** product voice.

---

## 1. Look (visual system)

Lock these from `patterns.md` before components proliferate:

1. **One composition per first viewport** on marketing pages — not a dashboard
   of widgets. Brand must be a hero-level signal.
2. **One accent.** Neutrals carry the UI; accent spends on primary money actions
   and active states only.
3. **One grey family** — warm *or* cool, never both.
4. **Shape lock.** State a radius scale (“buttons 999 / cards 16 / inputs 8”)
   and never freelance.
5. **Elevation system.** Prefer borders + subtle surfaces over multi-layer glow
   shadows. Shadows encode depth, not decoration.
6. **Atmosphere.** Marketing pages need a real visual plane (product, place,
   photography, purposeful pattern) — not a flat fill pretending to be a brand.
7. **Anti-slop (default bans):** purple-on-white / purple→indigo CTA glow;
   cream+#terracotta+#serif starter kits; broadsheet hairline-newspaper layouts;
   glassmorphism everywhere; emoji as chrome; mesh-gradient hero clichés —
   unless Mobbin refs *and* the brand explicitly demand that direction.
8. **Cards are for interaction**, not decoration. No card theater in heroes.
9. **Full-bleed heroes** on promotional surfaces by default — not inset media
   cards — unless the reference system clearly uses inset and the brand matches.
10. **Responsive:** the desktop Mobbin capture is the source of truth for
    hierarchy; redesign the *arrangement* for mobile — do not merely shrink.

### Desktop vs mobile reading of Mobbin web captures

Mobbin web captures are wide. When implementing:

- Preserve **order of meaning** (brand → promise → proof → ask)
- Collapse multi-column heroes to stacked on small screens without losing CTA
- Sidebars become top drawers / bottom nav only when category refs show that
  pattern for similar products — don’t invent a mobile shell aliens wouldn’t
  recognize

---

## 2. Fonts & typography

Typography is hierarchy and brand voice. Derive from references:

1. **Pair with intent.** Display (expressive) + text (readable). Do not inject a
   serif word into a sans headline “for interest.”
2. **One display size per viewport section.** Page title ≠ section title ≠ meta.
3. **Optical sizes / weights from the refs.** If winners use tight tracking on
   huge heroes, note it; if they use soft book faces for long FAQ, follow.
4. **Tabular numerals** for prices, metrics, timers.
5. **Measure.** Marketing body ~45–75ch; app UI labels stay short.
6. **Lock CTA capitalization and verbs** to the language system (below).
7. Load fonts with `next/font` (or equivalent) to avoid FOUT layout shift;
   subset aggressively.

**Font picking protocol (from Mobbin stills):**

1. Classify display: geometric sans / humanist sans / grotesque / neo-grotesque /
   transitional serif / didone / slab / mono.
2. Classify text: same family scaled, or a quieter companion.
3. Match **mood words** from refs (editorial, clinical, playful, industrial)
   to a real family available via Google Fonts / Fontshare / licensed files —
   not to “Inter because default.”
4. Write the pair into CSS variables: `--font-display`, `--font-text`,
   `--font-mono` (optional).

---

## 3. Language (copy system)

Mobbin sections teach **what winners say**, not only how they look.

1. **One job per section** → one headline, one support sentence.
2. **Headline formulas observed in Sites:** outcome (“Manage operations like a
   boss”), specificity (“See where your e-commerce revenue is really coming
   from”), speed (“Get up and running in seconds”). Pick one formula per page.
3. **Support lines** remove a fear or name the mechanism — not repeat the headline.
4. **CTA verbs locked.** One primary verb for the main ask site-wide
   (“Start for free” *or* “Get started” — not both). Secondary asks stay quieter
   (“Book demo”, “Contact sales”).
5. **Microcopy is product.** Trial length, “No credit card”, secure-payment
   lines, included add-ons — steal the *structure* from checkout flows, write
   your facts.
6. **No lorem.** No “Welcome to your app.” Real product language only.
7. **Empty / error / loading** copy is part of the language system — design it.

---

## 4. Flow (IA & navigation)

### Marketing sites

- Scroll is the primary navigation; sticky nav re-asks without trapping.
- Section order follows belief: Promise → Proof → Mechanism → Offer → Objections → Re-ask.
- Deep links to Pricing / Docs / Login match reference chrome.

### Web apps

From Mobbin web flows/screens:

1. **Shell first.** Sidebar vs top-nav vs dual-nav — copy category grammar.
2. **Push vs modal vs drawer.** Settings hubs are pages; quick filters are
   drawers; destructive confirms are dialogs; billing checkout is often a
   focused full page with sticky summary — verify in `search_flows`.
3. **One-way doors.** Post-purchase and finished onboarding must not Back into
   the old unpaid/unboarded state.
4. **Primary create** is always findable (top-right, sidebar, empty state).
5. **Browser back** undoes navigation, never events (a submitted payment stays
   submitted).
6. **Study the filmstrip.** When walking a Mobbin web flow, note step count,
   where money anxiety is soothed, and where friction is deliberate.

---

## 5. Animations & motion

Motion is presence and hierarchy — not noise. Ship **2–3 intentional motions**
on visually led marketing work; keep product chrome quieter.

### Frequency gate (same spirit as mobile skill)

| Frequency | Motion |
|---|---|
| Continuous (scroll, hover on dense tables) | Platform/CSS defaults; no custom flair |
| Frequent (button press, row select, tab) | ≤150ms opacity/background; no large movement |
| Occasional (nav mega-menu, sheet, dialog) | 150–300ms ease-out; exits faster |
| Rare (first hero reveal, success moment) | Delight allowed — once, purposeful |

### Web-specific laws

1. **Name the purpose** — feedback, continuity, state change, explain, delight —
   or delete it.
2. **Animate `transform` / `opacity`**, not width/height/top for primary motion.
3. **Hero:** prefer one orchestrated entrance (headline → support → CTA → visual)
   over five competing fades.
4. **Scroll:** use scroll-driven reveals sparingly; respect
   `prefers-reduced-motion: reduce` (collapse to instant/crossfade).
5. **Page transitions** stay subtle; do not hijack the scrollbar.
6. **Gesture continuity on drag surfaces** (sheets, drawers): spring with
   release velocity when you use a motion library; otherwise keep CSS simple.
7. **Never** decorative infinite loops next to form fields or prices.
8. Derive cues from Mobbin stills: play buttons ⇒ light video motion; carousels
   ⇒ controlled horizontal shift; sticky CTAs ⇒ no bounce, only pin.

Details: [references/motion-web.md](references/motion-web.md).

---

## 6. Psychology (from real refs)

Encode devices you **observed** in Mobbin flows/sections — adapted to truthful
product facts:

| Device | Where you see it | How to use |
|---|---|---|
| **Outcome-first headline** | Heroes | Lead with user result, not feature inventory |
| **Friction labels** | Hero CTAs | “Free forever. No credit card.” next to ask |
| **Social proof adjacency** | Under hero / near CTA | Logos or counts beside the ask, not a separate vanity strip that steals the first viewport unless refs demand it |
| **Anchoring** | Pricing & checkout | Struck price + clear now price; explain why |
| **$0 due today** | Trial checkout | Make “charged today” the loudest honest number |
| **Inclusion list** | Billing | “INCLUDED” add-ons reinforce value mid-trial |
| **Trust band** | Payment step | Secure processing line + card brand marks |
| **Progressive disclosure** | Sidebars | Locks / Upgrade badges beat hiding features entirely |
| **Urgency with honesty** | Trial banners | Days left — never fake scarcity |
| **Error as help** | Forms | Inline, specific, keep field values |

Do not invent dark patterns Mobbin winners do not use in that category.

---

## 7. State architecture (web)

- **Server state:** TanStack Query or framework fetch cache — not ad-hoc
  `useEffect` + `fetch` spinners everywhere.
- **URL as state** for filters, tabs, deep-linkable views (Mobbin web apps
  almost always make location recoverable).
- **Optimistic UI** on reversible actions; loud rollback on failure.
- **Forms:** progressive disclosure; inline validation; disabled primary until
  required fields valid (as in checkout refs).
- Ship **empty / loading / error / success** for every primary view.

---

## 8. The browser loop (non-negotiable)

A page does not exist until you have seen it running in a real browser.

1. Implement → run the dev server.
2. Screenshot **desktop and mobile** widths; actually look.
3. Screen-record critical journeys (checkout, signup, nav).
4. Compare against your Mobbin shortlist side by side.
5. Fix → repeat until you cannot find a flaw.

Checklist: [references/browser-loop.md](references/browser-loop.md).

Do not declare done from code review alone.

---

## Definition of done (per page / route)

- [ ] `mobbin-web-usage` research done; 8+ cited refs; `patterns.md` exists
- [ ] Pattern named (skeleton), not pixels copied
- [ ] Fonts locked (display + text); not generic AI defaults
- [ ] Language locked (headline formula, CTA verbs, microcopy)
- [ ] Look locked (accent, greys, radii, elevation, atmosphere)
- [ ] Flow/IA answered (section order or app shell + back behavior)
- [ ] Motion: 2–3 purposeful motions on marketing; chrome quiet; reduced-motion OK
- [ ] Psychology devices adapted truthfully from refs
- [ ] Empty / loading / error designed
- [ ] Desktop + mobile verified in browser; flow recorded if multi-step
- [ ] Accessibility: focus states, contrast, semantic headings, tap targets

---

## References

| File | Load when |
|---|---|
| [references/motion-web.md](references/motion-web.md) | Hero motion, scroll, dialogs, reduced motion |
| [references/typography-and-language.md](references/typography-and-language.md) | Font pairing, copy formulas, CTA systems |
| [references/psychology-and-flow.md](references/psychology-and-flow.md) | Pricing/checkout/hero belief design |
| [references/browser-loop.md](references/browser-loop.md) | Final verification |

Related research skill: **`mobbin-web-usage@1.0.0`**.
Related mobile pair (unchanged): `appllama-usage` + `appllama-app-design-skill`.
