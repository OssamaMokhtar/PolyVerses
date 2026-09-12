# PolySync — Second Brain & Governance Architecture

> **AI Fitness Coach · Multi-Agent Orchestration Platform · Governance Layer v1.0 · 2026-09-12**

**Status:** Architecture document — governance layer designed for the PolySync fitness codebase.
**Scope:** Defines the token budget governance, distillation pipeline, context cache, and second-brain knowledge layer that sits ON TOP OF the existing 12-agent fitness mesh (F00–F11) documented in `ARCHITECTURE.md`.

The fitness codebase (`server.ts`) already has 16 API endpoints, 12 specialist agents with Gemini 3.5 Flash / Flash Thinking routing, Firestore per-user storage, and a compliance gate (F11). This document defines what governance — token budgets, circuit breakers, observability, scheduled distillation, context caching — would look like if layered on top of that existing mesh, following the same server-side Gemini + Firestore patterns already in use.

---

## 1. Why This Architecture

PolySync already has the agent mesh: F00 Orchestrator Router, F01 Profile, F02 Workout Generator, F03 Exercise Library, F04 Recovery Analyst, F05 Plan Adaptor, F06 Coaching Chat, F07 Form Coach, F08 Nutrition Advisor, F09 Motivation Coach, F10 Data Ingest, F11 Compliance Gate. Each agent makes one or more Gemini calls per request. What the codebase lacks is:

- **Token budget enforcement** — no session budget, no per-tier circuit breaker, no observability endpoint that tells the developer how many tokens a session is burning
- **Scheduled distillation** — workout logs, chat histories, check-ins, and recovery assessments accumulate in Firestore but are never summarized or distilled into reusable patterns
- **Context caching** — the same question ("what's my recovery score?") triggers a fresh Gemini call every time; there's no cache layer for repeated queries
- **A knowledge layer** — the user's fitness data lives in Firestore collections but there's no classifier, no PARA-like organization, no progressive summarization that turns raw workout logs into insights ("you consistently skip leg day when HRV is below 30")

This document defines those layers as a governance and knowledge add-on that respects the existing fitness agent mesh — it doesn't replace F00–F11, it wraps them with budget controls and adds a distillation + cache layer that makes the accumulated fitness data discoverable and actionable over time.

---

## 2. The Governance Layer — Where It Sits

```
                        ┌─────────────────────────────────────┐
                        │         GOVERNANCE LAYER              │
                        │  Token budgets · circuit breakers    │
                        │  Observability · override tracking   │
                        │  Context cache · distillation        │
                        └──────────────┬──────────────────────┘
                                       │ policy signals (budget OK / 429 / downgrade)
          ┌────────────────────────────┼────────────────────────────┐
          ▼                            ▼                            ▼
┌──────────────────┐    ┌──────────────────────────┐    ┌──────────────────────┐
│  FITNESS AGENT   │    │  KNOWLEDGE LAYER          │    │  DISTILLATION +      │
│  MESH (existing) │    │  (new — wraps Firestore)  │    │  CACHE (new)         │
│                  │    │                          │    │                      │
│ F00 Orchestrator │    │ Capture → Classify →     │    │ Weekly: Level 2 gist │
│ F01 Profile      │    │ Store → Retrieve →       │    │ Monthly: Level 3     │
│ F02 Workout Gen  │    │ Assemble → Route         │    │ summary              │
│ F03 Exercise Lib │    │                          │    │ Quarterly: Level 4   │
│ F04 Recovery     │    │ Wraps: workouts, logs,   │    │ principle            │
│ F05 Plan Adaptor │    │ checkIns, chatSessions,  │    │                      │
│ F06 Coaching Chat│    │ recovery, wearableData   │    │ Cache: assembled     │
│ F07 Form Coach   │    │                          │    │ contexts, 24h TTL    │
│ F08 Nutrition    │    │                          │    │                      │
│ F09 Motivation   │    │                          │    │                      │
│ F10 Data Ingest  │    │                          │    │                      │
│ F11 Compliance   │    │                          │    │                      │
└──────────────────┘    └──────────────────────────┘    └──────────────────────┘
         │                       │                              │
         └───────────────────────┼──────────────────────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │   FIREBASE (Auth +     │
                    │   Firestore per-user)  │
                    └────────────────────────┘
```

**The discipline:** The fitness agent mesh handles coaching requests. The governance layer tracks how many tokens each request burns, enforces session budgets, caches repeated queries, and periodically distills accumulated fitness data into summarized insights. The knowledge layer organizes the Firestore collections into a classified, searchable, progressively-summarized brain.

---

## 3. Agent Mesh — Token Cost Profile (Existing + Estimated)

