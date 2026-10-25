# Sales and support assistant: our own AI agent on WhatsApp and the website

Founder decision (Oct 25, 2026): the marketing site's "Message us on WhatsApp" goes to **our own AI agent**, which answers prospective and existing shop owners' questions and sets up subscriptions. The number is not chosen yet, so it is configuration (`NEXT_PUBLIC_WHATSAPP_NUMBER` on the web, `SALES_AGENT_WHATSAPP_NUMBER` on the API) and the button is hidden while it is unset.

Figma: https://www.figma.com/design/gGqPNtwq3Z8gy7aY1CXOAi (file "Local Loyalty — Sales agent (WhatsApp + web chat + inbox)"). PNG exports: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/sales-agent/`.

## 1. Who this is for

- **The prospect**: the owner of a café, bakery, salon, repair shop or (the paying wedge) a Desi restaurant, sweet shop or tiffin kitchen in Toronto and the GTA. Usually the owner is also the cook or the person at the till, reads email rarely and WhatsApp constantly, and often prefers Urdu, Hindi or Punjabi (`docs/research/desi-restaurants.md`). They are comparing us with a POS vendor, a delivery app and a free loyalty app, and have been burned by hidden fees and long contracts. They ask short questions at odd hours, mid-service.
- **The existing merchant**: wants to know what plan they are on, upgrade, or fix something without finding the dashboard.
- **The founder** (and later a rep): the person who has to follow up, and who must be able to trust that the agent never said something we cannot stand behind. In this stage the founder is the whole sales team.

## 2. Evidence

### What owners ask before they sign

Marketing-site FAQs and the reps' scripts (`apps/web/src/copy/en-CA.ts`, `docs/research/landing-and-network.md`, `docs/sales/battlecards.md`) agree with the third-party writing on how SMBs buy restaurant software. In rank order of how often they come up:

