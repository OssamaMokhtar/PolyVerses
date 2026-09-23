// Request guards for POST /api/evaluate (audit, 23 Sep 2026).
// The route was anonymous with no rate limit and no input cap, so any caller
// could spend the Gemini budget. These guards bound that spend per caller and
// per request. They do not replace authentication (GAPS #3).

export const MAX_PROMPT_CHARS = 4000;
export const MAX_CONTEXT_CHARS = 8000;
export const AGENT_TYPES = ["router", "opportunity", "compliance", "prd", "rollback"] as const;

export interface EvaluateInput {
  prompt?: unknown;
  priority?: unknown;
  role?: unknown;
  agentType?: unknown;
  userContext?: unknown;
}

/** Returns an error message, or null when the input is acceptable. */
export function validateEvaluateInput(body: EvaluateInput | undefined): string | null {
  if (!body || typeof body !== "object") return "Request body must be a JSON object.";
  const { prompt, priority, role, agentType, userContext } = body;
  if (prompt !== undefined && typeof prompt !== "string") return "prompt must be a string.";
  if (typeof prompt === "string" && prompt.length > MAX_PROMPT_CHARS) return `prompt exceeds ${MAX_PROMPT_CHARS} characters.`;
  for (const [k, v] of [["priority", priority], ["role", role]] as const) {
    if (v !== undefined && (typeof v !== "string" || v.length > 100)) return `${k} must be a string of at most 100 characters.`;
  }
  if (agentType !== undefined && !(AGENT_TYPES as readonly string[]).includes(String(agentType))) {
    return `agentType must be one of: ${AGENT_TYPES.join(", ")}.`;
  }
  if (userContext !== undefined && JSON.stringify(userContext).length > MAX_CONTEXT_CHARS) {
    return `userContext exceeds ${MAX_CONTEXT_CHARS} characters.`;
  }
  return null;
}

/** Fixed-window limiter, in-process (per server instance). */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function allow(key: string): { ok: boolean; retryAfterSec: number } {
    const t = now();
    const cur = hits.get(key);
    if (!cur || t >= cur.resetAt) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (t >= v.resetAt) hits.delete(k);
      return { ok: true, retryAfterSec: 0 };
    }
    cur.count += 1;
    if (cur.count > limit) return { ok: false, retryAfterSec: Math.ceil((cur.resetAt - t) / 1000) };
    return { ok: true, retryAfterSec: 0 };
  };
}