| Agent | Gemini model | Typical call | Estimated tokens/call | Volume profile |
|---|---|---|---|---|
| **F00 Orchestrator** | Flash | Route request to agent(s) | ~1K (routing logic) | Every user request |
| **F01 Profile** | Flash | Validate + structure profile | ~2K | Once per onboarding/update |
| **F02 Workout Generator** | Flash Thinking / Pro | Generate weekly plan | ~8–15K (reasoning over exercise library) | Weekly per user |
| **F03 Exercise Library** | Flash | Lookup + substitution | ~1K (mostly lookup) | Per substitution query |
| **F04 Recovery Analyst** | Flash Thinking | Compute recovery score | ~2K (reasoning over wearables + check-ins) | Daily per active user |
| **F05 Plan Adaptor** | Flash Thinking | Adapt next week's plan | ~4–8K (reasoning over workout logs) | End of week per user |
| **F06 Coaching Chat** | Flash Thinking / Pro | Conversational response | ~4–12K (depends on context size) | Every chat message |
| **F07 Form Coach** | Flash | Form cues for exercise | ~1–2K | Per form question |
| **F08 Nutrition Advisor** | Flash | Nutrition guidance | ~2–4K | Per nutrition question |
| **F09 Motivation Coach** | Flash | Sentiment + motivational message | ~1–2K | Per check-in / daily digest |
| **F10 Data Ingest** | None (ETL) | Normalize wearable payload | 0 LLM tokens | Per webhook |
| **F11 Compliance Gate** | Flash Thinking | Safety check + disclaimer | ~2K | Per plan generation / medical query |

**Token cost summary (per active user per week, rough estimate):**
- F00 routing: 7 days × 5 requests/day × 1K = 35K
- F02 weekly plan: 15K
- F04 daily recovery: 7 × 2K = 14K
- F06 coaching chat: 7 days × 3 messages/day × 6K = 126K
- F09 motivation: 7 × 1.5K = 10.5K
- F11 compliance: 15K (per plan generation)
- **Total: ~215K tokens/user/week for a moderately active user**

**This is the number the governance layer needs to track and enforce.** A user who chats heavily with F06 can burn 100K+ tokens in a single session. Without a session budget, there's no ceiling.

---

## 4. Session Token Budget (New — Wraps All Fitness Endpoints)

| Field | Value |
|---|---|
| Budget | 200,000 tokens per session |
| Tracked via | In-memory `Map<sessionId, { tokens_used, started_at, specialist_invocations }>` |
| Session ID | `x-session-id` header, or `uuidv4()` if absent |
| Check point | Every `/api/fitness/*` endpoint + `/api/evaluate` |
| Exceeded behavior | 429 with `error: "Session token budget exceeded"`, `session_id`, `budget` snapshot |
| Warning threshold | >50% used AND <20% remaining → include `reason` in budget response, do NOT block |
| Reset | On server restart (in-memory) |

**How it wraps the existing endpoints:** every fitness endpoint that makes a Gemini call (`/api/fitness/chat`, `/api/fitness/generate-plan`, `/api/fitness/recovery`, `/api/fitness/nutrition`, `/api/fitness/form-cue`, `/api/fitness/adapt-plan`, `/api/evaluate`) would call `recordTokenUsage(session_id, estimated_tokens)` before and after the Gemini call, and `checkSessionBudget(session_id)` before the call to decide whether to proceed or return 429.

**Implementation pattern (same as second-brain server.ts):**
```typescript
function checkSessionBudget(sessionId: string): { available: boolean; remaining: number; reason?: string } {
  const { tokens_used } = getSessionBudget(sessionId);
  const remaining = SESSION_BUDGET - tokens_used;
  if (remaining <= 0) return { available: false, remaining: 0, reason: "Session token budget exceeded." };
  if (tokens_used > SESSION_BUDGET * 0.5 && remaining < SESSION_BUDGET * 0.2)
    return { available: true, remaining, reason: "Over 50% of session budget used." };
  return { available: true, remaining, reason: undefined };
}
```

**Current gap:** the fitness `server.ts` does not track tokens at all. Every Gemini call is made without recording input/output token counts. The governance layer would add token estimation (`ceil((prompt_length + response_length) / 4)`) and session tracking to every endpoint.

---

## 5. Circuit Breakers (New — Per Model Tier)

| Tier | Model | Used by | Breaker behavior |
|---|---|---|---|
| **small** | Gemini 3.5 Flash / Flash | F01, F03, F07, F08, F09, F11 (light calls) | Opens on repeated failures; falls back to sandbox |
| **medium** | Gemini 3.5 Flash (reasoning) | F02, F04, F05, F06 (medium reasoning) | Opens on repeated failures; falls back to Flash without thinking |
| **capable** | Gemini 3.5 Pro (if available) | F02, F06 (high-quality coaching) | Opens on failure; falls back to Flash Thinking |

**Current behavior in the fitness codebase:** there are no circuit breakers. If Gemini fails, the endpoint catches the error and returns a sandbox fallback message (e.g., `/api/fitness/chat` line 427–433: `catch (geminiErr) { responseText = "I'm here to help... (Gemini API unavailable — using fallback)" }`). This is graceful degradation but not a circuit breaker — it doesn't track failure rate, doesn't open a breaker to stop repeated failing calls, and doesn't downgrade tiers.

**Governance layer circuit breaker:**
```typescript
const circuitBreakers = {
  small:   { status: 'closed', opened_at: null, reason: undefined },
  medium:  { status: 'closed', opened_at: null, reason: undefined },
  capable: { status: 'closed', opened_at: null, reason: undefined },
};

function checkCircuitBreaker(tier: 'small' | 'medium' | 'capable'): boolean {
  return circuitBreakers[tier].status === 'closed';
}

function openCircuitBreaker(tier: 'small' | 'medium' | 'capable', reason: string) {
  circuitBreakers[tier].status = 'open';
  circuitBreakers[tier].opened_at = new Date().toISOString();
  circuitBreakers[tier].reason = reason;
}
```

