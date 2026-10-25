# Sales and support assistant API

Our own AI agent: it answers prospective and existing shop owners' questions and starts sign-ups, on **the platform's WhatsApp number** (separate from every merchant's) and in **the marketing site's chat widget**. One brain, two doors.

Contract: `packages/shared/src/api/sales-agent.ts` (`salesAgentApi`) and `packages/shared/src/sales-agent.ts` (fixed texts, languages, limits). Code: `apps/api/src/services/sales-agent/` (`agent.ts` orchestrator, `tools.ts`, `guard.ts`, `prompt.ts`, `knowledge.ts`, `llm.ts`, `store.ts`, `channels.ts`, `inbox.ts`, `eval-cases.ts`), routes `apps/api/src/routes/sales-agent/`. Tables `sales_agent_conversations` and `sales_agent_messages` (migration `0022_agent`). Research and design: `docs/research/sales-agent.md`. Evals: `docs/engineering/sales-agent-evals.md`. Compliance: `docs/legal/compliance-checklist.md` section 12.

## How a message is handled (`handleInbound`)

1. Length cap (1,000 characters), open or find the conversation (WhatsApp: the sender's number; web: the hash of the visitor's session token).
2. **Disclosure**: on first contact the first message is fixed text saying it is an AI assistant, how to reach a person (`HUMAN`) and, on WhatsApp, `STOP` (`AGENT_TEXTS`, en/hi/ur/pa). It is stored before the visitor's message.
3. **STOP / START** (WhatsApp): the shared word list (`packages/shared/src/opt-out.ts`) and `comm_opt_outs`. After STOP only the confirmation is sent; START resumes. A plain "YES" from someone who never opted out is a normal message.
4. A person has the chat (`handoff` or `human`): the assistant stays quiet.
5. **Rate limits**: 30 messages per conversation per hour, 40 per contact per hour, 3,000 per day overall (`SALES_AGENT_LIMITS`); on the web also 60 messages and 10 new chats per address per hour.
6. **HUMAN** (or the equivalent in hi/ur/pa, or "talk to a person"): hand-off in code, no model call.
7. **SMS code typed back**: checked in code (`checkAgentVerification`); the model is told only "succeeded" or "not accepted". The stored message is `[verification code entered]`.
8. No model (no `ANTHROPIC_API_KEY`) or the model is down: the chat goes to the queue with the offline text. The widget still works as an inbox.
9. **Model loop** (at most 6 rounds): the system prompt, the last 30 messages, and a `<context>` block the server writes (channel, language, verified or not, the verified owner's own shops, whether an action waits for a yes). The visitor's text is wrapped in `<user_message>` with tags that could close or fake the wrapper removed.
10. **Guardrails** on the final text (`guard.ts`): every dollar figure and percentage must be a product figure (plans, annual prices, add-ons, fees, the founding offer and its derived prices), or appear in a tool result this turn, or in the person's own message; promises (guarantee, risk-free, free trial, a lift in sales, dates) are blocked. A failing draft is sent back to the model once with the reason; failing again, it is replaced by the fixed hand-off text, stored as a `system` message "Blocked draft" for admins, flagged on the reply (`guard`) and the chat goes to the queue.
11. Store the reply with its tool-call records (masked), model and token usage.

## Tools (`tools.ts`)

All are `strict: true`, take no merchant, user or conversation id from the model, and return JSON.

| Tool | What it does | Needs |
| --- | --- | --- |
| `get_pricing` | Plans, annual prices, add-ons, fees, founding offer and its spots, what is open today. Figures come from `plans.ts` and the same tokens the legal pages use. | |
| `search_knowledge` | Keyword search over `docs/sales/agent-faq.md` and the legal pages (`docs/legal/*.md`, tokens filled). Legal text is flagged as draft. | |
| `get_network_stats` | `GET /v1/public/plans` network counts; `quotable` is false under 10 shops. | |
| `create_lead` | `createPublicLead` (`kind talk_to_us`, source website) with the conversation id in the note. | confirm, phone or email |
| `start_signup` | Returns `/signup?ref=assistant&shop=&vertical=&phone=&plan=` (the page pre-fills and validates it). | confirm |
| `request_founder_call` | Creates a lead, stores the requested time (`callRequestAt` when an ISO time is clear, the person's words in `callRequestNote`), emails the team. A request, never a booking. | confirm, phone or email |
| `request_phone_verification` | Texts a 6-digit code (`startAgentVerification`, purpose `agent_verify`) only to a number that belongs to a shop owner; the answer is the same either way. | 3 per hour per chat and per number |
| `get_my_account` | The verified owner's own shops: plan, restaurant tier, status, subscriptions. | phone verified in the last hour |
| `create_checkout_link` | `startCheckout` / `startRestaurantCheckout` for one of the verified owner's own shops (fake provider in dev). A plan that is not open yet returns `feature_locked`. | verified, confirm |
| `escalate_to_human` | Puts the chat in the queue with a reason, emails the team. | |

**Confirmation** (the four actions): the first call stores the exact arguments on the conversation (`pending_action`) and returns a summary and a `confirmation_id`; the model shows it and asks yes or no. The second call must carry the id and happen on a **later user turn** (`conv.turn > pending.turn`); it executes the **stored** arguments, not what the model sends the second time. Same-turn confirmation fails with `not_confirmed_yet`.

## Public routes (no login)

### `GET /v1/public/sales-agent/status`
→ `{ enabled, whatsappNumber }`. The widget shows only when `enabled`; `whatsappNumber` (digits, from `SALES_AGENT_WHATSAPP_NUMBER`) is null when unset and the widget hides its WhatsApp link. Cacheable for a minute.

### `POST /v1/public/sales-agent/messages`
Body `{ sessionToken?, text (1..1000), language?, page? }`. Omit `sessionToken` to start; the response carries one (`wc_...`), which the browser keeps (the widget uses `sessionStorage`). Only its SHA-256 is stored.
→ `{ sessionToken, language, status, lines: [{ id, role, text, at }] }`: the disclosure on the first call, then the reply (or nothing when a person has the chat). Errors: `400` (empty or too long), `429` (limits), the offline text arrives as a normal reply.

### `GET /v1/public/sales-agent/messages?since=<iso>`
Header `x-agent-session: <token>` (forwarded by the web BFF). → `{ status, lines }` of assistant and person replies after `since`; system notes and blocked drafts are never returned. The widget polls every 5 seconds while `status` is `handoff` or `human`.

## WhatsApp door

The existing `POST /v1/webhooks/whatsapp` (Meta signature checked) hands a message to the assistant when it is addressed to the platform number: `phone_number_id == SALES_AGENT_WHATSAPP_PHONE_NUMBER_ID`, or the display number equals `SALES_AGENT_WHATSAPP_NUMBER`. Anything else goes to the shop flow as before. Replies go out as free-form text from the platform number (they answer a message that just arrived). Idempotent per message id (the existing `webhook_events` table).

## Admin routes (platform admin only)

| Route | |
| --- | --- |
| `GET /v1/admin/sales-agent/conversations?view=queue\|all\|rated_down&limit&cursor` | → `{ items: ConversationSummary[], nextCursor }`. The queue is `status = handoff`, oldest first. WhatsApp numbers are masked (`+1 647 *** 1042`). |
| `GET /v1/admin/sales-agent/conversations/:conversationId` | → `ConversationDetail`: every message including system notes, tool calls (masked input, ok, summary, ms), thumbs, guard flag, window state, call request, lead id. |
| `POST .../takeover`, `.../release`, `.../close` | Take over (the assistant goes quiet, the visitor is told a person joined), hand back, close. Audited. |
| `POST .../reply` `{ text }` | A person's reply; replying takes over. WhatsApp: sent from the platform number inside 24 hours of the contact's last message (`409 outside_window` otherwise), never to a number that replied STOP (`409 opted_out`). Web: stored; the widget picks it up. |
| `PUT /v1/admin/sales-agent/messages/:messageId/feedback` `{ rating: up\|down\|null }` | Thumbs on an assistant answer. `400` on any other role. |
| `GET /v1/admin/sales-agent/quality` | Last 30 days: conversations by channel, hand-offs, handled-without-a-person %, ratings, guardrail trips by code, tool calls and errors, hand-off reasons, languages, top tools, recent thumbs-down, plus the eval cases and the command to run them. |

## Configuration

`ANTHROPIC_API_KEY`, `SALES_AGENT_MODEL` (default `claude-opus-5-5`), `SALES_AGENT_EFFORT` (`low`), `SALES_AGENT_FALLBACKS`, `SALES_AGENT_WHATSAPP_NUMBER`, `SALES_AGENT_WHATSAPP_PHONE_NUMBER_ID`, `SALES_AGENT_ENABLED`, `SALES_AGENT_ADMIN_EMAIL`, `DOCS_DIR`; web `NEXT_PUBLIC_WHATSAPP_NUMBER`. See the README.

## Model notes (claude-opus-5-5)

Thinking is on and cannot be disabled (the `thinking` parameter is omitted); depth is `output_config.effort` (`low`). Forced `tool_choice` is rejected by this model, so tool use is steered by the prompt and every tool is `strict`. The system block carries `cache_control` (tools and system render first; the per-turn context is in the user message so the prefix is stable). `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) re-runs a request a safety classifier declined on a fallback model; a refusal that survives it is handed to a person. Requests are not streamed (short replies, `max_tokens` 2048). SDK errors are mapped to a hand-off, not a 500.

## Retention and privacy

Conversations, messages and tool records are deleted 90 days after the last message (`RETENTION.salesAgentDays`, `purgeSalesAgentChats`, job `privacy.retention`) and on account deletion (by number or verified owner). Logs carry no message text; tool records and audit rows carry masked numbers and emails. The model provider is Anthropic (privacy policy section 4).
