# Playbook: build an app from scratch (Mobbin MCP)

The user says "build me a habit tracker" (or any category). This is the full
loop. Do not stop early: the goal is a finished app where every screen is
verified better-than-reference in the simulator — not a scaffold.

## Phase 1 — Find the winners on Mobbin

1. First check `list_collections()` — if the user already saved a Mobbin
   collection for this category or project, pull it with
   `get_collection_contents()` and treat those apps/screens as primary seeds.
2. Translate the user's need and priorities into 2–3 `search_flows` queries
   (0 credits; e.g. `"habit tracker onboarding"`, `"habit tracker daily check-in"`,
   `"habit tracker paywall"`) and 1–2 `search_screens` queries with
   `platform: "ios"`, `mode: "standard"`, `limit: 20` (0 credits; e.g.
   `"habit tracker home screen with streak and daily completion"`).
3. From the returned flows and screens, shortlist the **top 5 production apps**
   (`app_name` + `mobbin_url`) that appear across the strongest flows and fit
   the user's brief.
4. Record the shortlist, their `mobbin_url` links, and their core flows in
   `research/<category>/apps.md`. Optionally call `create_collection` to
   create a Mobbin collection for this build and `save_content` as you go.

## Phase 2 — Study the flows and screens of the top 5

For each shortlisted app, walk its key flows and screens using Mobbin MCP:
- Call `search_flows` with `"<App Name> onboarding"`, `"<App Name> paywall"`,
  and `"<App Name> <core feature>"` (0 credits) to see its multi-step journeys
  in sequence.
- Call `search_screens(query="<App Name> <screen or flow>", platform="ios", mode="standard", limit=20)`
  (0 credits; pass `exclude_screen_ids` if you need additional pages) and look
  at every inline preview and `image.url`.
- Build `research/<category>/<app-name>/screens.md`: screen `id`, `mobbin_url`,
  flow/context, notable UI elements, palette — and download key high-res
  screens from `image.url` into `img/` so you can read the journey side by side.

You are extracting the **category's design language**, so read across apps,
not just within one:

- What does the first-open moment look like in this category?
- How long is onboarding, and what does each step *earn* (permission,
  personalization data, commitment)?
- Where does the paywall sit, and what's on it (trial framing, price
  anchoring, feature grid, social proof)?
- What's the home-screen information hierarchy? What's one tap away?
- What do empty states, streaks/progress, and notifications look like?

Write the synthesis into `patterns.md`: the psychology of the category —
what every winner does (table stakes), what only the best do (edge), and
what all of them do badly (your opening).

## Phase 3 — Frame-by-frame on the top 3

Pick the 3 strongest apps and re-walk their decisive flows screen by screen
using `search_flows` and `search_screens` with `image_quality: "high"` (and
`mode: "deep"` on pivotal screen types to surface the strongest visual/intent
matches across Mobbin's entire catalog). Save the winning references with
`save_content` and annotate why each works with `add_comment`. For each screen
answer: what is its ONE job, what makes it work, what would you change. This is
where you stop being a catalog and start being a design director.

## Phase 4 — Design the feature set

From `patterns.md`, write the app's spec: the best features across all
studied apps, minus the bloat, plus the opening you found. Screen list with
flows, in journey order — and the **navigation map**: for every screen, what
it *is* (push, modal with its own stack, form sheet, full-screen modal,
overlay, tab root) and what back does from it, including the one-way doors
(sign-in, onboarding done, purchase, finished session) where back must not
re-enter the old state. The grammar comes from appllama-app-design-skill's
Navigation laws; the evidence comes from the flows you walked —
note whether each winner presents its composer as a modal, its filters as a
sheet, its detail as a push, and copy that consistency. Get user sign-off on
the spec if they're present; otherwise state your choices and proceed.

## Phase 5 — Build screen by screen

For EVERY screen, in journey order:

1. Re-open your references for that screen type (your local board and Mobbin
   collection first; `search_screens` for gaps — run `mode: "standard"` first
   for 0-credit pattern matches, and `mode: "deep"` when you need nuanced
   visual/intent matches).
2. Build it following **appllama-app-design-skill** end to end (HIG fidelity,
   semantic colors, native controls, motion laws, state architecture).
3. Generate image assets with the best image model available (imagegen /
   Higgsfield MCP or CLI / whatever is present) at the highest quality — one
   style system for the whole app, per appllama-app-design-skill's
   references/image-assets.md.
4. **Simulator loop until flawless**: run on the iOS Simulator (or Android
   emulator), screenshot, actually look, exercise the motion frame by frame,
   check the Dynamic Island / safe areas / dark mode / Dynamic Type, fix,
   repeat. The checklist lives in appllama-app-design-skill's
   references/simulator-loop.md. A screen isn't done because it compiles —
   it's done when you can't find a flaw and it stands next to the top-3
   references without embarrassment.
5. State management stays boring and strong (server state / client state /
   ephemeral separation per the design skill). Motion is tracked and
   verified, not assumed.

## Phase 6 — The bar

Walk the whole app in the simulator as a new user, three times: happy path,
skeptic path (skip everything skippable), abuse path (bad input, offline,
interrupt mid-flow, and every back path — chevron, edge swipe, Android
hardware back, active-tab re-tap — especially right after sign-in,
onboarding, a purchase and a finished session, where back must fail to
re-enter the old state). Compare each flow against the best reference you
studied on Mobbin. If any screen of yours is worse than the best equivalent
screen in your research, it goes back into the loop. **You cannot declare the
build finished until every screen holds that comparison.**
