/**
 * The model client behind the sales assistant, kept behind a tiny interface so tests run with a scripted model and
 * nothing else in the service knows about the SDK.
 *
 * Model: claude-opus-5-5 by default (SALES_AGENT_MODEL to change), the current model recommended for tool use and
 * support work. Notes that follow from that model (see the claude-api skill):
 *  - Thinking cannot be switched off and `thinking` is omitted (adaptive). Depth is controlled with output_config.effort,
 *    `low` by default for chat (SALES_AGENT_EFFORT). Thinking blocks are passed back unchanged inside one tool loop; across
 *    turns only plain text is stored and replayed, so there is no history to keep "append-only".
 *  - Forced tool_choice is rejected (400), so tool use is steered by the prompt and every tool is `strict: true`.
 *  - The system block is marked cacheable (tools and system render first, so one breakpoint covers both). Cache reads show up
 *    in `usage.cacheRead`; below the model's minimum cacheable prefix the call just runs uncached.
 *  - Server-side `fallbacks: "default"` (beta server-side-fallback-2026-07-01) re-runs a request a safety classifier declined
 *    on a fallback model inside the same call. SALES_AGENT_FALLBACKS=0 turns it off.
 *  - Replies are short, so requests are not streamed (max_tokens 2048 is far under the SDK's long-request threshold).
 * Errors: the SDK's typed errors are mapped to `LlmUnavailable` so the chat degrades to a hand-off instead of failing.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../../config.js";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: string; [k: string]: unknown };

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
  strict: true;
}

export interface LlmRequest {
  system: string;
  tools: ToolDef[];
  messages: LlmMessage[];
  maxTokens: number;
}

export interface LlmResponse {
  content: Block[];
  stopReason: string | null;
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface LlmClient {
  name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmUnavailable extends Error {}

export function createLlmClient(config: Config): LlmClient | null {
  const { apiKey, model, effort, fallbacks } = config.salesAgent;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    name: `anthropic:${model}`,
    async complete(req) {
      const params = {
        model,
        max_tokens: req.maxTokens,
        output_config: { effort },
        system: [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }],
        tools: req.tools,
        messages: req.messages,
      };
      try {
        const res = fallbacks
          ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
          : await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
        const usage = res.usage as unknown as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
        return {
          content: res.content as unknown as Block[],
          stopReason: res.stop_reason ?? null,
          model: res.model,
          usage: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0 },
        };
      } catch (err) {
        // Most specific first. Only the class and status are kept: the message can quote the conversation.
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new LlmUnavailable("auth");
        if (err instanceof Anthropic.RateLimitError) throw new LlmUnavailable("rate_limited");
        if (err instanceof Anthropic.BadRequestError) throw new LlmUnavailable("bad_request");
        if (err instanceof Anthropic.APIConnectionError) throw new LlmUnavailable("connection");
        if (err instanceof Anthropic.APIError) throw new LlmUnavailable(`api_${err.status ?? "error"}`);
        throw err;
      }
    },
  };
}