1. **Price, and what is not in the price**: processing mark-ups, per-order fees on built-in online ordering (commonly 5 to 15% commission on delivery apps), "free" hardware that is a lease. [TableNeeds on hidden costs of cheap POS](https://tableneeds.com/blog/pos/hidden-costs-of-cheap-restaurant-pos-pricing/), [Adora POS on "free" hardware](https://adorapos.com/blog/free-pos-hardware-hidden-costs-pizzerias).
2. **Contract and exit**: auto-renewal windows, multi-year minimums, early-termination fees. [Katalyst on POS contract red flags](https://www.katalystos.com/blog/pos-contract-red-flags-before-you-sign), [Toast on comparing agreements](https://pos.toasttab.com/au/blog/on-the-line/how-to-compare-restaurant-pos-agreements).
3. **Data ownership and export**: whether customer lists and order history leave with you. [Silverware POS on vendor lock-in](https://www.silverwarepos.com/silverware-knowledge-base/what-are-the-risks-of-vendor-lock-in-with-restaurant-pos-systems).
4. **POS and hardware**: do I need one, does it work with mine.
5. **Languages**: for our buyers, whether the staff screens and the menu work in Urdu, Hindi or Punjabi, and whether someone will answer in that language.
6. **Set-up time and who does it.**
7. **HST on the invoice** (an open question for us; see `docs/research/landing-and-network.md`), and delivery apps (do I have to drop DoorDash).

Our answers already exist as tokens in `plans.ts` and in the FAQ copy. The assistant's job is to give them in the owner's language at 11 pm, without drift. That is why its knowledge is `docs/sales/agent-faq.md` (a new file, written in the owner's question form, with `{{tokens}}`) plus the legal pages, not a prompt full of numbers.

### WhatsApp Business policy for automated agents (verified Oct 25, 2026)

- **What the 2026 change is.** Effective January 15, 2026 Meta's WhatsApp Business Solution Terms bar AI providers whose assistant **is the product** (general-purpose chatbots such as ChatGPT, Perplexity, Luzia, Poke) from distributing it over the Business API; Meta decides what counts as primary functionality. Businesses that use AI inside their own customer conversations (support, bookings, order tracking) are explicitly not affected. [9to5Mac](https://9to5mac.com/2025/10/20/whatsapp-bans-ai-chatbots-from-using-its-business-api/), [Gulf News](https://gulfnews.com/technology/no-more-chatgpt-and-perplexity-on-whatsapp-meta-bans-major-ai-chatbots-from-2026-1.500316016), [Whapi.Cloud](https://whapi.cloud/blog/meta-ai-bot-ban-whatsapp-automation-2026). In the EU the Commission imposed interim measures on June 9, 2026 requiring free access for rival general-purpose assistants (Meta says it will appeal): [TechCrunch, March 5, 2026](https://techcrunch.com/2026/03/05/meta-will-allow-rival-ai-chatbots-on-whatsapp-in-europe-but-for-a-fee/), [AP via NY1, June 9, 2026](https://ny1.com/nyc/all-boroughs/ap-top-news/2026/06/09/eu-orders-meta-to-restore-whatsapp-access-for-rival-ai-chatbots). **Our assistant answers questions about our own service and does our own sign-ups: the permitted case.** The risk to manage is the business profile: it must describe us (Local Loyalty), not "an AI assistant".
- **Meta's own policy text** ([whatsappbusiness.com/policy](https://whatsappbusiness.com/policy/)): you may contact people only if they gave you their number and **opted in**; opt-in should be collected by message category; "You may use automation when responding during the 24-hour window" provided there are "available prompt, clear, and direct escalation paths", and "In-Chat Human Agent transfer" is listed as one. So: **disclosure is our choice (we do it anyway), escalation is required, opt-in applies to anything we initiate.**
- **24-hour window and templates.** A user's message opens a 24-hour customer-service window in which free-form replies are allowed; outside it only an approved template may be sent, and the window runs from the **user's** last message, not ours. [Rasayel summary of the messaging policy](https://learn.rasayel.io/en/books/whatsapp/whatsapp-business/whatsapp-business-messaging-policy), [Sleekflow on opt-in](https://help.sleekflow.io/whatsapp/whatsapp-message-opt-in), [SMSMode on the window](https://www.smsmode.com/en/whatsapp-business-api-customer-care-window-ou-templates-comment-les-utiliser/). **Decision: this number never starts a conversation.** The assistant only answers, so there are no templates and no marketing opt-in to manage; a person's reply from the console is refused after 24 hours.
- **STOP**: honoured through the existing `comm_opt_outs` list for every sender.

### CASL and the Competition Act: what an agent may say or promise

- **CASL** ([ISED guidance](https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/node/7)): implied consent exists for an inquiry (up to 6 months) and an existing business relationship (up to 2 years); a commercial message must name the sender, give a mailing address and a working contact, and carry a free unsubscribe, honoured within 10 business days. A prospect who writes to us is an inquiry, so answering them is fine; **the assistant sends nothing unsolicited, no marketing, no follow-up templates.** A lead it saves is created only after the person confirmed and gave a way to reach them. Counsel should confirm how reps follow up (compliance checklist section 12).
- **Competition Act** (misleading representations to the public; drip pricing is expressly prohibited since the 2022 amendments, and only government-imposed fees such as sales tax may be left out of an advertised price: [DWPV on drip-pricing enforcement](https://www.dwpv.com/insights/2025/roller-coaster-canadian-drip-pricing-enforcement), [Competition Bureau v. DoorDash, June 2025](https://www.canada.ca/en/competition-bureau/news/2025/06/competition-bureau-sues-doordash-for-allegedly-advertising-misleading-prices-and-discounts.html)). A chat is an advertisement. So: every price is stated with "before HST"; the 1% on deposits and invoices and the card-processing pass-through are stated whenever fees come up; **no figure that is not in `plans.ts`**; no guaranteed results, risk-free or money-back claims, free trials we do not have, delivery dates, or testimonials. This is enforced in code (`guard.ts`), not only in the prompt.
- **Privacy**: PIPEDA openness and consent, and Law 25 transparency about automated processing. The first message says it is an AI; chats are kept 90 days; the model provider is named in the policy; no automated decision about a person.

### What the best agents do (and what we copied)

- **Intercom Fin / Zendesk AI**: escalate by default on a clear request for a human, strong frustration or a loop; configure the AI label and an intro message that says the customer is talking to an AI ("required for legal compliance in certain jurisdictions"); treat the hand-off as carefully as the automation: pass the goal, the verified facts and what was tried, and give the escalation policy a named owner. [Fin on escalation](https://fin.ai/blog/blueprint/how-to-set-your-escalation-policy), [Fin on AI-agent disclosure](https://fin.ai/help/en/articles/11847955-what-is-ai-agent-disclosure), [Intercom on AI-human handoffs](https://www.intercom.com/learning-center/ai-human-collaboration-procedures-handoffs). Copied: disclosure in the first message, hand-off on request in code, the hand-off row carries the reason and how long it has waited. Billing, refunds and personal data go to a person: ours too (the assistant creates a checkout link but never changes a plan or refunds).
- **Drift** (and Fin's sales mode): qualify, then book a meeting. Copied: "book a founder call" as a stored request with the person's own words and time, confirmed by a human. Not copied: gating answers behind a form.
- **Owner.com and Chowbus**: restaurant-owner sales runs on a phone call and a visit, not a bot; Owner.com's pricing page leads with the flat monthly price and "no commission". Neither appears on Mobbin, so no screens are cited for them; the pricing-section references below (7shifts, OpenTable) stood in.

### Mobbin references (each taught something specific)

| Reference | What it taught |
| --- | --- |
| [Shopee, shop chat](https://mobbin.com/screens/e5958ea3-5b22-4556-9667-99257394c122) | An assistant-sent greeting with tappable questions, labelled "Sent by Chat AI Assistant" under the bubble, a thumbs pair under each answer, and an "Ask in live!" button always visible. Copied: label, thumbs (in the console), the person button as a chip and as the HUMAN word. |
| [TextNow, "Genie, your AI assistant"](https://mobbin.com/screens/074659f3-27ea-418d-8eeb-7b142eea9f4c) | The disclosure belongs in the first bubble in plain words ("I'm Genie, your AI assistant... choose an option or type your query"). Chips never replace typing. |
| [Noom, coach chat](https://mobbin.com/screens/f3ebca91-37ea-4846-a830-361415e89670) | Suggested follow-up questions as outlined pills under an answer and a thumbs-up/down pair on each message. |
| [inDrive, support](https://mobbin.com/screens/4c440efe-8193-4cfd-9c2d-bb98d43c582d) | A menu-only bot breaks when the user types ("you didn't select the option"). Our agent takes free text first; chips are shortcuts. |
| [Beside, AI reply with sources](https://mobbin.com/screens/71796e40-c453-4f8d-958c-c4c4109ecd3b) | Showing where an answer came from builds trust. In the console, tool calls under each answer are our "sources". |
| [Intercom inbox with Fin](https://mobbin.com/screens/2a6e3c41-7e30-4b00-b49c-91718e1c430b) | Three columns: list with a waiting/assignee state, conversation, a details side panel (contact, links, attributes). |
| [Plain, thread with an "AI agent" message](https://mobbin.com/screens/db1a5cad-1e3d-428f-ab61-35ca043e0dbc) | The AI's messages carry an "AI agent" tag next to the sender in the transcript. |
| [Front, inbox](https://mobbin.com/screens/f445cb7a-fbdf-4fba-96c1-aaa0f8e24c59) | System events ("Assigned to...", "Tag added") inline in the thread as quiet pills; internal comment is a separate action from reply. Copied: hand-off/take-over events as grey pills. |
| [Whop, support chats](https://mobbin.com/screens/3109dd20-8750-44a6-9d6a-397ebb357695) | A plain list plus a customer-details panel with spend and history is enough for a small team. |
| [GoDaddy, Conversations](https://mobbin.com/screens/4ee1303d-954f-4085-83b1-045a20dde6da) | A bot's conversations mixed with human ones in one list; Reply vs Note tabs; a Resolve button. Copied: Close. |
| [7shifts pricing](https://mobbin.com/sites/sections/20312f16-e87b-4eae-a9c3-1cd419a5023d) and [add-ons](https://mobbin.com/sites/sections/af185120-7104-478e-a5cb-7435e1297e93) | A restaurant buyer reads "No contracts, cancel anytime" directly under the plan names, and add-ons priced per month with the unit. The assistant's answer order matches: price, then "no contract", then add-ons. |

## 3. Jobs to be done

Ranked by frequency times pain.

| # | Job | Who | Done when |
| --- | --- | --- | --- |
| 1 | "Tell me the real price and the fees, in my language, now." | Prospect | They have the figure, "before HST", and the fee table, from `plans.ts` |
| 2 | "Is there a contract / can I leave / who owns my data / do I need a POS?" | Prospect | A short answer from the FAQ, with no promise |
| 3 | "Sign me up" or "start my plan" | Prospect, owner | A pre-filled sign-up link, or a checkout link for their own shop, after a yes (and a phone code for the checkout) |
| 4 | "I want to talk to someone" | Both | A person has the chat with the context; the owner knows someone will reply |
| 5 | "What plan am I on / when does it renew?" | Owner | Their own shop's plan and state, after a code |
| 6 | "Can the founder call me Tuesday?" | Prospect | A stored request with their words and time, the founder emailed, nothing claimed as booked |
| 7 | "I do not know how this works, show me" | Prospect | A lead saved for a rep visit (with consent) |
| 8 | Founder: "show me who is waiting, what was said and what the agent did, and let me answer" | Founder | Queue, transcript with tool calls, take over, reply, thumbs |
| 9 | Founder: "tell me if it ever made something up" | Founder | Guardrail trips listed with the blocked draft; eval set |

## 4. What we build, and why

Each part maps to a job. Audit of what exists:

| Existing | Verdict | Why |
| --- | --- | --- |
| "Message us on WhatsApp" buttons on `/` and `/for-restaurants` pointing at `wa.me/14165550142` (a placeholder number from `BRAND.whatsappNumber`) | **Change** | It linked to a number nobody owns. Now reads `NEXT_PUBLIC_WHATSAPP_NUMBER` only; hidden when unset (job 4) |
| Contact form `ContactForm` and `POST /v1/public/leads` | **Keep, reuse** | The assistant's `create_lead` calls the same service, so the rep console sees one lead type (job 7) |
| Existing WhatsApp webhook (`services/whatsapp.ts`) and the per-shop inbox | **Keep, extend by one branch** | A platform-number message goes to the assistant; shops are untouched. The shop inbox is a merchant tool for guests and stays as is |
| `comm_opt_outs`, `STOP_KEYWORDS`, retention job, privacy-scrub | **Keep, reuse** | STOP/START, retention and account deletion extend to the new tables instead of a parallel mechanism |
| Legal pages rendered from `docs/legal/*.md` with `{{tokens}}` | **Keep, reuse as knowledge** | The assistant reads the same files the site renders, so its answers cannot disagree with them |
| Marketing FAQ copy in `en-CA.ts` | **Keep; mirror into `docs/sales/agent-faq.md`** | The agent needs owner-question form with tokens; the site copy stays hand-written |
| Phone ordering assistant (`phone.ts`) | **Leave** | A different product for restaurants' customers |
| `BRAND.whatsappNumber` placeholder | **Cut from the site** (kept for seed data) | A placeholder link is worse than no button |
| Admin console had no conversation view | **Add** `/admin/sales-agent` | Jobs 4, 8, 9 |
| Shop-by-shop WhatsApp ordering bot (`whatsapp-conversation.ts`, a rule-based state machine) | **Leave** | Rules suit ordering from a menu; our sales questions are open-ended |

New components: the agent service (`agent.ts`, `tools.ts`, `guard.ts`, `prompt.ts`, `knowledge.ts`, `llm.ts`, `store.ts`, `channels.ts`, `inbox.ts`) — jobs 1 to 7; the web widget — jobs 1 to 4, 6, 7 on the site; the admin console — jobs 8, 9; the FAQ file — jobs 1, 2; the eval set — job 9.

## 5. What we deliberately do not build

- **No outbound messages from the number**: no templates, broadcasts or "following up" nudges. It removes the opt-in and template-approval problem and the CASL question, and a person can reach out from their own phone.
- **No discounts, exceptions or price changes by the agent**, no custom contracts, no refunds, no plan changes or cancellations (checkout link only). Those are decisions for a person.
- **No card, bank or password collection in chat**; payment happens on Stripe's page.
- **No answers about other businesses**, and no tool that can take a merchant id.
- **No memory across channels or people** (a web visitor and a WhatsApp contact are separate conversations until a person links them).
- **No voice, images or documents**: a non-text message gets "I can only read text".
- **No streaming** in the widget (replies are a few sentences).
- **No French yet** (disclosure and widget are en/hi/ur/pa). Open item for Quebec.
- **No agent for merchants' own customers**: that is the restaurant pack's WhatsApp ordering.

## 6. Design

Figma frames (390 and 1440), each with an orange "why this exists" note beside it:

| Frame | Size | Job |
| --- | --- | --- |
| A1 WhatsApp · first contact + pricing | 390 | 1, 2: disclosure, chips, a grounded price answer with "before HST", next-step chips |
| A2 WhatsApp · sign-up with confirmation | 390 | 3, 5: confirm card, "Yes, send it", code request |
| A3 WhatsApp · Urdu + hand-off | 390 | 4: Urdu right-to-left text, an honest "we have not decided how HST appears", HUMAN, "AI paused" line |
| A4 Web chat widget on the marketing site | 390 | 1 to 4, 6, 7 on the site: same disclosure, WhatsApp link only when configured, retention line |
| B1 Founder inbox · review console | 1440 | 8: queue with waiting time, transcript with tool chips, take over, reply, thumbs, details panel |
| B2 Quality · simple eval view | 1440 | 9: five numbers, the eval list, where it falls short |

Iterations (screenshots checked twice): the Urdu line height was too tight and was raised; the transcript header's subtitle was truncated and was shortened. The built pages were compared with these frames (see the report).

## 7. Build spec (done; this is what was built and where)

**API** (`apps/api`): `src/services/sales-agent/{agent,tools,guard,prompt,knowledge,llm,store,channels,inbox,eval-cases}.ts`; `src/routes/sales-agent/index.ts` (registered in `routes/index.ts`); a branch in `services/whatsapp.ts` `handleWebhook` for the platform number; `startAgentVerification` / `checkAgentVerification` in `services/auth.ts` (OTP purpose `agent_verify`); `purgeSalesAgentChats` in `services/retention.ts`; chat deletion in `services/privacy-scrub.ts`; `config.salesAgent`; `providers/types.ts` `salesAgentLlm`; `scripts/sales-agent-eval.ts`. Dependency `@anthropic-ai/sdk`.
**DB** (`packages/db`): `sales_agent_conversations`, `sales_agent_messages`; migration `0022_agent`.
**Shared** (`packages/shared`): `sales-agent.ts` (texts in four languages, language detection, the HUMAN rule, limits), `api/sales-agent.ts` (contracts), `RETENTION.salesAgentDays`.
**Web** (`apps/web`): `components/marketing/SalesChat.tsx` mounted in the marketing layout; `lib/marketing/{whatsapp,salesChat,signupPrefill}.ts`; `/signup` pre-fill; `app/(admin)/admin/sales-agent/page.tsx` and a nav entry; `lib/api/salesAgent.ts`; the BFF forwards `x-agent-session`.
**Docs**: `docs/sales/agent-faq.md`, `docs/engineering/api/sales-agent.md`, `docs/engineering/sales-agent-evals.md`, privacy policy (en, fr), compliance checklist section 12, README and `.env.example`.
**Acceptance checks**: `apps/api/test/sales-agent.test.ts` (60 tests), `apps/web/test/sales-agent.test.ts`, `apps/web/e2e/sales-agent.spec.ts`, the live eval.

## 8. Findings that changed the product

1. **The WhatsApp policy bans AI products, not businesses using AI**, and requires escalation paths. So the build is a business assistant with a code-level HUMAN hand-off, not a general chatbot, and the Business profile must not present it as "an AI".
2. **A placeholder number is a liability**: the site linked to a number nobody owns. The button now hides until a number is configured.
3. **Price statements are advertising** (Competition Act, drip pricing). The assistant's figures are checked in code against `plans.ts` and a failing reply never reaches the owner.
4. **Owners' top objections are fees, contract and data**, and our answers already exist. The knowledge base is the FAQ plus the legal pages with tokens, not a long prompt.
5. **"YES" is a START keyword and "CANCEL" is a STOP keyword in the shared list.** The assistant treats YES as START only for someone already opted out, so "yes, send the link" works.
6. **No outbound** from this number removes the template and consent problems; the assistant is reply-only.

## 9. Open items

- Choose and register the platform WhatsApp number (separate WhatsApp Business account); set the two env vars; Meta display-name review.
- Native-speaker review of the Hindi, Urdu and Punjabi fixed texts; add French for Quebec.
- Counsel: follow-up on leads created in chat (CASL); the privacy-policy wording about Anthropic; verify the Anthropic account's no-training and retention terms.
- Decide who watches the queue and in which hours; consider an on-call email-to-WhatsApp bridge.
- Run the live eval with a real key, record the cost per run and the pass rate; tune `SALES_AGENT_EFFORT`.
- HST on invoices is undecided (the assistant says so and hands off).
- Streaming and richer widget (typing indicator) if replies get longer.