**Triggered when:** a single agent's Gemini call fails 3 times in a 5-minute window for the same tier. The breaker opens, subsequent calls to that tier return 429, and the endpoint falls back to a lower tier or sandbox.

---

## 6. Observability Endpoint (New — `/api/budget`)

```
GET /api/budget
Response: {
  session_tokens_used: number,
  session_budget: 200000,
  session_remaining: number,
  weekly_tokens_used: number,         // New: rolling 7-day window
  weekly_tokens_budget: 1500000,      // New: 1.5M tokens/week per user (estimate)
  agent_breakdown: {                  // New: tokens per agent this session
    F00: number, F01: number, F02: number, F03: number,
    F04: number, F05: number, F06: number, F07: number,
    F08: number, F09: number, F10: 0, F11: number
  },
  circuit_breakers: [
    { tier: "small", status: "closed", reason?: string },
    { tier: "medium", status: "closed", reason?: string },
    { tier: "capable", status: "closed", reason?: string }
  ],
  cache_stats: {
    size: number,                      // From context-cache.ts
    max: 100,
    hit_rate_estimate: number
  },
  distillation_stats: {
    level2_run_count: number,          // From distillation-scheduler.ts
    level3_run_count: number,
    level4_run_count: number,
    tokens_distilled_this_week: number
  }
}
```

**What this gives the developer:** a single endpoint that shows how many tokens each agent is burning, whether circuit breakers are open, cache hit rate, and distillation activity. This is the fitness equivalent of the second-brain `/api/budget` endpoint — same shape, fitness-specific agent names.

**Current gap:** the fitness codebase has no observability endpoint. The `ObservabilityDashboard.tsx` component exists in the React app but it's wired to the PolyVerses agent telemetry, not the fitness agents. The governance layer would add the backend endpoint and rewire the dashboard to show fitness agent token usage.

---

## 7. Context Cache (New — Wraps F06 Coaching Chat and F04 Recovery)

| Field | Value |
|---|---|
| Store | In-memory `Map<string, CacheEntry>` |
| Max entries | 100 |
| TTL | 24 hours |
| Eviction | LRU — when full, remove 20% of least-recently-accessed |
| Key | `sessionId:hashed(userMessage + intent)` |
| Hit rate tracking | Approximation — access_count > 1 counts as hit |

**What it caches:** the assembled context for repeated coaching questions. If a user asks "how's my recovery?" on Monday morning and again on Monday evening, the second call hits the cache instead of re-fetching wearable data + recomputing the recovery score + calling Gemini.

**Where it wraps the existing agents:**
- **F06 Coaching Chat:** cache the last response for a given user message + session context. If the user re-asks the same question within 24 hours, return the cached response instead of calling Gemini again.
- **F04 Recovery Analyst:** cache the recovery score + recommendation for a given wearable data snapshot. If the wearable data hasn't changed since the last recovery check, return the cached score.
- **F02 Workout Generator:** cache the generated plan for a given profile + date range. If the profile hasn't changed and it's the same week, return the cached plan.

**Not cached:** F11 Compliance Gate (safety-critical — every check must be fresh), F09 Motivation Coach (tone should adapt to current user state), F10 Data Ingest (ETL, no LLM call to cache).

---

## 8. Distillation Pipeline (New — Weekly Summarization of Fitness Data)

PolySync accumulates a lot of time-series fitness data: workout logs (sets, reps, weight per exercise), check-ins (energy, mood, pain, motivation), chat histories (coaching conversations), recovery assessments (scores + factors), and wearable data snapshots (sleep, HRV, RHR, steps). This data is stored in Firestore but never summarized. The distillation pipeline turns it into progressively-higher-level insights.

```
Every data point starts at Level 1 (raw capture)
  - Workout log entry: verbatim sets/reps/weight
  - Check-in: verbatim energy/mood/pain/motivation scores
  - Chat message: verbatim conversation text
  - Recovery assessment: verbatim score + factors

Weekly batch job (cron: "0 3 * * 0" — Sunday 3am):
  For each user with new Level 1 data in the past week:
    → [Gemini 3.5 Flash — small tier]              ~2K per user
       Produce a "weekly fitness gist":
       - Training volume trend (up/down/stable)
       - Recovery trend (improving/declining)
       - Most common exercise / muscle group worked
       - Notable check-in patterns (low energy days, pain reports)
       - Chat themes (what the user asked about most)
       Upgrade data to Level 2 (gist attached to user's weekly summary)

Monthly batch job (cron: "0 4 1 * *" — 1st of month 4am):
  For each user whose Level 2 weekly gists show meaningful patterns:
    → [Gemini 3.5 Flash — medium tier]             ~4K per user
       Produce a "monthly fitness summary":
       - Progress toward goal (strength gains, weight trend, endurance improvement)
       - Consistency score (workouts completed vs planned)
       - Recovery health (average recovery score, days rest taken)
       - Form concerns (recurring pain reports, common substitution patterns)
       - Nutrition patterns (common questions, recurring themes)
       Upgrade data to Level 3 (summary attached to user's monthly record)

Quarterly batch job (cron: "0 5 1 1,4,7,10 *" — 1st of Jan/Apr/Jul/Oct 5am):
  For each user whose Level 3 monthly summaries show sustained trends:
    → [Gemini 3.5 Flash — could escalate to Pro]   ~4K per user
       Extract atomic fitness principles:
       - "This user consistently underperforms on leg day when HRV < 30 — consider auto-suggesting rest"
       - "This user's progression stalls after 4 weeks on the same program — suggest deload week"
       - "This user asks about nutrition every Monday — consider proactive Monday nutrition tip"
       Mark as "atomic insight" — reusable coaching rules that F00 can apply on future requests
       Upgrade data to Level 4 (principle attached to user's coaching profile)
```

