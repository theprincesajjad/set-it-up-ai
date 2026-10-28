---
name: mobbin-design
description: "Use when any UI/UX design or implementation task needs real Mobbin references — mobile apps, web apps, or websites. Routes the request to the mobile pair (appllama-usage → appllama-app-design-skill) or the web pair (mobbin-web-usage → mobbin-web-design). Trigger on design, polish, onboarding, paywall, checkout, landing page, dashboard, pricing page, marketing site, or any Mobbin-backed build."
license: MIT
metadata:
  author: customized from Appllama for Mobbin
  version: "1.0.0"
  kind: router
  routes:
    mobile:
      - appllama-usage@2.1.0
      - appllama-app-design-skill@1.4.1
    web:
      - mobbin-web-usage@1.0.0
      - mobbin-web-design@1.0.0
  mcp: "https://api.mobbin.com/mcp"
---

# Mobbin Design Router

Single entry skill for all Mobbin-backed design work. **Do not design yet.**
Classify the request, load exactly one pair, then follow that pair end to end.

## Route table (decide once, then commit)

| If the deliverable is… | Load this pair (in order) |
|---|---|
| **Native mobile app** (iOS/Android, Expo, React Native, SwiftUI, tabs, sheets, HIG) | `appllama-usage@2.1.0` → `appllama-app-design-skill@1.4.1` |
| **Website / marketing page** (landing, pricing, hero, footer, portfolio, campaign) | `mobbin-web-usage@1.0.0` → `mobbin-web-design@1.0.0` |
| **Web app / SaaS product UI** (dashboard, settings, billing, desktop chrome) | `mobbin-web-usage@1.0.0` → `mobbin-web-design@1.0.0` |
| **Both** (marketing site + logged-in product) | Web pair for site surfaces; mobile pair only if a native app is also in scope. Prefer web for browser UI. |
| **Ambiguous “app” with no platform** | Ask one clarifying question: *mobile native* or *web*? If they say “responsive web app” or “Next.js”, use **web**. If they say “iPhone app” / Expo, use **mobile**. |

### Quick keyword hints

**→ Mobile:** Expo, React Native, SwiftUI, Jetpack Compose, tab bar, sheet, Dynamic Island, App Store, TestFlight, simulator  

**→ Web:** landing page, website, marketing site, pricing page, hero, footer, Next.js, dashboard (browser), SaaS web, desktop UI, Mobbin Sites, `platform: "web"`, sections  

## Hard rules

1. **Load the usage skill of the chosen pair before the design skill.**
2. **Never mix stacks in one screen** — no RN navigation laws on a Next.js page; no HIG sheet rules on a marketing hero.
3. **Shared MCP:** both pairs use Mobbin MCP (`search_screens`, `search_flows`, `search_sections`, collections). Platform routing:
   - Mobile → `platform: "ios"` (or android if the project demands it; default ios in the mobile pack)
   - Web product UI → `platform: "web"` on screens/flows
   - Marketing slices → `search_sections` (no platform param)
4. After routing, **say which pair you loaded** in one short line, then proceed silently inside that skill’s playbooks.
5. If only one pair is installed, say so and use what you have — do not invent the missing skill’s content.

## Pair contracts

```
MOBILE
  appllama-usage          research (screens/flows, mostly ios)
          │
          ▼
  appllama-app-design-skill   native build + simulator loop

WEB
  mobbin-web-usage        research (web screens/flows + Sites sections)
          │
          ▼
  mobbin-web-design       web build (motion, flow, look, language, fonts, psychology)
                          + browser loop
```

## MCP prerequisite

```json
{
  "mcpServers": {
    "mobbin": {
      "type": "http",
      "url": "https://api.mobbin.com/mcp"
    }
  }
}
```

Authenticate Mobbin MCP before deep research. Standard search / flows / sections / collections cost 0 AI credits; `search_screens(mode="deep")` costs 5.
