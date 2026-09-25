# Governance State — PolySync AI Fitness Coach

> **Last updated:** 2026-09-12
> **Status:** Design document — governance layer not yet implemented in code. Documents what the governance layer would enforce if layered on top of the existing 12-agent fitness mesh (origin/main).

This document captures the **designed state** of the governance layer for PolySync: what budgets would exist, what circuit breakers would be active, what observability would be exposed, and what's currently missing vs. what exists in the fitness codebase.

---

## 1. What Exists in the Codebase (origin/main)

### 1.1 Fitness Agent Mesh — Working

| Component | Status | Location |
|---|---|---|
| 12-agent mesh (F00–F11) | Implemented | `server.ts` 1224 lines |
| 16 fitness API endpoints | Implemented | `server.ts` — POST /api/fitness/*, GET /api/fitness/* |
| Firebase Auth + Firestore per-user storage | Implemented | `src/firebase.ts`, `firestore.rules` |
| Gemini 3.5 Flash / Flash Thinking routing | Implemented | `server.ts` — `ai.models.generateContent` with model per agent |
| Sandbox fallback | Implemented | `server.ts` — `if (!ai) return sandbox message` |
| ExerciseLibrary.ts | Implemented | `src/ExerciseLibrary.ts` (referenced in server.ts) |
| D3 agent network + heatmap | Implemented | `OrchestrationConsole.tsx`, `D3Heatmap.tsx` |
| Recharts charts | Implemented | `RechartsHeatmap.tsx` |
| Observability dashboard | Implemented | `ObservabilityDashboard.tsx` (PolyVerses-style, not fitness-wired) |
| Human gate UI (compliance gate) | Implemented | `gates/` (referenced in architecture) |
| FitnessOnboarding | Implemented | `FitnessOnboarding.tsx` |

### 1.2 What the Codebase Does NOT Have (Governance Gaps)

| Gap | Impact |
|---|---|
| No token tracking — every Gemini call burns tokens with no record | Can't tell how many tokens a session burns, can't enforce a budget |
| No session budget — no ceiling on token usage per session | A heavy chat user can burn 500K+ tokens in one session undetected |
| No circuit breakers — Gemini failures are caught and fallback to sandbox, but no breaker opens to stop repeated failing calls | No tier protection; no auto-downgrade on repeated failures |
| No observability endpoint — `/api/budget` doesn't exist | Can't see token usage, agent breakdown, breaker state, cache stats from an API |
| No context cache — every repeated question triggers a fresh Gemini call | "How's my recovery?" called 3 times in one morning = 3 Gemini calls, 3× token burn |
| No knowledge layer — Firestore data accumulates but is never indexed or classified | Can't search or ask questions across workout logs + check-ins + chats |
| No distillation — workout logs, check-ins, chats, recovery assessments are never summarized | Raw data sits in Firestore forever; no progressive summarization into insights |
| No human gate for plan changes — F11 checks safety but doesn't gate significant program changes | F05 can adapt a plan aggressively without user approval |

---

## 2. Designed Session Token Budget (Not Yet Implemented)

| Field | Designed Value | Current Reality |
|---|---|---|
| Budget | 200,000 tokens per session | No budget — unlimited |
| Tracked via | `sessionBudgets` Map in server.ts (in-memory) | No tracking — `sessionBudgets` doesn't exist |
| Session ID source | `x-session-id` header, or `uuidv4()` if absent | No session ID handling — each request is independent |
| Check point | Every `/api/fitness/*` endpoint that makes a Gemini call | No check — Gemini calls proceed unconditionally |
| Exceeded behavior | 429 with `error: "Session token budget exceeded"`, `session_id`, `budget` snapshot | No 429 — Gemini calls proceed until API rate limit or quota hit |
| Warning threshold | >50% used AND <20% remaining → reason in budget response, call not blocked | No warning — no tracking at all |
| Reset | On server restart (in-memory) | N/A |

**Token estimation approach (designed):** every Gemini call would estimate tokens as `ceil((prompt_length + response_length) / 4)`. This is an approximation — the Gemini API returns actual token counts in the response metadata, but the current fitness codebase doesn't capture or log them.

**Client gap:** the fitness React app doesn't send `x-session-id`. Each request would get a new session ID from the server, making the budget effectively per-request rather than per-session until the client is updated to generate and send a session ID on app mount.

---

## 3. Designed Circuit Breakers (Not Yet Implemented)

### 3.1 State (Designed — All Closed Initially)

| Tier | Model | Used by | Status | Last opened |
|---|---|---|---|---|
| small | Gemini 3.5 Flash | F01, F03, F07, F08, F09, F11 (light calls) | closed | — |
| medium | Gemini 3.5 Flash (reasoning) | F02, F04, F05, F06 (reasoning calls) | closed | — |
| capable | Gemini 3.5 Pro (if available) | F02 (high-quality plans), F06 (high-quality coaching) | closed | — |

### 3.2 Trigger Rules (Designed)

| Event | Action |
|---|---|
| 3 failures in 5 minutes for the same tier | Open circuit breaker for that tier → subsequent calls return 429 |
| Capable-tier breaker open | F02 + F06 fall back to medium (Flash Thinking) |
| Medium-tier breaker open | F02 + F04 + F05 + F06 fall back to small (Flash, no thinking) |
| Budget exceeded | 429 from `checkSessionBudget()` — independent of circuit breakers |

### 3.3 Current Reality (No Breakers)

The fitness codebase handles Gemini failures with try/catch + sandbox fallback. Example from `/api/fitness/chat` (server.ts lines 427–433):

```typescript
try {
  const response = await ai.models.generateContent({...});
  responseText = response.text || "...";
} catch (geminiErr) {
  console.error("Gemini chat failed:", geminiErr);
  responseText = "I'm here to help... (Gemini API unavailable — using fallback)";
}
```

This is graceful degradation — the user still gets a response — but it's not a circuit breaker. The failure isn't counted, no breaker opens, and the next request will try Gemini again (and likely fail again). With a circuit breaker, after 3 failures in 5 minutes the breaker opens and subsequent requests skip the Gemini call entirely (or fall back to a lower tier).

---

## 4. Designed Observability Endpoint (Not Yet Implemented)

### 4.1 `GET /api/budget` — Designed Response

```json
{
  "session_tokens_used": 45000,
  "session_budget": 200000,
  "session_remaining": 155000,
  "weekly_tokens_used": 180000,
  "weekly_tokens_budget": 1500000,
  "agent_breakdown": {
    "F00": 2000,
    "F01": 0,
    "F02": 15000,
    "F03": 0,
    "F04": 4000,
    "F05": 8000,
    "F06": 12000,
    "F07": 0,
    "F08": 0,
    "F09": 1500,
    "F10": 0,
    "F11": 2000
  },
  "circuit_breakers": [
    { "tier": "small", "status": "closed", "reason": null },
    { "tier": "medium", "status": "closed", "reason": null },
    { "tier": "capable", "status": "open", "reason": "3 Gemini Pro failures in 5 minutes" }
  ],
  "cache_stats": {
    "size": 12,
    "max": 100,
    "hit_rate_estimate": 0.18
  },
  "distillation_stats": {
    "level2_run_count": 2,
    "level3_run_count": 0,
    "level4_run_count": 0,
    "tokens_distilled_this_week": 40000
  }
}
```

### 4.2 What Each Field Would Track

| Field | Source | Update frequency |
|---|---|---|
| `session_tokens_used` | `sessionBudgets.get(sessionId).tokens_used` | Every Gemini call |
| `agent_breakdown` | Per-agent counters in `sessionBudgets` | Every Gemini call, tagged by agent ID |
| `weekly_tokens_used` | Rolling 7-day window counter | Every Gemini call, timestamped |
| `circuit_breakers` | `circuitBreakers` object in server.ts | When breaker opens/closes |
| `cache_stats` | `context-cache.ts` `getCacheStats()` | Every cache get/set |
| `distillation_stats` | `distillation-scheduler.ts` run counters | Every distillation run |

### 4.3 Current Reality

`/api/budget` does not exist. The fitness codebase has no endpoint that returns token usage, agent breakdown, or circuit breaker state. The existing `ObservabilityDashboard.tsx` component is wired to PolyVerses-style agent telemetry (not fitness agents) and would need to be rewired to call `/api/budget` and display fitness-specific metrics.

---

## 5. Designed Context Cache (Not Yet Implemented)

| Field | Designed Value | Current Reality |
|---|---|---|
| Store | In-memory `Map<string, CacheEntry>` in `context-cache.ts` | No cache — every call hits Gemini fresh |
| Max entries | 100 | N/A |
| TTL | 24 hours | N/A |
| Eviction | LRU — when full, remove 20% of least-recently-accessed | N/A |
| Key | `sessionId:hashed(userMessage + intent)` | N/A |
| Hit rate tracking | Approximation — `access_count > 1` counts as hit | N/A |

### 5.1 Where Cache Would Wrap the Fitness Agents

| Agent | Cache behavior | Cache key | TTL |
|---|---|---|---|
| F06 Coaching Chat | Cache response for repeated user message + session context | `sessionId:hash(userMessage)` | 24h |
| F04 Recovery Analyst | Cache score if wearable data snapshot hasn't changed | `uid:hash(wearableDataSnapshot)` | 24h |
| F02 Workout Generator | Cache plan if profile + date range haven't changed | `uid:hash(profileVersion + weekStart)` | 7 days |

### 5.2 What Would NOT Be Cached

- **F11 Compliance Gate** — safety-critical; every check must be fresh
- **F09 Motivation Coach** — tone should adapt to current user state; caching would make it stale
- **F10 Data Ingest** — ETL logic, no LLM call to cache
- **F01 Profile Validation** — profile changes infrequently but each validation should be fresh (contradictions can be subtle)

---

## 6. Designed Distillation Pipeline (Not Yet Implemented)

### 6.1 Schedules (Designed)

| Level | Cron | What it runs | Batch size | Model | Per-user cost |
|---|---|---|---|---|---|
| Level 2 (gist) | `"0 3 * * 0"` — Sunday 3am | Weekly fitness gist: volume trend, recovery trend, common exercises, check-in patterns, chat themes | All users with new data | Gemini 3.5 Flash | ~2K |
| Level 3 (summary) | `"0 4 1 * *"` — 1st of month 4am | Monthly fitness summary: progress toward goal, consistency score, recovery health, form concerns, nutrition patterns | Users with meaningful L2 patterns | Gemini 3.5 Flash | ~4K |
| Level 4 (principle) | `"0 5 1 1,4,7,10 *"` — 1st of Jan/Apr/Jul/Oct 5am | Atomic coaching principles: recurring patterns, stall points, proactive tip opportunities | Users with sustained L3 trends | Gemini 3.5 Flash (or Pro) | ~4K |

### 6.2 Storage (Designed)

| Level | Collection | Document shape |
|---|---|---|
| Level 2 | `users/{uid}/weeklyGists/{weekStartDate}` | `{ weekStart, weekEnd, gist, volumeTrend, recoveryTrend, topExercises, checkinPatterns, chatThemes, created_at }` |
| Level 3 | `users/{uid}/monthlySummaries/{month}` | `{ month, summary, progress toward goal, consistencyScore, recoveryHealth, formConcerns, nutritionPatterns, created_at }` |
| Level 4 | `users/{uid}/coachingPrinciples` | `[{ principle, context, created_at }]` — array attached to user profile |

### 6.3 Current Reality

The distillation scheduler does not exist. Fitness data accumulates in Firestore (workouts, check-ins, chat sessions, recovery assessments, wearable data) but is never summarized. A user who has been logging workouts for 6 months has 24+ workout documents + 24+ check-ins + dozens of chat messages — all raw, never distilled into a trend or insight.

---

## 7. Designed Knowledge Layer (Not Yet Implemented)

### 7.1 FitnessNote — Designed Data Model

```
FitnessNote {
  id: string (UUID)
  uid: string
  source_collection: 'workouts' | 'checkIns' | 'chatSessions' | 'recovery' | 'wearableData' | 'plans'
  source_doc_id: string
  source_type: 'workout_log' | 'check_in' | 'chat_message' | 'recovery_assessment' | 'wearable_snapshot' | 'weekly_plan'
  verbatim_text: string                    // Serialized source data
  classifier: FitnessClassifier
  para_bucket: 'Project' | 'Area' | 'Resource' | 'Archive'
  project_id?: string                     // e.g. "goal_build_muscle"
  distillation_level: 1 | 2 | 3 | 4
  gist?: string                           // Level 2
  summary?: string                        // Level 3
  principle?: string                      // Level 4
  created_at: string
  updated_at: string
  engagement_score: number
  graph_edges?: GraphEdge[]
}
```

### 7.2 How It Indexes Existing Firestore Collections

| Existing collection | Creates FitnessNote with... |
|---|---|
| `users/{uid}/workouts/{workoutId}` | `source_collection: "workouts"`, `source_type: "workout_log"`, `classifier.type: "workout"`, `entities: ["squat", "bench_press"]`, `project_id: "goal_build_muscle"` |
| `users/{uid}/checkIns/{checkInId}` | `source_collection: "checkIns"`, `source_type: "check_in"`, `classifier.type: "check_in"`, `decision_made: false` |
| `users/{uid}/chatSessions/{sessionId}/messages/{messageId}` | `source_collection: "chatSessions"`, `source_type: "chat_message"`, `classifier.type: "chat"`, `open_questions: ["how much protein?"]` |
| `users/{uid}/recovery/{assessmentId}` | `source_collection: "recovery"`, `source_type: "recovery_assessment"`, `classifier.type: "recovery"`, `decision_made: true` (if rest recommended) |
| `users/{uid}/wearableData/{source}/{timestamp}` | `source_collection: "wearableData"`, `source_type: "wearable_snapshot"`, `classifier.type: "recovery"` (feeds into recovery) |

### 7.3 Graph Edge Examples (Designed)

| Relationship | Example |
|---|---|
| `PART_OF_WEEK` | Monday workout → weekly plan it was part of |
| `FOLLOWS` | Check-in with low energy → workout that day |
| `RECOVERED_FROM` | Recovery assessment with "rest" → workout skipped that day |
| `PAIN_REPORTED_FOR` | Check-in pain report → exercise that caused it |
| `CITES` | Monthly summary → weekly gists it summarizes |

### 7.4 Current Reality

No FitnessNote collection exists. Firestore has the raw data collections (workouts, checkIns, chatSessions, recovery, wearableData, plans) but no indexed, classified, searchable layer on top. The user's fitness history is queryable only by direct Firestore queries on specific collections — you can't ask "when did I last hit a bench press PR?" without knowing which collection to query and what field to filter on.

---

## 8. Designed Governance API Endpoints (Not Yet Implemented)

### 8.1 `GET /api/budget` — Designed

See section 4.1 for full response shape. Returns session tokens, agent breakdown (F00–F11), circuit breaker state, cache stats, distillation stats. 0 tokens (no LLM call).

### 8.2 `POST /api/fitness/capture-note` — Designed

```
Body: { source_collection, source_doc_id, source_type, verbatim_text, uid }
Response: { note_id, classifier: FitnessClassifier, distillation_level: 1 }
Tokens: ~2K (Gemini 3.5 Flash classifier)
Flow:
  1. Budget check
  2. classifyAndExtract(verbatim_text, ai) → FitnessClassifier
  3. writeFitnessNote() → addDoc to users/{uid}/fitnessNotes
  4. recordTokenUsage(session_id, 2000)
```

### 8.3 `POST /api/fitness/think` — Designed

```
Body: { question, uid, context_scope?: 'hot' | 'warm' | 'cold' }
Response: { intent, answer?, assembled_context: { id, text, token_count },
            specialist?: 'F06 Coaching Chat' | 'F04 Recovery' | ...,
            model_tier, human_gate_required, session_id, budget, cached? }
Tokens: ~2K (query understanding) + ~2K (assembly) + 0 (cache hit)
Flow:
  1. Budget check
  2. Query understanding — classify intent (recall/synthesis/decision/clarify)
  3. Cache check — if hit, return cached context
  4. If recall: retrieve relevant FitnessNotes + assemble context → return as answer
  5. If synthesis/decision: retrieve + assemble → route to /api/fitness/specialist
```

### 8.4 `POST /api/fitness/specialist` — Designed

```
Body: { assembled_context_text, specialist: 'F06 Coaching Chat' | 'F04 Recovery' | ...,
        intent, question, uid }
Response: { output, agent_run_id, human_gate_required, human_gate_id?,
            model_tier, input_tokens, output_tokens }
Tokens: varies by agent + tier (1–15K typical)
Flow:
  1. Budget check
  2. Specialist invocation count check (max 10/session)
  3. Circuit breaker check
  4. Route to existing endpoint internally:
     - "F06" → call /api/fitness/chat with assembled context
     - "F04" → call /api/fitness/recovery
     - "F08" → call /api/fitness/nutrition
     - "F02" → call /api/fitness/generate-plan
  5. recordTokenUsage(session_id, input_tokens + output_tokens, true)
```

### 8.5 `POST /api/fitness/gates/:id/decide` — Designed

```
Body: { action: 'approve' | 'modify' | 'rerun' | 'cancel', comment?: string }
Response: { status: "SUCCESS", gate_id, action, comment?, session_id, budget }
Tokens: 0
Triggers:
  - F11 flags medical question → human gate before answering
  - F05 recommends significant program change → human gate before applying
  - F04 recommends "rest" for 3+ consecutive days → human gate to confirm
```

### 8.6 `POST /api/fitness/distill/batch` — Designed

```
Body: { level: 2 | 3 | 4, user_ids?: string[], uid?: string }
Response: { processed, upgraded, tokens_used, session_id, budget }
Tokens: batched — 2K/user for L2, 4K/user for L3/L4
Flow:
  1. Weekly distillation budget check
  2. Validate level
  3. Run distillation for specified users (or all if none specified)
  4. recordTokenUsage(session_id, total_tokens)
```

---

## 9. Designed Model Tier Routing (Not Yet Implemented)

| Tier | Model | Agents | Cost | Downgrade path |
|---|---|---|---|---|
| **small** | Gemini 3.5 Flash | F01, F03, F07, F08, F09, F11 | ~1–2K/call | Never — too cheap to worry about |
| **medium** | Gemini 3.5 Flash (reasoning) | F02, F04, F05, F06 | ~4–12K/call | Capable breaker open → fall back to small |
| **capable** | Gemini 3.5 Pro (if available) | F02 (high-quality plans), F06 (high-quality coaching) | ~12–20K/call | Capable breaker open → fall back to medium |

**Routing rule (designed):** F00 Orchestrator picks the tier based on request type. Chat and plan generation default to capable (highest quality). Recovery, adaptation, compliance default to medium. Profile, exercise lookup, form cues, nutrition default to small.

**Current reality:** the fitness codebase routes by agent, not by tier. F02 uses Flash Thinking, F06 uses Flash Thinking, F04 uses Flash Thinking, F01/F03/F07/F08/F09/F11 use Flash. There's no tier concept — each agent has a hardcoded model. The governance layer would introduce tiers and downgrade logic on top of the existing per-agent model assignments.

---

## 10. What's Hardcoded vs. Wired (Designed State)

| Field / Behavior | Designed | Current reality |
|---|---|---|
| `session_tokens_used` | Live from `sessionBudgets` Map | No tracking — don't exist |
| `session_budget` | 200,000 | No budget |
| `session_remaining` | Computed: `budget - used` | N/A |
| `weekly_tokens_used` | Rolling 7-day counter | No tracking |
| `weekly_tokens_budget` | 1,500,000 (designed) | No budget |
| `agent_breakdown` | Per-agent counters tagged on each Gemini call | No breakdown — no per-agent tracking |
| `circuit_breakers` | `circuitBreakers` object, updated on failure | No breakers — all would be "closed" since none exist |
| `cache_stats.size` | From `context-cache.ts` `cache.size` | No cache — would be 0 |
| `cache_stats.hit_rate_estimate` | From `context-cache.ts` hit rate approximation | No cache — would be 0 |
| `distillation_stats.level2_run_count` | From `distillation-scheduler.ts` run counter | No scheduler — would be 0 |
| `distillation_stats.tokens_distilled_this_week` | From scheduler `tokensUsed` accumulator | No scheduler — would be 0 |
| `x-session-id` header | Client generates on mount, sends on every request | Client doesn't send — each request gets new session ID |
| Token estimation | `ceil((prompt_len + response_len) / 4)` per Gemini call | No estimation — Gemini calls made without measuring |
| Per-agent token tagging | Each Gemini call tagged with agent ID (F01, F02, etc.) | No tagging — all Gemini calls anonymous |

---

## 11. Build Sequence — How to Implement This

**Phase 1 — Token tracking + session budget (wraps existing endpoints):**
1. Add `recordTokenUsage()`, `checkSessionBudget()`, `sessionBudgets` Map to server.ts
2. Add token estimation to every Gemini call in F00–F11
3. Add `checkSessionBudget()` before every Gemini call — 429 if exceeded
4. Add `GET /api/budget` endpoint — session tokens + agent breakdown
5. Add `x-session-id` header handling — client generates on mount

**Phase 2 — Circuit breakers + observability:**
1. Add `circuitBreakers` object + `checkCircuitBreaker()` + `openCircuitBreaker()`
2. Wire before every Gemini call — 429 if open for that tier
3. Add failure counting (3 failures/5min → open breaker)
4. Extend `/api/budget` with breaker status
5. Add tier downgrade (capable→medium→small)

**Phase 3 — Context cache:**
1. Add `src/context-cache.ts` (LRU, 24h TTL, 100 entries)
2. Wire into F06 (cache chat responses), F04 (cache recovery), F02 (cache plans)
3. Extend `/api/budget` with cache stats

**Phase 4 — Knowledge layer + distillation:**
1. Add `src/knowledge-types.ts` (FitnessNote, FitnessClassifier, GraphEdge)
2. Add `POST /api/fitness/capture-note` — indexes Firestore data
3. Wire into every write endpoint (log-workout, checkin, chat, recovery, plan)
4. Add `src/distillation-scheduler.ts` — cron jobs
5. Add `POST /api/fitness/distill/batch` — manual trigger

**Phase 5 — Human gate for health decisions:**
1. Extend F11 to trigger human gate for medical questions + plan changes
2. Add `POST /api/fitness/gates/:id/decide`
3. Wire human gate UI into coaching chat
4. Track human override rate (7-day window)

---

*Document version: 1.0 — Designed governance state for PolySync AI Fitness Coach. All governance features are designed but not yet implemented in code. The fitness agent mesh (F00–F11) and 16 endpoints are working; the governance layer is the next build phase.