**Token budget for distillation (per 100 users):**
- Level 2 (weekly, ~100 users): 100 × 2K = 200K/week
- Level 3 (monthly, ~30 high-engagement users): 30 × 4K = 120K/month ≈ 30K/week average
- Level 4 (quarterly, ~10 users with sustained patterns): 10 × 4K = 40K/quarter ≈ 3K/week average
- **Total: ~233K tokens/week for 100 users**, all batched on cheap models

**Controller field:** `distillation_level` is set server-side by the scheduler, never from the client. The batch endpoint accepts `level` and `user_ids` but the actual write is gated.

**Where it stores results:**
- Level 2 gists: `users/{uid}/weeklyGists/{weekStartDate}` — one document per week
- Level 3 summaries: `users/{uid}/monthlySummaries/{month}` — one document per month
- Level 4 principles: `users/{uid}/coachingPrinciples` — array of atomic insights attached to user profile

---

## 9. Knowledge Layer — Fitness Data Model (New — Organizes Firestore Collections)

### 9.1 FitnessNote (the atomic unit — wraps existing collections)

```
FitnessNote {
  id: string (UUID)
  uid: string                              // Firestore user ID
  source_collection: 'workouts' | 'checkIns' | 'chatSessions' | 'recovery' | 'wearableData' | 'plans'
  source_doc_id: string                    // Original Firestore doc ID
  source_type: 'workout_log' | 'check_in' | 'chat_message' | 'recovery_assessment' | 'wearable_snapshot' | 'weekly_plan'
  verbatim_text: string                    // Serialized representation of the source data
  classifier: FitnessClassifier            // Type, entities, date, decision_made, open_questions
  para_bucket: 'Project' | 'Area' | 'Resource' | 'Archive'
  project_id?: string                      // e.g. "goal_build_muscle" — bucket by goal
  distillation_level: 1 | 2 | 3 | 4
  gist?: string                            // Level 2 — 2-line summary
  summary?: string                         // Level 3 — monthly summary
  principle?: string                       // Level 4 — atomic coaching insight
  created_at: string
  updated_at: string
  engagement_score: number                 // Retrieval + citation tally
  graph_edges?: GraphEdge[]                // Links to related notes (same workout, same week, same goal)
}
```

### 9.2 FitnessClassifier

```
FitnessClassifier {
  type: 'workout' | 'check_in' | 'chat' | 'recovery' | 'nutrition' | 'form' | 'motivation' | 'plan'
  entities: string[]                       // Exercises mentioned, body parts, supplements, goals
  date: string?                            // Date of the workout / check-in / message
  decision_made: boolean                   // True if the note records a coaching decision (plan change, rest recommendation)
  open_questions: string[]                 // Questions the user asked that weren't fully answered
}
```

### 9.3 GraphEdge (links related fitness data)

```
GraphEdge {
  target_type: 'note' | 'workout' | 'exercise' | 'goal' | 'check_in' | 'recovery'
  target_id: string
  relation: 'PART_OF_WEEK' | 'FOLLOWS' | 'CITES' | 'RELATED_TO' | 'RECOVERED_FROM' | 'PAIN_REPORTED_FOR'
  direction: 'outgoing' | 'incoming'
}
```

**Example graph relationships:**
- A workout log on Monday links to the weekly plan it was part of (`PART_OF_WEEK`)
- A check-in with low energy links to the workout that day (`FOLLOWS`)
- A recovery assessment with "rest" recommendation links to the workout skipped that day (`RECOVERED_FROM`)
- A pain report in a check-in links to the exercise that caused it (`PAIN_REPORTED_FOR`)

### 9.4 How It Wraps Existing Firestore Collections

The knowledge layer doesn't replace the existing collections — it indexes them. Every time a new document is written to `users/{uid}/workouts`, `users/{uid}/checkIns`, `users/{uid}/chatSessions`, `users/{uid}/recovery`, or `users/{uid}/wearableData`, a corresponding `FitnessNote` is created in a new `fitnessNotes` collection (or a subcollection `users/{uid}/fitnessNotes`). The `FitnessNote` is a metadata + classification layer on top of the raw data.

