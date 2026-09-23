import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, validateEvaluateInput, MAX_PROMPT_CHARS } from "./guard.ts";

test("accepts a normal request", () => {
  assert.equal(validateEvaluateInput({ prompt: "Slack integration", agentType: "prd", role: "PM" }), null);
});

test("rejects oversize prompt, unknown agent, non-string fields", () => {
  assert.match(validateEvaluateInput({ prompt: "x".repeat(MAX_PROMPT_CHARS + 1) })!, /exceeds/);
  assert.match(validateEvaluateInput({ agentType: "shell" })!, /agentType/);
  assert.match(validateEvaluateInput({ prompt: 42 })!, /string/);
  assert.match(validateEvaluateInput({ userContext: { a: "y".repeat(9000) } })!, /userContext/);
  assert.match(validateEvaluateInput(undefined)!, /JSON object/);
});

test("rate limiter blocks after the limit and resets after the window", () => {
  let t = 0;
  const allow = createRateLimiter(3, 60_000, () => t);
  assert.ok(allow("a").ok && allow("a").ok && allow("a").ok);
  const blocked = allow("a");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 60);
  assert.ok(allow("b").ok, "other callers unaffected");
  t = 60_000;
  assert.ok(allow("a").ok, "window reset");
});
