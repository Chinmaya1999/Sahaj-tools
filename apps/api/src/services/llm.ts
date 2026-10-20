import { env } from "../env.js";
import { HttpError } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { AiUsage } from "../models/index.js";

/** Provider-neutral LLM adapter. API key stays on the server. */
export interface LlmProvider {
  name: string;
  complete(input: { system: string; user: string; maxTokens: number; timeoutMs: number }): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

const anthropic: LlmProvider = {
  name: "anthropic",
  async complete({ system, user, maxTokens, timeoutMs }) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.LLM_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env.LLM_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`llm_http_${r.status}`);
    const j: any = await r.json();
    return { text: (j.content ?? []).map((c: any) => c.text ?? "").join(""), inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
  },
};

let override: LlmProvider | null = null;
export const setLlmForTests = (p: LlmProvider | null) => { override = p; };
export const llmEnabled = () => !!override || (env.LLM_PROVIDER === "anthropic" && !!env.LLM_API_KEY);
const provider = (): LlmProvider | null => override ?? (llmEnabled() ? anthropic : null);

const today = () => new Date().toISOString().slice(0, 10);

/** Runs a prompt with per-user and global daily spend limits. Throws 503 with a friendly message on any failure. */
export async function runLlm(userId: any, system: string, user: string, maxTokens = 600) {
  const p = provider();
  if (!p) throw new HttpError(503, "AI assistance is not enabled on this server. You can keep writing manually.", "ai_unavailable");
  const day = today();
  const [mine, all] = await Promise.all([
    AiUsage.findOne({ user: userId, day }),
    AiUsage.aggregate([{ $match: { day } }, { $group: { _id: null, n: { $sum: "$requests" } } }]),
  ]);
  if ((mine?.requests ?? 0) >= env.AI_DAILY_USER_LIMIT) throw new HttpError(429, "You have reached today's AI suggestion limit. Please try again tomorrow.", "ai_limit");
  if ((all[0]?.n ?? 0) >= env.AI_DAILY_GLOBAL_LIMIT) throw new HttpError(503, "AI assistance is paused for today. You can keep writing manually.", "ai_budget");
  try {
    const out = await p.complete({ system, user, maxTokens, timeoutMs: 20000 });
    await AiUsage.updateOne({ user: userId, day }, { $inc: { requests: 1, inputTokens: out.inputTokens, outputTokens: out.outputTokens } }, { upsert: true });
    return out.text;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "llm call failed");
    throw new HttpError(503, "The AI service is unavailable right now. Please continue manually and try again later.", "ai_unavailable");
  }
}

/** Extracts the first JSON object from model text. */
export function extractJson(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error("no json");
  return JSON.parse(m[0]);
}

/** Deterministic guard: model output may not introduce numbers (years, percentages, counts) absent from the user's input. */
export function inventedNumbers(input: string, output: string): string[] {
  const nums = (s: string) => new Set(s.match(/\d[\d,.]*/g)?.map((n) => n.replace(/[.,]+$/, "")) ?? []);
  const allowed = nums(input);
  return [...nums(output)].filter((n) => !allowed.has(n));
}