```
Existing: users/{uid}/workouts/{workoutId}
  → New index: users/{uid}/fitnessNotes/{noteId}
    source_collection: "workouts"
    source_doc_id: workoutId
    source_type: "workout_log"
    verbatim_text: JSON.stringify(workoutData)
    classifier: { type: "workout", entities: ["squat", "bench_press"], ... }
    para_bucket: "Project"   // bucketed by goal
    project_id: "goal_build_muscle"

Existing: users/{uid}/checkIns/{checkInId}
  → New index: users/{uid}/fitnessNotes/{noteId}
    source_collection: "checkIns"
    source_type: "check_in"
    classifier: { type: "check_in", entities: [], decision_made: false, ... }

Existing: users/{uid}/chatSessions/{sessionId}/messages/{messageId}
  → New index: users/{uid}/fitnessNotes/{noteId}
    source_collection: "chatSessions"
    source_type: "chat_message"
    verbatim_text: messageContent
    classifier: { type: "chat", entities: ["squat", "protein"], open_questions: ["how much protein?"] }
```

---

## 10. API Surface — Governance Endpoints (New, Wrapping Existing Fitness API)

### 10.1 Budget (New)

```
GET /api/budget
Response: { session_tokens_used, session_budget: 200000, session_remaining,
            weekly_tokens_used, weekly_tokens_budget: 1500000,
            agent_breakdown: { F00: n, F01: n, ... F11: n },
            circuit_breakers: [{ tier, status, reason? }],
            cache_stats: { size, max: 100, hit_rate_estimate },
            distillation_stats: { level2_run_count, level3_run_count, level4_run_count,
                                  tokens_distilled_this_week } }
Tokens: 0 (no LLM call — reads in-memory state)
```

### 10.2 Capture Fitness Note (New — Indexes Existing Data)

```
POST /api/fitness/capture-note
Body: { source_collection: string, source_doc_id: string, source_type: string,
        verbatim_text: string, uid: string }
Response: { note_id: string, classifier: FitnessClassifier, distillation_level: 1 }
Tokens: ~2K (classifier call to Gemini 3.5 Flash)
Flow:
  1. Budget check
  2. classifyAndExtract(verbatim_text, ai) → FitnessClassifier
  3. writeFitnessNote({ ... }) → addDoc to users/{uid}/fitnessNotes
  4. recordTokenUsage(session_id, 2000)
  5. Return note_id + classifier
```

### 10.3 Query Fitness Brain (New — Recall from Indexed Data)

```
POST /api/fitness/think
Body: { question: string, uid: string, context_scope?: 'hot' | 'warm' | 'cold' }
Response: { intent: 'recall' | 'synthesis' | 'decision' | 'clarify',
            answer?: string,                           // If recall — answered from context
            assembled_context: { id, text, token_count },
            specialist?: 'F06 Coaching Chat' | 'F04 Recovery' | 'F08 Nutrition' | ...,
            model_tier: 'small' | 'medium' | 'capable',
            human_gate_required: boolean,             // True if medical/health question
            session_id, budget, cached? }
Tokens: ~2K (query understanding) + ~2K (context assembly) + 0 (cache hit)
Flow:
  1. Budget check
  2. Query understanding — classify intent
  3. Cache check — if hit, return cached context
  4. If recall: retrieve relevant fitness notes + assemble context → return as answer
  5. If synthesis/decision: retrieve + assemble → route to specialist endpoint
```

### 10.4 Invoke Fitness Specialist (New — Wraps Existing Agent Endpoints)

```
POST /api/fitness/specialist
Body: { assembled_context_text: string, specialist: string,   // "F06 Coaching Chat" etc.
        intent: 'synthesis' | 'decision', question: string, uid: string }
Response: { output: string, agent_run_id: string,
            human_gate_required: boolean,                     // True if medical/health
            human_gate_id?: string, model_tier: string,
            input_tokens: number, output_tokens: number }
Tokens: varies by agent + model tier (1–15K typical)
Flow:
  1. Budget check
  2. Specialist invocation count check (max 10/session)
  3. Circuit breaker check
  4. Route to the appropriate existing endpoint:
     - "F06 Coaching Chat" → call /api/fitness/chat internally with assembled context
     - "F04 Recovery" → call /api/fitness/recovery internally
     - "F08 Nutrition" → call /api/fitness/nutrition internally
     - "F02 Workout Generator" → call /api/fitness/generate-plan internally
  5. recordTokenUsage(session_id, input_tokens + output_tokens, true)
  6. Return output + agent_run_id + human_gate info
```

### 10.5 Human Gate (New — For Medical/Health Decisions)

```
POST /api/fitness/gates/:gate_id/decide
Body: { action: 'approve' | 'modify' | 'rerun' | 'cancel', comment?: string }
Response: { status: "SUCCESS", gate_id, action, comment?, session_id, budget }
Tokens: 0
Triggers:
  - F11 Compliance Gate flags a medical question → human gate before answering
  - F05 Plan Adaptor recommends a significant program change → human gate before applying
  - F04 Recovery Analyst recommends "rest" for 3+ consecutive days → human gate to confirm
```

### 10.6 Distillation Batch (New — Manual Trigger)

