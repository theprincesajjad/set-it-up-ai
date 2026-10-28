# Research methods: flows, elements, and how to study like a director (Mobbin MCP)

## Flow research — study journeys, not screenshots

Flows are where conversion and retention actually live. Use them when the
question is "how do winners structure X?" rather than "what does X look
like?".

1. `search_flows` (0 credits) — search by flow type and category (e.g.
   `"fitness app onboarding quiz"`, `"subscription paywall with trial timeline"`,
   `"mobile banking account setup"`, `"checkout with Apple Pay"`).
2. Identify the 3–5 strongest apps in the returned flows (`app_name`, `mobbin_url`,
   and inline flow previews).
3. Walk each app's flow screen by screen by inspecting the flow previews and
   calling `search_screens(query="<App Name> <flow name>", platform="ios", mode="standard", limit=20)`
   (or `image_quality: "high"` on pivotal steps). Study 3–5 apps' versions of
   the same flow side by side and chart the common spine: step count, what each
   step asks vs. gives, where friction is deliberately placed, where it's
   removed — and what each step *is* (a pushed screen, a modal with its own
   steps, a sheet, an overlay). Winners are consistent about presentation; that
   grammar is part of the spec.

High-value flow studies for almost any category: Onboarding (length,
personalization, permission timing), Paywall (placement, trial framing,
price anchoring), Welcome / Auth (first 5 seconds, biometric / passkey / Apple Sign-In),
plus the category's signature flows (Food Logging, Workout Session, Habit Check-in,
Trading Order Entry, …).

## Element & section research — how winners build one component

When the question is component-level ("how should our tab bar / progress
indicator / filter sheet / CTA look?"):

1. Call `search_screens` with `platform: "ios"` (or `"web"`) and a specific
   natural-language description of the component in context:
   - `"bottom tab bar with floating action button"`
   - `"top segmented control on analytics or stats screen"`
   - `"onboarding screen with top progress bar and skip button"`
   - `"bottom sheet filter with range slider and reset action"`
2. Start with `mode: "standard"` (0 credits, low latency). If the query involves
   nuanced visual relationships or interaction states (e.g. `"empty state with
   single illustration and primary action button in dark mode"`), run a follow-up
   with `mode: "deep"` (5 credits).
3. For web desks, marketing pages, or dashboard sections, pair `search_screens(platform="web")`
   with `search_sections` (0 credits; e.g. `"pricing table with monthly annual toggle"`,
   `"bento feature grid"`, `"command palette modal"`).

Extract the numbers, not the vibe: sizes, placements, label conventions,
active-state treatments, how many items, what gets an icon vs. text.

## Study discipline (what separates research from tourism)

- **Question first.** Every pass answers a named question from your current
  task — "how long is onboarding here", "what does a winning paywall carry".
  Knowing the question is what turns screens into a spec.
- **Specific, single-intent queries.** Mobbin's search works best when you
  describe one screen and its concrete UI elements. Never combine intents
  (`"login or signup"` → two calls), never use negations (`"without ads"`),
  and never stuff platform names into `query` (use `platform: "ios"` or `"web"`).
- **See everything, in order.** Walk the full flow of an app you're studying
  and look at every image; the journey is the unit of design, and a sampled
  journey lies. Download key images from `image.url` (`image.url_expires_at` is
  30 days) and record `id` + `mobbin_url` in your local `research/` notes.
- **Cross-app before in-app.** One app tells you its taste; five apps tell
  you the category's grammar. Divergence between winners = a real choice;
  convergence = a convention you break knowingly or not at all.
- **Stop at saturation, not before.** A research question is answered when
  new screens stop changing your spec. Use `exclude_screen_ids` to page deeper
  when results are still teaching you something new.

## Working with the user's Mobbin Collections

- `list_collections()` (0 credits) shows "All saved" and collections the user
  or team built on mobbin.com.
- `get_collection_contents()` (0 credits) reads the saved screens, flows, or
  sections in any collection. Their taste is a requirement, not a suggestion —
  when a collection exists for the task, start from it.
- Use `create_collection()`, `save_content()`, and `add_comment()` (all 0
  credits) to save your curated shortlist and design notes back into Mobbin so
  the user can review the exact reference board on mobbin.com alongside your
  build.
