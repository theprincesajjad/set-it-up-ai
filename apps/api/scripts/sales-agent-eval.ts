/**
 * Live eval for the sales assistant: runs docs/engineering/sales-agent-evals.md's ~40 questions (src/services/sales-agent/eval-cases.ts)
 * through the real assistant (real tools on a throw-away database) and the real model, and checks each reply for the expected facts
 * and behaviour.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @ll/api eval:sales-agent          run all, exit 1 if any case fails
 *   pnpm --filter @ll/api eval:sales-agent -- --list                              list the cases (no key needed)
 *   pnpm --filter @ll/api eval:sales-agent -- --md                                print the markdown table used in the docs
 *   pnpm --filter @ll/api eval:sales-agent -- --only en-growth-price,hi-pos      run some
 *   SALES_AGENT_MODEL=claude-sonnet-5-5 ...                                       try another model
 *
 * Without ANTHROPIC_API_KEY it prints "skipped" and exits 0, so CI can call it unconditionally. It spends real money: about 40
 * conversations of one to four model calls each. Results are written to .sales-agent-eval/latest.json (git-ignored).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { salesAgentConversations, salesAgentMessages, createPgliteDb } from "@ll/db";
import { detectAgentLanguage } from "@ll/shared";
import { loadConfig } from "../src/config.js";
import type { AppContext } from "../src/context.js";
import { createProviders } from "../src/providers/index.js";
import { buildApp } from "../src/app.js";
import { handleInbound } from "../src/services/sales-agent/agent.js";
import { EVAL_CASES, type EvalCase } from "../src/services/sales-agent/eval-cases.js";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const only = args.includes("--only") ? new Set((args[args.indexOf("--only") + 1] ?? "").split(",")) : null;
const cases = EVAL_CASES.filter((c) => !only || only.has(c.id));

if (flag("--list")) {
  for (const c of cases) console.log(`${c.id.padEnd(20)} ${c.lang}  ${c.question}\n${" ".repeat(24)}expects: ${c.expectText}`);
  console.log(`\n${cases.length} cases`);
  process.exit(0);
}
if (flag("--md")) {
  console.log("| # | id | lang | question | expected |\n| --- | --- | --- | --- | --- |");
  cases.forEach((c, i) => console.log(`| ${i + 1} | ${c.id} | ${c.lang} | ${c.question.replace(/\|/g, "\\|")} | ${c.expectText.replace(/\|/g, "\\|")} |`));
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.log("sales-agent eval: skipped (ANTHROPIC_API_KEY is not set).");
  process.exit(0);
}

const has = (reply: string, needle: string) => reply.toLowerCase().includes(needle.toLowerCase());

interface Result {
  id: string;
  lang: string;
  pass: boolean;
  failures: string[];
  reply: string;
  tools: string[];
  handoff: boolean;
  ms: number;
}

async function main() {
  const base = loadConfig({ ...process.env, NODE_ENV: "test", STORAGE_PROVIDER: "memory" });
  const db = await createPgliteDb();
  const config = { ...base, salesAgent: { ...base.salesAgent, enabled: true } };
  const ctx: AppContext = { db, config, providers: createProviders(config), now: () => new Date() };
  const app = await buildApp(ctx);
  console.log(`model ${config.salesAgent.model}, effort ${config.salesAgent.effort}, ${cases.length} cases`);

  async function runCase(c: EvalCase): Promise<Result> {
    const t0 = Date.now();
    const res = await handleInbound(ctx, { channel: "web", contactKey: `eval-${c.id}`, text: c.question });
    const [conv] = await db.select().from(salesAgentConversations).where(eq(salesAgentConversations.id, res.conv.id));
    const msgs = await db.select().from(salesAgentMessages).where(eq(salesAgentMessages.conversationId, res.conv.id));
    const assistant = msgs.filter((m) => m.role === "assistant").slice(1); // the first is the fixed disclosure
    const reply = assistant.map((m) => m.body).join("\n");
    const tools = msgs.flatMap((m) => m.toolCalls.map((t) => t.name));
    const failures: string[] = [];
    if (c.allOf) for (const n of c.allOf) if (!has(reply, n)) failures.push(`missing "${n}"`);
    if (c.anyOf && !c.anyOf.some((n) => has(reply, n))) failures.push(`none of ${JSON.stringify(c.anyOf)}`);
    if (c.noneOf) for (const n of c.noneOf) if (has(reply, n) || tools.includes(n)) failures.push(`contains "${n}"`);
    if (c.script && !(assistant.length && detectAgentLanguage(reply) === c.script)) failures.push(`reply not in ${c.script} script`);
    if (c.handoff !== undefined && (conv!.status === "handoff") !== c.handoff) failures.push(c.handoff ? "no hand-off" : "unexpected hand-off");
    if (c.tool && !tools.includes(c.tool)) failures.push(`tool ${c.tool} not called`);
    const tripped = msgs.find((m) => m.guard);
    if (tripped && !c.handoff) failures.push(`guardrail tripped: ${tripped.guard}`);
    return { id: c.id, lang: c.lang, pass: failures.length === 0, failures, reply, tools, handoff: conv!.status === "handoff", ms: Date.now() - t0 };
  }

  const results: Result[] = [];
  const queue = [...cases];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        results.push(await runCase(c));
      } catch (err) {
        results.push({ id: c.id, lang: c.lang, pass: false, failures: [`error: ${(err as Error).name}`], reply: "", tools: [], handoff: false, ms: 0 });
      }
      const r = results[results.length - 1]!;
      console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(20)} ${String(r.ms).padStart(6)} ms  tools: ${r.tools.join(",") || "-"}${r.pass ? "" : `\n      ${r.failures.join("; ")}\n      reply: ${r.reply.slice(0, 300).replace(/\n/g, " ")}`}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const passed = results.filter((r) => r.pass).length;
  const byLang = ["en", "hi", "ur", "pa"].map((l) => `${l} ${results.filter((r) => r.lang === l && r.pass).length}/${results.filter((r) => r.lang === l).length}`).join("  ");
  console.log(`\n${passed}/${results.length} passed  (${byLang})`);
  mkdirSync(".sales-agent-eval", { recursive: true });
  writeFileSync(".sales-agent-eval/latest.json", JSON.stringify({ at: new Date().toISOString(), model: config.salesAgent.model, passed, total: results.length, results }, null, 2));
  await app.close();
  await db.$close();
  process.exit(passed === results.length || flag("--report-only") ? 0 : 1);
}

void main();