```
POST /api/fitness/distill/batch
Body: { level: 2 | 3 | 4, user_ids?: string[], uid?: string }
Response: { processed: number, upgraded: number, tokens_used: number, session_id, budget }
Tokens: batched, per-user cost depends on level (2K for L2, 4K for L3/L4)
Flow:
  1. Budget check (weekly distillation budget)
  2. Validate level
  3. Run distillation for specified users (or all users if none specified)
  4. recordTokenUsage(session_id, total_tokens)
  5. Return processed + upgraded counts
Note: Scheduled distillation runs via cron in distillation-scheduler.ts. This endpoint is a manual trigger.
```

### 10.7 Existing Fitness Endpoints — Governance Wrapper (Not Yet Implemented)

The existing 16 fitness endpoints would each get a governance wrapper:

| Existing endpoint | Governance added |
|---|---|
| POST /api/fitness/profile | Token tracking (~2K per call) |
| GET /api/fitness/profile | No Gemini call — no token tracking needed |
| POST /api/fitness/generate-plan | Token tracking (~8–15K) + circuit breaker on F02 tier |
| GET /api/fitness/plan | Cache check — if plan hasn't changed, return cached |
| POST /api/fitness/log-workout | Token tracking (if adaptation triggered) + triggers fitness note capture |
| POST /api/fitness/adapt-plan | Token tracking (~4–8K) + human gate if major change |
| POST /api/fitness/chat | Token tracking (~4–12K) + cache check + human gate if medical |
| POST /api/fitness/recovery | Token tracking (~2K) + cache check if wearable data unchanged |
| POST /api/fitness/nutrition | Token tracking (~2–4K) + human gate if medical |
| POST /api/fitness/form-cue | Token tracking (~1–2K) |
| POST /api/fitness/substitute | No Gemini call — lookup only, no token tracking |
| POST /api/fitness/checkin | Token tracking (if sentiment analysis triggered) + triggers fitness note capture + F09 motivation |
| POST /api/fitness/webhook/healthkit | No Gemini call — ETL, no token tracking |
| POST /api/fitness/webhook/googlefit | No Gemini call — ETL, no token tracking |
| GET /api/fitness/progress | No Gemini call — aggregation only, no token tracking |
| POST /api/fitness/consent | No Gemini call — bookkeeping, no token tracking |

---

## 11. Data Flow — Governance Wrapping a Coaching Chat Request

```
User sends message in Coach Chat
    → POST /api/fitness/chat (F06)
    → Governance layer intercepts:
        1. Extract session_id from x-session-id header (or generate uuid)
        2. checkSessionBudget(session_id) → if exceeded, 429 immediately
        3. checkCircuitBreaker('medium') → if open, 429 or downgrade to small
        4. getCachedContext(userMessage, 'chat') → if hit, return cached response
    → F06 proceeds:
        a. Fetch profile, recent workouts, current plan, latest recovery score
        b. Build fullPrompt with context
        c. Gemini generateContent (Flash Thinking)
        d. recordTokenUsage(session_id, ceil((prompt_len + response_len) / 4), true)
        e. setCachedContext(userMessage, 'chat', responseText, token_count)
    → Save message to Firestore: users/{uid}/chatSessions/{sessionId}/messages
    → Governance layer also:
        f. Create FitnessNote in users/{uid}/fitnessNotes (indexes the chat message)
        g. If medical question detected → route through F11 → human gate
    → Response returned to client
```

---

## 12. Data Flow — Governance Wrapping a Workout Log + Adaptation

```
User logs workout
    → POST /api/fitness/log-workout (F05)
    → Governance layer:
        1. checkSessionBudget → proceed or 429
        2. recordTokenUsage(session_id, 0)   // workout log itself is 0 tokens
    → F05 proceeds:
        a. Save workout to Firestore: users/{uid}/workouts/{workoutId}
        b. Trigger generateAdaptation(uid, workout) → Gemini call (~4–8K)
        c. recordTokenUsage(session_id, estimated_adaptation_tokens, true)
        d. Return adaptedPlan
    → Governance layer also:
        e. Create FitnessNote for the workout log (indexes sets/reps/weight)
        f. If adaptation changed the plan significantly → create FitnessNote for the plan change (classifier: decision_made: true)
```

---

## 13. Model Tier Routing — Fitness-Specific

| Tier | Model | Fitness agents using it | Token cost | When downgraded |
|---|---|---|---|---|
| **small** | Gemini 3.5 Flash | F01, F03, F07, F08, F09, F11 (light calls) | ~1–2K/call | Never — too cheap to worry about |
| **medium** | Gemini 3.5 Flash (with reasoning) | F02, F04, F05, F06 (reasoning calls) | ~4–12K/call | Circuit breaker opens → fall back to Flash without thinking |
| **capable** | Gemini 3.5 Pro (if available) | F02 (high-quality plan generation), F06 (high-quality coaching) | ~12–20K/call | Circuit breaker opens → fall back to Flash Thinking |

**Routing rule:** the F00 Orchestrator picks the tier based on the request type. Chat and plan generation default to capable (highest quality). Recovery, adaptation, and compliance default to medium. Profile validation, exercise lookup, form cues, and nutrition default to small.

**Downgrade path:** if capable tier circuit breaker is open, F02 and F06 fall back to medium (Flash Thinking). If medium breaker is open, they fall back to small (Flash, no thinking). The quality degrades but the service continues.

---

## 14. Implementation Status

### What Exists in the Codebase (Remote — origin/main)

| Component | Status | Location |
|---|---|---|
| 12-agent fitness mesh (F00–F11) | Implemented | server.ts lines 1–1224 |
| 16 fitness API endpoints | Implemented | server.ts — POST /api/fitness/*, GET /api/fitness/* |
| Firebase Auth + Firestore per-user storage | Implemented | src/firebase.ts, firestore.rules |
| Gemini 3.5 Flash / Flash Thinking routing | Implemented | server.ts — ai.models.generateContent with model per agent |
| Sandbox fallback | Implemented | server.ts — if (!ai) return sandbox message |
| ExerciseLibrary.ts (bundled exercise data) | Implemented | src/ExerciseLibrary.ts (referenced in server.ts) |
| D3 agent network diagram + heatmap | Implemented | OrchestrationConsole.tsx, D3Heatmap.tsx |
| Recharts progress/retention charts | Implemented | RechartsHeatmap.tsx |
| Observability dashboard (PolyVerses-style) | Implemented | ObservabilityDashboard.tsx |
| Human gate UI (compliance gate) | Implemented | gates/ (referenced in architecture) |
| Prompt console (agent system prompts) | Implemented | PromptConsole.tsx |
| FitnessOnboarding flow | Implemented | FitnessOnboarding.tsx |
| RBAC (user/premium/elite tiers) | Documented in architecture | Not yet implemented in code |

### What's Missing (Governance Layer — This Document)

| Component | Status | Location |
|---|---|---|
| Session token budget (200K) | Not implemented | Would wrap every /api/fitness/* endpoint |
| Circuit breakers (small/medium/capable) | Not implemented | Would wrap Gemini calls in each endpoint |
| Observability endpoint (/api/budget) | Not implemented | New endpoint — returns session + agent + cache + distillation stats |
| Context cache (24h TTL, 100 entries) | Not implemented | src/context-cache.ts — same as second-brain version |
| Distillation scheduler (weekly/monthly/quarterly) | Not implemented | src/distillation-scheduler.ts — same as second-brain version |
| Knowledge layer (FitnessNote, FitnessClassifier) | Not implemented | src/knowledge-types.ts — fitness-adapted data model |
| Fitness note capture endpoint (/api/fitness/capture-note) | Not implemented | New endpoint — indexes existing Firestore data |
| Fitness think endpoint (/api/fitness/think) | Not implemented | New endpoint — recall from indexed fitness data |
| Fitness specialist endpoint (/api/fitness/specialist) | Not implemented | New endpoint — wraps existing F00–F11 agents with governance |
| Human gate for medical/health decisions | Partially implemented (F11 exists) | F11 does safety checks but no human gate UI for plan changes |
| Token tracking in existing endpoints | Not implemented | Every Gemini call in server.ts would need recordTokenUsage |
| Agent breakdown in observability | Not implemented | Would need per-agent token counters |
| Weekly distillation budget tracking | Not implemented | Would need weekly token counter for distillation runs |

---

## 15. Build Sequence (How to Layer Governance On Top of Existing Fitness Codebase)

**Phase 1 — Token tracking + session budget (wraps existing endpoints):**
1. Add `recordTokenUsage()`, `checkSessionBudget()`, `sessionBudgets` Map to server.ts
2. Add token estimation to every Gemini call in F00–F11 (estimate `ceil((prompt_len + response_len) / 4)`)
3. Add `checkSessionBudget()` check before every Gemini call — return 429 if exceeded
4. Add `GET /api/budget` endpoint — returns session tokens used/remaining + agent breakdown
5. Add `x-session-id` header handling — client generates session ID on app mount

**Phase 2 — Circuit breakers + observability:**
1. Add `circuitBreakers` object + `checkCircuitBreaker()` + `openCircuitBreaker()` to server.ts
2. Wire circuit breaker check before every Gemini call — return 429 if open for that tier
3. Add failure counting per tier (3 failures in 5 minutes → open breaker)
4. Extend `/api/budget` to include circuit breaker status
5. Add tier downgrade logic — if capable breaker open, F02/F06 fall back to medium

**Phase 3 — Context cache:**
1. Add `src/context-cache.ts` (same as second-brain version — LRU, 24h TTL, 100 entries)
2. Wire cache check into F06 Coaching Chat — cache response for repeated user messages
3. Wire cache check into F04 Recovery — cache score if wearable data unchanged
4. Wire cache check into F02 Workout Generator — cache plan if profile unchanged
5. Extend `/api/budget` to include cache stats

**Phase 4 — Knowledge layer + distillation:**
1. Add `src/knowledge-types.ts` — FitnessNote, FitnessClassifier, GraphEdge interfaces
2. Add `POST /api/fitness/capture-note` — indexes existing Firestore data with classifier
3. Wire capture-note call into every write endpoint (log-workout, checkin, chat, recovery, plan generation)
4. Add `src/distillation-scheduler.ts` — weekly/monthly/quarterly cron jobs
5. Add `POST /api/fitness/distill/batch` — manual trigger
6. Add Level 2/3/4 storage collections (weeklyGists, monthlySummaries, coachingPrinciples)

**Phase 5 — Human gate for health decisions:**
1. Extend F11 Compliance Gate to trigger human gate for medical questions + significant plan changes
2. Add `POST /api/fitness/gates/:id/decide` endpoint
3. Wire human gate UI into the coaching chat flow (when F11 flags a medical question)
4. Track human override rate — compute override % over 7-day window

---

## 16. What This Makes Possible

1. **Token budget visibility.** The developer can call `GET /api/budget` and see exactly how many tokens each agent is burning per session. If F06 Coaching Chat is burning 120K tokens/week for a single user, that's visible and actionable.

2. **Session budget enforcement.** A heavy chat user who sends 50 messages in a session hits the 200K budget and gets a 429 — the app doesn't silently burn 500K tokens. The user sees "session budget exceeded — please wait for session reset."

3. **Circuit breaker safety.** If Gemini 3.5 Pro starts failing for F02 Workout Generator, the capable-tier breaker opens after 3 failures in 5 minutes. Subsequent plan generation requests fall back to Flash Thinking instead of repeatedly hitting a failing Pro endpoint.

4. **Cached repeated queries.** A user who checks their recovery score 3 times in one morning gets the cached score for the 2nd and 3rd calls — no Gemini call, no token burn, same answer.

5. **Distilled fitness insights.** After 4 weeks of workout logs + check-ins + chat messages, the distillation pipeline produces a monthly summary: "You completed 18/20 planned workouts (90% consistency), your recovery score averaged 68/100, you reported knee pain twice after squat sessions — consider form check or substitution." After 3 months, it extracts a principle: "This user's leg day performance drops 20% when HRV < 30 — auto-suggest rest or reduced volume when HRV is low."

6. **Searchable fitness history.** Instead of scrolling through 50 workout log documents in Firestore, the developer can ask "when did this user last hit a PR on bench press?" and the knowledge layer retrieves the relevant workout notes, assembles context, and answers from what's already indexed.

7. **The fitness agent mesh stays intact.** None of this replaces F00–F11. The governance layer wraps them — adds token tracking before/after each Gemini call, caches repeated queries, indexes the data they produce, and distills it on a schedule. The agents keep working exactly as they do now; the governance layer adds control and insight on top.

---

## 17. File Map (Governance Layer — New Files, Wrapping Existing Fitness Codebase)

| File | Lines (est.) | Role | Location |
|---|---|---|---|
| `docs/06-second-brain-architecture.md` | 1047 | This document — governance + knowledge layer architecture for PolySync fitness | docs/ |
| `docs/architecture-overview.html` | ~400 | HTML visual overview of the governance layer + fitness agent mesh | docs/ |
| `docs/governance-state.md` | 247 | Live state of budgets, circuit breakers, observability, what's hardcoded vs wired | docs/ |
| `server.ts` (modified) | +200 lines | Add token tracking, session budget, circuit breakers, /api/budget endpoint, cache + distillation startup | server.ts (wraps existing 1224 lines) |
| `src/knowledge-types.ts` (new) | ~80 | FitnessNote, FitnessClassifier, GraphEdge, AssembledContext, AgentRun, BudgetSnapshot interfaces | src/ |
| `src/context-cache.ts` (new) | ~116 | LRU cache, 24h TTL, 100 entries, hit-rate stats | src/ |
| `src/distillation-scheduler.ts` (new) | ~151 | Cron batch distillation (weekly/monthly/quarterly) for fitness data | src/ |
| `src/components/ThinkSurface.tsx` (new) | ~367 | Fitness think surface — query → recall from indexed fitness data → specialist → human gate | src/components/ |
| `src/components/VoiceCapture.tsx` (new) | ~283 | Voice capture for fitness notes ("log a workout", "how's my recovery?") | src/components/ |
| `src/components/ImportTool.tsx` (new) | ~287 | Bulk import of workout logs, check-ins, chat exports | src/components/ |
| `src/App.tsx` (modified) | +30 lines | Add "Fitness Brain" tab alongside Weekly Plan / Today's Workout / Progress / Coach Chat | src/ |

---

## 18. Relationship to Existing PolySync Architecture Doc

`docs/ARCHITECTURE.md` (328 lines, origin/main) defines the 12-agent fitness mesh, the 16 API endpoints, the data flow (onboarding → workout execution → coaching chat → daily digest), the technology stack, and the security model. This document (`docs/06-second-brain-architecture.md`) defines the governance and knowledge layer that sits ON TOP of that mesh — token budgets, circuit breakers, observability, context cache, distillation pipeline, and the FitnessNote data model that indexes the existing Firestore collections.

Together, the two documents describe the complete system:
- `ARCHITECTURE.md` = the fitness coaching platform (agents, endpoints, data flow, security)
- `06-second-brain-architecture.md` = the governance + knowledge layer (budgets, breakers, cache, distillation, indexed brain)

---

*Document version: 1.0 — Governance and knowledge layer architecture for PolySync AI Fitness Coach. Builds on top of the existing 12-agent mesh documented in ARCHITECTURE.md.*
