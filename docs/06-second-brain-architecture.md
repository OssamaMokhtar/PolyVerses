# PolySync — Complete Architecture Reference

> **AI Fitness Coach · Multi-Agent Orchestration Platform · v2.0 · 2026-09-12**

**Status:** Complete architecture reference — every agent, endpoint, type, flow, and the governance layer design documented in detail.
**Scope:** The full PolySync system — the 12-agent fitness mesh (F00–F11), all 16 API endpoints, all TypeScript type definitions, all 4 data flows, the client-side App shell, the security model, deployment model, and the governance layer (token budgets, circuit breakers, observability, distillation, knowledge layer) that is designed to wrap the existing mesh.

---

## 1. System Overview

PolySync is a **server-rendered React + Vite + TypeScript + Firebase + Express** web application that orchestrates a **12-agent specialist AI mesh** to deliver personalized, adaptive fitness coaching. The Gemini API key is held **server-side** in `server.ts`; the client calls the app's own API endpoints and never sees the key.

The architecture inherits PolyVerses' multi-agent orchestration pattern — agent network visualization, observability dashboard, human-in-the-loop gates, and per-agent system prompts — but replaces the PM workbench domain with **fitness coaching domain logic**.

### 1.1 What PolySync Does

1. **Onboarding:** A user signs up via Google OAuth, completes a fitness profile (goal, level, injuries, equipment, days/week, session duration, focus areas, biometrics, health data consent), and receives an initial weekly workout plan.

2. **Weekly planning:** Every week, an adaptive workout plan is generated from the user's profile + exercise library. The plan is progressive — it adapts based on completed/skipped workouts, recovery scores, and user feedback.

3. **Workout execution:** The user logs into "Today's Workout", sees the day's session, logs sets/reps/weight per exercise, and marks the workout complete. The log triggers plan adaptation for the next week.

4. **Coaching chat:** A conversational AI fitness coach (F06) answers questions with context from the user's profile, recent workouts, current plan, recovery score, and wearable data. Medical questions are gated through F11 Compliance.

5. **Recovery analysis:** Daily recovery scores (0–100) are computed from wearable data (sleep, HRV, RHR, steps) + workout frequency + user-reported energy. The score drives plan adaptation and daily workout recommendations.

6. **Check-ins:** Post-workout or daily check-ins capture energy, mood, pain, motivation, sleep quality. These feed F09 Motivation Coach (dropout risk detection) and F04 Recovery Analyst.

7. **Nutrition guidance:** Calorie/macro targets are estimated from profile + activity level. Nutrition questions get evidence-based answers with medical disclaimers.

8. **Form coaching:** Exercise-specific form cues and common mistakes, with interpretation of the user's description of how a movement felt.

9. **Wearable integration:** Apple HealthKit, Google Fit, Strava, Garmin, WHOOP, Oura data is normalized into a common schema and fed into recovery analysis and coaching context.

10. **Progress tracking:** Workout volume, frequency, recovery trends, streaks, and body weight trends are aggregated and displayed on the Progress dashboard.

### 1.2 What's Not Yet Implemented (Status)

| Feature | Status |
|---|---|
| 12-agent mesh (F00–F11) | Implemented — server.ts 1224 lines |
| 16 fitness API endpoints | Implemented — server.ts |
| Firebase Auth + Firestore per-user storage | Implemented |
| Gemini 3.5 Flash / Flash Thinking routing | Implemented |
| Sandbox fallback | Implemented |
| ExerciseLibrary.ts (bundled exercise data) | Implemented |
| D3 agent network diagram + heatmap | Implemented |
| Recharts progress/retention charts | Implemented |
| Observability dashboard (PolyVerses-style) | Implemented |
| Human gate UI (compliance gate) | Implemented |
| FitnessOnboarding flow | Implemented |
| App shell (today/workout, weekly plan, progress, coach chat, settings) | Implemented |
| RBAC (user/premium/elite tiers) | Documented in types — not yet enforced in code |
| Push notifications (FCM) | Future — documented in architecture |
| Payments (Stripe) | Future — documented in architecture |
| Mobile (React Native / PWA) | Future — documented in architecture |
| **Governance layer (token budgets, circuit breakers, observability endpoint, context cache, distillation, knowledge layer)** | **Designed — not implemented. See Section 11.** |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (React SPA / PWA)                      │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Weekly Plan │  │ Today's      │  │ Progress     │  │ Coach Chat   │ │
│  │  (7-day grid)│  │ Workout      │  │ Dashboard    │  │ (LLM chat)   │ │
│  │              │  │ (active log) │  │ (charts)     │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Onboarding   │  │ Wearable Data│  │ Check-ins    │  │ Settings     │ │
│  │ (fitness     │  │ (sleep/HRV/  │  │ (energy/mood/│  │ (profile edit│ │
│  │  profile)    │  │  RHR trends) │  │  pain/motiva)│  │  + wearables,│ │
│  │              │  │              │  │              │  │  subscription│ │
│  │              │  │              │  │              │  │  + data export│ │
│  │              │  │              │  │              │  │  + disclaimer │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐│
│  │                   Fitness Agent Network (D3 Topology + Heatmap)        ││
│  │  [F01:Profile] → [F02:WorkoutGen] → [F11:Compliance] → [F05:PlanAdapt]││
│  │       ↑              ↑                   ↑                   ↑           ││
│  │  [F10:DataIngest] [F03:ExerciseLib]  [F07:FormCoach]   [F04:Recovery]  ││
│  │       ↑              │                   │                   │           ││
│  │       └── HealthKit/GoogleFit/Strava/Garmin/WHOOP/Oura ──┘           ││
│  │                                                                    │     ││
│  │  [F06:CoachingChat] ←→ [F09:Motivation] ←→ [F08:Nutrition]          ││
│  └───────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐│
│  │                     Observability Dashboard (D3 / Recharts)            ││
│  │  Agent telemetry heatmap · Coaching quality metrics · Engagement funnel ││
│  │  Retention cohorts · API cost tracking · Recovery score distribution     ││
│  └───────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                │  HTTP (REST)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SERVER (Express + Vite, port 3000)                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  FITNESS API ROUTES                                                     ││
│  │  POST /api/fitness/profile          → F01: save/update profile         ││
│  │  GET  /api/fitness/profile          → F01: get profile                 ││
│  │  POST /api/fitness/generate-plan    → F02: generate weekly plan        ││
│  │  GET  /api/fitness/plan             → F02: get current plan            ││
│  │  POST /api/fitness/log-workout      → F05: log workout + adapt          ││
│  │  POST /api/fitness/adapt-plan       → F05: manual re-adaptation         ││
│  │  POST /api/fitness/chat             → F06: coaching chat                ││
│  │  POST /api/fitness/recovery         → F04: recovery score + rec         ││
│  │  POST /api/fitness/nutrition        → F08: nutrition guidance            ││
│  │  POST /api/fitness/form-cue         → F07: form cues for exercise       ││
│  │  POST /api/fitness/substitute       → F03: find exercise substitute     ││
│  │  POST /api/fitness/checkin          → F09: record check-in + sentiment  ││
│  │  POST /api/fitness/webhook/healthkit → F10: Apple HealthKit callback    ││
│  │  POST /api/fitness/webhook/googlefit → F10: Google Fit callback         ││
│  │  GET  /api/fitness/progress         → aggregated progress data           ││
│  │  POST /api/fitness/consent          → F11: set health data consent       ││
│  │                                                                          ││
│  │  All routes: server-side Gemini 3.5 Flash with agent-specific           ││
│  │  systemInstruction; sandbox fallback if GEMINI_API_KEY is missing.       ││
│  │  Auth: x-user-id header → Firebase UID; 401 if missing.                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  STATIC SERVING                                                          ││
│  │  Dev: Vite middleware mode                                              ││
│  │  Prod: express.static(dist) + SPA fallback                             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
        ┌─────────┐      ┌──────────┐      ┌──────────────┐
        │Firebase │      │  Gemini  │      │  External    │
        │ Auth +  │      │  API     │      │  APIs        │
        │Firestore│      │(server-  │      │ ┌───────────┐│
        │         │      │  side)   │      │ │Apple      ││
        │users/   │      │          │      │ │HealthKit  ││
        │{uid}/   │      │          │      │ ├───────────┤│
        │profile  │      │          │      │ │Google Fit ││
        │{uid}/   │      │          │      │ ├───────────┤│
        │workouts │      │          │      │ │Strava     ││
        │{uid}/   │      │          │      │ ├───────────┤│
        │plans    │      │          │      │ │Garmin     ││
        │{uid}/   │      │          │      │ ├───────────┤│
        │logs     │      │          │      │ │WHOOP      ││
        │{uid}/   │      │          │      │ ├───────────┤│
        │wearable │      │          │      │ │Oura       ││
        │{uid}/   │      │          │      │ ├───────────┤│
        │chat     │      │          │      │ │Stripe     ││
        │{uid}/   │      │          │      │ └───────────┘│
        │checkIns │      │          │      │              │
        │{uid}/   │      │          │      │              │
        │notifications             │          │              │
        └─────────┘      └──────────┘      └──────────────┘
```

### 2.1 Client ➜ Server Contract

| Direction | Mechanism | Details |
|---|---|---|
| Client → Server | HTTP REST (fetch) | Every request includes `x-user-id: <firebase-uid>` header for auth. Body is JSON. Response is JSON. |
| Server → Client | HTTP REST response | JSON payloads. Errors return `{ error: string }` with appropriate HTTP status. |
| Auth | `x-user-id` header | Server extracts UID from header, looks up Firestore documents at `users/{uid}/...`. Returns 401 if header missing. |
| API key | Never leaves server | Gemini API key in `GEMINI_API_KEY` env var. Client never sees it. |

### 2.2 Server Internal Architecture

```
server.ts (1224 lines)
├── Imports & types (lines 1–19)
│   ├── express, path, vite createServer
│   ├── @google/genai — GoogleGenAI client
│   ├── dotenv — env var loading
│   ├── firebase — db (Firestore client from src/firebase.ts)
│   ├── firestore — doc, getDoc, setDoc, serverTimestamp, collection, addDoc, query, where, orderBy, getDocs, limit, Timestamp
│   ├── crypto — randomUUID for chat message IDs
│   └── src/types — all Fitness* interfaces + ExerciseInput + Workout + DailyWorkout + PlanOutput
│   └── src/ExerciseLibrary — findExerciseSubstitution, ExerciseLibrary (bundled exercise data)
├── WearableInput interface (lines 23–31) — user-provided wearable data for recovery analysis
├── Auth helpers (lines 33–50)
│   ├── requireAuth(req, res) → uid | null — extracts x-user-id, 401 if missing
│   ├── getProfile(uid) → FitnessProfile | null — getDoc(users/{uid}/profile/current)
│   └── saveProfile(uid, profile) → void — setDoc(users/{uid}/profile/current, merge: true)
├── startServer() (lines 52–1224)
│   ├── Express app setup (lines 52–56)
│   │   ├── const app = express()
│   │   ├── const PORT = 3000
│   │   └── app.use(express.json())
│   ├── Gemini client init (lines 58–78)
│   │   ├── let ai: GoogleGenAI | null = null
│   │   ├── if (key && key !== "MY_GEMINI_API_KEY") → new GoogleGenAI({ apiKey: ... })
│   │   ├── else → console.warn("Sandbox fallback will be active")
│   ├── /api/evaluate (lines 80–133) — PolyVerses compatibility endpoint
│   │   ├── POST — agentType: opportunity | compliance | prd | rollback | (default: router)
│   │   ├── Gemini generateContent with agent-specific systemInstruction
│   │   ├── Sandbox fallback if !ai
│   ├── ─── PolySync Fitness API Routes (lines 135–1224)
│   │   ├── F01 — POST /api/fitness/profile (save) — lines 137–167
│   │   ├── F01 — GET /api/fitness/profile (get) — lines 169–184
│   │   ├── F11 — POST /api/fitness/consent (set health data consent) — lines 186–201
│   │   ├── F02 — POST /api/fitness/generate-plan — lines 201–260
│   │   ├── F02 — GET /api/fitness/plan — lines 260–290
│   │   ├── F03 — POST /api/fitness/substitute — lines 290–310
│   │   ├── F09 — POST /api/fitness/checkin — lines 312–341
│   │   ├── F05 — POST /api/fitness/log-workout — lines 343–370
│   │   ├── F04 — POST /api/fitness/recovery — lines 372–394
│   │   ├── F06 — POST /api/fitness/chat — lines 396–470
│   │   ├── F07 — POST /api/fitness/form-cue — lines 472–510
│   │   ├── F08 — POST /api/fitness/nutrition — lines 512–560
│   │   ├── F05 — POST /api/fitness/adapt-plan — lines 562–574
│   │   ├── GET /api/fitness/progress — lines 576–600
│   │   ├── F10 — POST /api/fitness/webhook/healthkit — lines 600–650
│   │   ├── F10 — POST /api/fitness/webhook/googlefit — lines 650–700
│   │   ├── System prompts (F06, F07, F08) — lines 700–755
│   │   ├── Plan generation helpers — lines 757–899
│   │   ├── generateSandboxResponse() — lines 1130–1224
│   └── Static serving (lines 1224-end)
│       ├── Dev: Vite middleware
│       └── Prod: express.static(dist) + SPA fallback
└── startServer() call (last line)
```

### 2.3 Data Storage — Firestore Collections Per User

```
users/{uid}/
├── profile/current          → FitnessProfile (single doc, updated on edit)
├── workouts/{workoutId}     → WorkoutLogEntry[] (one doc per logged workout)
├── plans/{planId}           → WeeklyPlan (one doc per generated plan)
├── recovery/{assessmentId}  → RecoveryAssessment (one doc per recovery check)
├── wearableData/{source}/{timestamp} → WearableDataPoint (one doc per webhook payload)
├── chatSessions/{sessionId} → ChatSession (messages array grows per session)
├── checkIns/{checkInId}     → CheckIn (one doc per check-in)
└── notifications/{notifId}  → (future — push notification log)
```

---

## 3. Every Agent — Full Detail

### 3.1 F00 — Orchestrator Router

| Field | Value |
|---|---|
| **Purpose** | Entry point for all user requests; determines which agent(s) to invoke and in what order. Routes to a single agent or orchestrates a multi-agent chain (e.g., generate plan → compliance check → adapt). |
| **Inputs** | User request type, user profile availability, auth context (x-user-id header → Firebase UID) |
| **Logic** | Route to single agent or orchestrate multi-agent chain. Knows all 12 agents and their responsibilities. Handles idempotent key handling. Circuit breaker on repeated failures (designed — not yet implemented). |
| **System prompt** | Router persona; knows all 12 agents and their responsibilities; idempotent key handling; circuit breaker on repeated failures |
| **Gemini route** | Standard (Flash) — `gemini-3.5-flash` |
| **Where it lives** | `/api/evaluate` endpoint (lines 80–133) — the default agentType branch (lines 111–115) acts as the router. In the fitness domain, F00 is not a separate endpoint — it's the routing logic inside `/api/evaluate` and the implicit routing that happens when the client calls specific `/api/fitness/*` endpoints. |
| **When invoked** | Every time `/api/evaluate` is called without a specific agentType — the default branch routes to the orchestrator persona. In practice, the fitness app calls specific endpoints (e.g., `/api/fitness/chat` for F06, `/api/fitness/generate-plan` for F02), so F00's routing is implicit in the endpoint selection. |
| **Token cost** | ~1K per call (routing logic, short system prompt) |
| **Implemented** | Yes — in `/api/evaluate` default branch. The fitness-specific routing (which endpoint handles which agent) is hardcoded in server.ts line ordering. |

### 3.2 F01 — Profile Agent

| Field | Value |
|---|---|
| **Purpose** | Validate and structure user fitness profile; detect contradictions; normalize enums; ensure required fields present. |
| **Inputs** | Onboarding form data or profile update (Partial<FitnessProfile>) |
| **Logic** | Check for contradictions (advanced + no equipment + can't do pushups → suggest clarification). Normalize goal/level/equipment enums. Ensure required fields (goal, level) present. Save to `users/{uid}/profile/current`. |
| **System prompt** | Expert fitness assessor; knows exercise prerequisites per fitness level; suggests missing fields politely |
| **Gemini route** | Standard (Flash) — `gemini-3.5-flash` |
| **Where it lives** | `POST /api/fitness/profile` (lines 137–167) — save endpoint. `GET /api/fitness/profile` (lines 169–184) — get endpoint. |
| **When invoked** | On onboarding completion (profile save) and on profile edit (settings page). |
| **Token cost** | ~2K per call (validation + structuring) — but the current implementation does NOT call Gemini for profile save. It validates required fields (goal, level) server-side and saves directly. Gemini would be used for contradiction detection in a future enhancement. |
| **Firestore write** | `setDoc(doc(db, "users", uid, "profile", "current"), profile, { merge: true })` |
| **Implemented** | Partially — the save endpoint validates goal + level server-side and saves. Gemini validation is designed but not wired. |

### 3.3 F02 — Workout Generator Agent

| Field | Value |
|---|---|
| **Purpose** | Generate a weekly workout plan from profile + exercise library. Adaptive — adjusts based on previous week's completed/skipped workouts, recovery scores, and user feedback. |
| **Inputs** | User profile (goal, level, injuries, equipment, days/week, session duration, focus, biometrics, specialMode), exercise library (bundled ExerciseLibrary.ts — searchable by muscle group, equipment, difficulty), current plan (for adaptation), workout logs (for adaptation), recovery scores (for adaptation) |
| **Logic** | 1. Select exercises matching equipment + avoiding injury-excluded exercises. 2. Distribute across available days (e.g., 4 days → upper/lower split or full-body). 3. Assign sets, reps, rest, RPE targets per exercise based on goal + level. 4. Apply progressive overload: if previous week's workouts were completed at target RPE, increase weight/reps slightly. 5. Include warm-up and cool-down suggestions. 6. On adaptation: if workout completed at/above target RPE → increase; if below → maintain; if skipped → reduce; if recovery low → reduce volume/intensity. |
| **System prompt** | Expert strength & conditioning coach; knows periodization basics; generates concrete, actionable plans; cites exercise library IDs |
| **Gemini route** | Reasoning (Flash Thinking or Pro for quality) — `gemini-3.5-flash` with reasoning in current implementation |
| **Where it lives** | `POST /api/fitness/generate-plan` (lines 201–260) — generate endpoint. `GET /api/fitness/plan` (lines 260–290) — get current plan. `POST /api/fitness/adapt-plan` (lines 562–574) — manual re-adaptation. `POST /api/fitness/log-workout` (lines 343–370) — triggers adaptation after workout log. |
| **When invoked** | On onboarding completion (initial plan), on manual "Generate Plan" click, on workout log submission (triggers adaptation), on manual "Adapt Plan" click. |
| **Token cost** | ~8–15K per call (reasoning over exercise library, plan structure, progressive overload logic) |
| **Gemini model** | Currently `gemini-3.5-flash` (lines 207–208 in the generate-plan route). The architecture specifies Flash Thinking or Pro for quality, but the code uses standard Flash. |
| **Plan structure** | WeeklyPlan with weekNumber, startDate, version, days[] (each day has dayIndex, date, dayLabel, focus, recoveryRecommendation?, recoveryScore?, workouts[]), generatedBy (F02), adaptedFromPlanId?, adaptationReason? |
| **Exercise selection** | `selectExercisesForGoal(profile)` — filters ExerciseLibrary by equipment compatibility, injury exclusion, goal priority. Returns enough exercises for a week of workouts. |
| **Deterministic fallback** | `generateDeterministicPlan(profile)` — generates a plan without Gemini when AI is unavailable (lines 799–853). |
| **Implemented** | Yes — generate-plan endpoint calls Gemini, saves plan to Firestore, returns plan + rationale + warnings. |

### 3.4 F03 — Exercise Library Agent

| Field | Value |
|---|---|
| **Purpose** | Serve exercise metadata; handle substitution queries. Lookup in bundled ExerciseLibrary.ts; for substitutions: find exercises targeting same primary muscle groups with matching equipment availability. |
| **Inputs** | Exercise ID or query (muscle group, equipment, difficulty, substitute for X) |
| **Logic** | Lookup in bundled ExerciseLibrary.ts; return exercise metadata; for substitutions: find exercises targeting same primary muscle groups with matching equipment availability. Uses `findExerciseSubstitution(exerciseId, preferredEquipment)`. |
| **System prompt** | Exercise science reference; knows muscle targeting, common substitutions, regressions and progressions |
| **Gemini route** | Standard (Flash) — `gemini-3.5-flash` — mostly lookup, light reasoning for substitutions |
| **Where it lives** | `POST /api/fitness/substitute` (lines 290–310) — substitution endpoint. Also used internally by F02 (exercise selection) and F05 (exercise swapping on adaptation). |
| **When invoked** | When user requests an exercise substitution (e.g., "I don't have a barbell, what can I use instead?"). |
| **Token cost** | ~1K per call (mostly lookup — the bundled ExerciseLibrary.ts is a static data structure, not a Gemini call) |
| **Gemini model** | Not used for the lookup itself — ExerciseLibrary.ts is a static bundle. Gemini would be used for substitution reasoning if the query is complex (e.g., "give me a full back workout with only dumbbells"). |
| **ExerciseLibrary.ts** | Bundled in src/ExerciseLibrary.ts — contains exercise definitions with id, name, category, targetMuscles, equipment, difficulty, instructions, commonMistakes, substitutionIds. |
| **Implemented** | Yes — substitute endpoint calls findExerciseSubstitution and returns substitutes. |

### 3.5 F04 — Recovery Analyst Agent

| Field | Value |
|---|---|
| **Purpose** | Compute recovery score (0–100) from wearable data + workout frequency + user-reported energy; recommend train_normal / reduce_intensity / rest_day / active_recovery. |
| **Inputs** | Sleep duration + quality (if available), HRV trend (if available), resting heart rate trend (if available), steps/active calories (if available), workout frequency last 7 days, user-reported energy/mood from check-ins, wearable data (WearableDataPoint[]) |
| **Logic** | Score components: sleep (0–30 pts), HRV vs baseline (0–25 pts), RHR vs baseline (0–20 pts), workout frequency reasonableness (0–15 pts), user-reported energy (0–10 pts). Missing data → lower confidence, use available signals only. Output: score 0–100 + label (recovered / moderate / low / poor) + recommendation + explanation. |
| **System prompt** | Sports science recovery specialist; interprets biometric trends conservatively; never advises training through injury |
| **Gemini route** | Reasoning (Flash Thinking) — `gemini-3.5-flash` |
| **Where it lives** | `POST /api/fitness/recovery` (lines 372–394) — recovery endpoint. Also used internally by F02 (plan generation — recovery score influences workout intensity) and F05 (plan adaptation — low recovery → reduce volume). |
| **When invoked** | On daily recovery check (cron or on-demand), after wearable data webhook, before plan generation/adaptation. |
| **Token cost** | ~2K per call (reasoning over wearables + check-ins) |
| **Recovery score computation** | `computeRecoveryScore(input: RecoveryInput)` — deterministic function (lines 1000–1129 of server.ts). NOT a Gemini call — it's a rules-based algorithm: sleep (0–30), HRV (0–25), RHR (0–20), workout frequency (0–15), energy level (0–10). Clamped to 0–100. |
| **Recommendation logic** | score >= 75 → train_normal; score >= 55 → reduce_volume; score >= 35 → reduce_intensity; else → rest. |
| **Firestore write** | RecoveryAssessment saved to `users/{uid}/recovery/{assessmentId}` with score, recommendation, factors, dataSources, dataAgeHours, generatedBy (F04). |
| **Implemented** | Yes — recovery endpoint calls computeRecoveryScore (deterministic, not Gemini), saves assessment, returns it. The architecture specifies Flash Thinking for quality, but the code uses a rules-based algorithm. |

### 3.6 F05 — Plan Adaptor Agent

| Field | Value |
|---|---|
| **Purpose** | Adjust next week's plan based on completed/skipped workouts, recovery scores, user feedback. Conservative progression — respects recovery signals. |
| **Inputs** | Current week's plan, workout log (completed/skipped per session, actual sets/reps/weight vs target), recovery scores for the week, user feedback notes |
| **Logic** | 1. If workout completed at or above target RPE → increase weight/reps next week (+2.5–5% or +1 rep). 2. If workout completed below target → maintain or slight increase. 3. If workout skipped → maintain or reduce volume next week (don't pile on). 4. If recovery score was low on workout days → reduce volume/intensity for upcoming week. 5. If user feedback indicates pain/discomfort → swap problematic exercises via F03. |
| **System prompt** | Adaptive programming coach; conservative progression; respects recovery signals |
| **Gemini route** | Reasoning (Flash Thinking) — `gemini-3.5-flash` |
| **Where it lives** | `POST /api/fitness/log-workout` (lines 343–370) — triggers adaptation after workout log. `POST /api/fitness/adapt-plan` (lines 562–574) — manual re-adaptation. |
| **When invoked** | After every workout log submission (automatic adaptation), on manual "Adapt Plan" click. |
| **Token cost** | ~4–8K per call (reasoning over workout logs + recovery scores + plan structure) |
| **Adaptation trigger** | `generateAdaptation(uid, workout)` — called in log-workout endpoint (line 360) after saving the workout. Returns adaptedPlan or null if adaptation fails. |
| **Firestore write** | Adapted plan saved to `users/{uid}/plans/{newPlanId}` with version incremented, adaptedFromPlanId set, adaptationReason recorded. |
| **Implemented** | Yes — log-workout triggers generateAdaptation, adapt-plan is a manual trigger. The adaptation logic is partially Gemini-driven (generateAdaptation calls Gemini) and partially deterministic. |

### 3.7 F06 — Coaching Chat Agent

| Field | Value |
|---|---|
| **Purpose** | Conversational AI fitness coach; answers user questions with context from their profile, workouts, plan, and wearables. Supports form questions, nutrition questions, recovery questions, motivation, and general fitness advice. |
| **Inputs** | User message + conversation history + current profile snapshot + recent workouts + current plan + latest recovery score + wearable data summary |
| **Logic** | 1. Understand user intent (form question / nutrition question / recovery question / motivation / general fitness advice). 2. Route to relevant specialist knowledge (F03 for form, F08 for nutrition, F04 for recovery, F02 for program questions). 3. Synthesize answer in a supportive coach tone; reference user's actual data ("Based on your squat numbers this week..."). 4. If medical/injury question → pass to F11 Compliance Gate for disclaimer + safe response. 5. Store conversation history in Firestore for context continuity. |
| **System prompt** | Supportive, knowledgeable fitness coach persona; uses user's data; never gives medical advice; encourages but doesn't pressure |
| **Gemini route** | Reasoning (highest quality — Flash Thinking or Pro) — `gemini-3.5-flash` in current implementation |
| **Where it lives** | `POST /api/fitness/chat` (lines 396–470) — chat endpoint. |
| **When invoked** | Every user message in the Coach Chat tab. |
| **Token cost** | ~4–12K per call (depends on context size — profile + recent workouts + current plan + recovery score + conversation history) |
| **Gemini model** | `gemini-3.5-flash` (line 419 of server.ts). The architecture specifies Flash Thinking or Pro for quality, but the code uses standard Flash. |
| **Context building** | Server fetches profile (getProfile), builds context string from profile fields (goal, level, injuries, equipment, daysPerWeek, sessionDuration) — line 411. |
| **Chat session storage** | If sessionId provided → setDoc to `users/{uid}/chatSessions/{sessionId}` with merge (append messages). If no sessionId → addDoc to `users/{uid}/chatSessions` (new session). Messages stored as array of {id, role, content, timestamp, agentId}. |
| **F06 system prompt (F06_SYSTEM_PROMPT, lines 702–721)** | "You are the Coaching Chat Agent of PolySync, a knowledgeable and encouraging AI fitness coach. You have access to the user's profile, recent workouts, and current plan. Your role: 1. Answer fitness questions with personalized advice based on the user's profile and history. 2. Explain the reasoning behind workout choices. 3. Provide form cues and common mistakes when asked about specific exercises. 4. Discuss nutrition, recovery, and motivation when relevant. 5. Be encouraging but factual — never overpromise results. Safety rules: 1. If asked about injuries or medical conditions, recommend consulting a healthcare professional and do not give specific medical advice. 2. If asked about supplements, give general information and recommend consulting a healthcare provider. 3. If the user's question suggests they might be pushing too hard (excessive fatigue, pain, burnout signs), gently suggest rest or reduced intensity. 4. Always maintain a supportive, non-judgmental tone. Style: Be concise but thorough (2-4 sentences for simple questions, more for complex ones). Use examples when helpful. Reference the user's specific situation when possible. End with an encouraging note or a follow-up question when appropriate." |
| **Implemented** | Yes — chat endpoint builds context from profile, calls Gemini, saves messages to Firestore, returns response. |

### 3.8 F07 — Form Coach Agent

| Field | Value |
|---|---|
| **Purpose** | Provide form cues and common mistakes for exercises; interpret user descriptions of how a movement felt. |
| **Inputs** | Exercise name/ID, user's description of movement feel (optional) |
| **Logic** | Look up exercise in library for standard form cues and common mistakes; if user provides description, compare to common error patterns and suggest corrections. |
| **System prompt** | Experienced personal trainer; knows cueing language; focuses on safety and effectiveness |
| **Gemini route** | Standard (Flash) — `gemini-3.5-flash` |
| **Where it lives** | `POST /api/fitness/form-cue` (lines 472–510) — form cue endpoint. |
| **When invoked** | When user asks about exercise form (e.g., "how should I do squats?", "my knees hurt during lunges"). |
| **Token cost** | ~1–2K per call |
| **Gemini model** | `gemini-3.5-flash` (line 489 of server.ts) |
| **F07 system prompt (F07_SYSTEM_PROMPT, lines 723–735)** | "You are the Form Coach Agent of PolySync, a specialist in exercise technique and movement quality. You provide form cues, common mistakes, and corrections for exercises. INPUT: An exercise ID or name, optionally with a user's description of how the movement feels. OUTPUT: Specific, actionable form cues organized as: 1. Key setup points (body position, grip, stance, etc.), 2. Movement execution (how to perform the concentric and eccentric phases), 3. Common mistakes to avoid, 4. Cues to self-check (what to pay attention to during the exercise). If the user describes discomfort or unusual feel, address that specifically — suggest possible form issues that could cause it, but always include a disclaimer that persistent pain should be evaluated by a professional. Be specific to the exercise. Don't give generic advice like 'use proper form' — give concrete cues like 'keep your elbows at a 45-degree angle from your body' or 'drive through your heels, not your toes.'" |
| **Implemented** | Yes — form-cue endpoint calls Gemini with exerciseId + userDescription, returns cue + sandbox flag. |

### 3.9 F08 — Nutrition Advisor Agent

| Field | Value |
|---|---|
| **Purpose** | Estimate calorie/macro targets; answer nutrition questions; suggest meal ideas. Evidence-based, conservative estimates, always includes disclaimer for medical questions. |
| **Inputs** | User profile (goal, weight, height, age, gender, activity level from workouts), dietary preferences (if provided), user question |
| **Logic** | 1. Calculate TDEE estimate (Mifflin-St Jeor or similar) + activity adjustment from workout frequency. 2. Apply goal-based deficit/surplus (weight loss: -300 to -500 kcal; hypertrophy: +200 to +300 kcal; maintenance: TDEE). 3. Set protein target (1.6–2.2g/kg depending on goal). 4. Answer questions within scope; flag medical nutrition questions (e.g., "should I take this supplement for my condition") to disclaimer. |
| **System prompt** | Evidence-based nutrition coach; conservative estimates; always includes disclaimer for medical questions |
| **Gemini route** | Standard (Flash) — `gemini-3.5-flash` |
| **Where it lives** | `POST /api/fitness/nutrition` (lines 512–560) — nutrition endpoint. |
| **When invoked** | When user asks about nutrition (e.g., "how much protein should I eat?", "what should I eat before a workout?"). |
| **Token cost** | ~2–4K per call |
| **Gemini model** | `gemini-3.5-flash` (line 524 of server.ts) |
| **F08 system prompt (F08_SYSTEM_PROMPT, lines 737–755)** | "You are the Nutrition Advisor Agent of PolySync, providing practical, evidence-based nutrition guidance for fitness goals. Your role: 1. Estimate calorie and macro needs based on user profile (goal, level, biometrics if available). 2. Suggest meal timing around workouts (pre-workout, post-workout). 3. Give practical food suggestions for hitting protein, carb, and fat targets. 4. Address dietary preferences when known (vegetarian, keto, etc.). 5. Explain the role of nutrition in recovery and performance. Safety rules: 1. If asked about medical nutrition (diabetes, eating disorders, severe allergies, medications), recommend consulting a registered dietitian or healthcare provider. 2. If asked about supplements, give general information about what the evidence shows and recommend consulting a healthcare provider before starting anything. 3. Never promote extreme restriction or unhealthy eating patterns. 4. Be inclusive of different dietary preferences and cultural food traditions. Style: Be practical and actionable — give specific food examples and portions. Use ranges when appropriate (e.g., '0.7-1g per pound of bodyweight for protein'). Be encouraging about nutrition as part of the fitness journey, not a source of stress." |
| **Response shape** | `{ guidance: string, disclaimer: string, sandbox: boolean }` — nutrition guidance + disclaimer (always present, medical/supplement questions get stronger disclaimer) + sandbox flag. |
| **Implemented** | Yes — nutrition endpoint calls Gemini with query + profile context, returns guidance + disclaimer. |

### 3.10 F09 — Motivation Coach Agent

| Field | Value |
|---|---|
| **Purpose** | Analyze user check-ins and chat sentiment; detect dropout risk; generate motivational messages; adjust tone based on user state. |
| **Inputs** | Check-in data (energy, mood, pain, motivation scores), chat message sentiment (light analysis), workout frequency trend (declining?) |
| **Logic** | 1. Score dropout risk: declining frequency + low motivation + low energy + negative mood → high risk. 2. Adjust messaging tone: high motivation → challenging/encouraging; low motivation → supportive/empathetic; very low → gentle re-engagement, no pressure. 3. Generate daily/weekly motivational messages tuned to current state. 4. Flag high dropout risk to trigger re-engagement notification. |
| **System prompt** | Empathetic motivation coach; reads between the lines; never shames; adapts tone to user state |
| **Gemini route** | Standard (Flash) + simple rule-based sentiment threshold — `gemini-3.5-flash` |
| **Where it lives** | `POST /api/fitness/checkin` (lines 312–341) — check-in endpoint triggers F09 sentiment analysis. Also used internally for daily digest motivation messages (future). |
| **When invoked** | On every check-in submission, on daily/weekly digest generation (future). |
| **Token cost** | ~1–2K per call |
| **Check-in storage** | CheckIn saved to `users/{uid}/checkIns/{checkInId}` with date, workoutId?, energyLevel, mood, motivationLevel, sleepQuality?, painOrIssues?, muscleSoreness?, stressLevel?, workoutCompleted, skippedWorkoutReason?, createdAt. |
| **Dropout risk scoring (designed, not fully implemented)** | declining frequency (workouts last 7 days < previous 7 days) + low motivation (motivationLevel < 4) + low energy (energyLevel < 4) + negative mood → high risk. Flagged for re-engagement notification (future — FCM push). |
| **Implemented** | Partially — check-in endpoint saves check-in to Firestore. F09 sentiment analysis + dropout risk scoring is designed in the architecture but not fully wired in the current code. The check-in endpoint records the data; the motivation analysis would happen in a future enhancement. |

### 3.11 F10 — Data Ingest Agent

| Field | Value |
|---|---|
| **Purpose** | Normalize wearable data from multiple sources into common schema. ETL logic — no LLM needed. |
| **Inputs** | Webhook payloads from Apple HealthKit, Google Fit, Strava, Garmin, WHOOP, Oura |
| **Logic** | 1. Validate source and data shape. 2. Normalize to common schema: steps, activeCalories, sleepDuration, sleepStages, restingHeartRate, hrv, workoutSessions. 3. Handle missing fields gracefully (not all sources provide all fields). 4. Store in `users/{uid}/wearableData/{source}/{timestamp}`. 5. Forward relevant data to F04 Recovery Analyst on request. |
| **System prompt** | Data integration specialist; handles partial data; no imputation of missing values (uses what's available) |
| **Gemini route** | Rule-based (no LLM needed; this is ETL logic in server.ts) |
| **Where it lives** | `POST /api/fitness/webhook/healthkit` (lines 600–650) — HealthKit callback. `POST /api/fitness/webhook/googlefit` (lines 650–700) — Google Fit callback. |
| **When invoked** | On webhook callback from Apple HealthKit or Google Fit (future — other sources Strava/Garmin/WHOOP/Oura are designed but not yet wired). |
| **Token cost** | 0 LLM tokens — pure ETL, server-side logic only |
| **WearableDataPoint schema** | { id, userId, source: 'healthkit' | 'googlefit' | 'strava' | 'garmin' | 'whoop' | 'oura', timestamp, sleepDuration?, sleepStages?, restingHeartRate?, hrv?, steps?, activeCalories?, activeMinutes?, workoutSessions?, rawData?, createdAt } |
| **Firestore write** | `addDoc(collection(db, "users", uid, "wearableData", source), dataPoint)` — one doc per webhook payload, organized by source. |
| **Implemented** | Partially — webhook endpoints exist (healthkit, googlefit) but the webhook payload handling is a stub. The HealthKit/Google Fit integration requires OAuth setup with Apple/Google, which is not yet configured. The endpoint structure is in place; the actual webhook delivery is future work. |

### 3.12 F11 — Compliance Gate Agent

| Field | Value |
|---|---|
| **Purpose** | Safety and legal gate; checks workout recommendations against declared injuries; enforces disclaimers; blocks medical advice; manages health data consent. |
| **Inputs** | Workout plan or recommendation, user profile (injuries, special mode), health data consent flag |
| **Logic** | 1. Check if any recommended exercise directly conflicts with declared injuries (e.g., recommending heavy squats to someone with "knee pain" → flag). 2. If health data consent is false → block wearable data processing endpoints. 3. If user query is medical ("do I have a torn meniscus?", "should I take this medication?") → return disclaimer + recommend professional consultation. 4. All plans include "consult a healthcare professional before starting any exercise program" footer. 5. Special modes (GLP-1, postpartum, injury rehab) → adjust safety thresholds appropriately. |
| **System prompt** | Safety-first compliance officer; errs on the side of caution; knows red flags for medical vs. fitness questions |
| **Gemini route** | Reasoning (safety-critical — use highest quality available) — `gemini-3.5-flash` |
| **Where it lives** | `POST /api/fitness/consent` (lines 186–201) — health data consent endpoint. Also invoked internally by F02 (plan generation — injury check), F06 (chat — medical question detection), F05 (plan adaptation — injury check on exercise swaps). |
| **When invoked** | On health data consent toggle, on plan generation (injury check), on chat message that detects medical intent, on exercise substitution that conflicts with injury. |
| **Token cost** | ~2K per call (safety check + disclaimer generation) |
| **Consent enforcement** | `healthDataConsent: boolean` field on FitnessProfile. When false, wearable data endpoints (F10 webhooks) should be blocked. Currently enforced in the data model but not checked at the webhook endpoint level (future enhancement). |
| **Disclaimer** | All AI-generated workout content includes "AI-generated fitness guidance. Listen to your body and consult a professional for injuries." (rendered in App.tsx line 349–351). Medical queries get stronger disclaimer + professional referral. |
| **Implemented** | Partially — consent endpoint saves consent flag. Injury check in plan generation is designed but not fully wired (F02 generates plan without explicitly checking injuries against exercises — the exercise selection in selectExercisesForGoal does filter by injury, which is a partial implementation). Medical question detection in chat is designed (F06 system prompt includes safety rules) but not gated through a separate F11 call. |

---

## 4. All 16 API Endpoints — Request/Response/Implementation

### 4.1 POST /api/fitness/profile — Save Profile (F01)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: Partial<FitnessProfile>
    { goal, level, injuries?, equipment?, daysPerWeek?, sessionDuration?,
      focus?, biometrics?, healthDataConsent?, specialMode?, ... }

Response (200):
  { success: true, profile: FitnessProfile }

Response (400):
  { error: "goal and level are required" }

Response (500):
  { error: "Failed to save profile" }

Implementation (server.ts lines 137–167):
  1. requireAuth(req, res) → uid (401 if missing)
  2. Validate goal && level present (400 if missing)
  3. Construct full FitnessProfile from partial + defaults
  4. saveProfile(uid, full) → setDoc(users/{uid}/profile/current, merge: true)
  5. Return { success: true, profile: full }
```

### 4.2 GET /api/fitness/profile — Get Profile (F01)

```
Request:
  Headers: x-user-id: <firebase-uid>

Response (200):
  { profile: FitnessProfile }

Response (404):
  { error: "Profile not found" }

Response (500):
  { error: "Failed to get profile" }

Implementation (server.ts lines 169–184):
  1. requireAuth → uid
  2. getProfile(uid) → getDoc(users/{uid}/profile/current)
  3. If !snap.exists() → 404
  4. Return { profile: snap.data() }
```

### 4.3 POST /api/fitness/consent — Set Health Data Consent (F11)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: { consent: boolean }

Response (200):
  { success: true, consent: boolean }

Response (400):
  { error: "consent must be a boolean" }

Response (500):
  { error: "..." }

Implementation (server.ts lines 186–201):
  1. requireAuth → uid
  2. Validate typeof consent === "boolean" (400 if not)
  3. setDoc(users/{uid}/profile/current, { healthDataConsent: consent, updatedAt: serverTimestamp() }, { merge: true })
  4. Return { success: true, consent }
```

### 4.4 POST /api/fitness/generate-plan — Generate Weekly Plan (F02)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: GeneratePlanRequest (optional)
    { userId, profile?, weekNumber?, adaptationSourcePlanId?, recoveryScore? }
    (If body is empty {}, uses current profile from Firestore)

Response (200):
  { plan: WeeklyPlan, rationale: string, warnings?: string[] }

Response (500):
  { error: "..." }

Implementation (server.ts lines 201–260):
  1. requireAuth → uid
  2. Fetch current profile (getProfile(uid)) — if no profile, 400
  3. Build plan generation prompt (buildPlanGenerationPrompt(profile)) — lines 759–784
  4. Gemini generateContent with F02 system prompt + plan prompt
  5. Parse response as WeeklyPlan JSON
  6. Save plan to Firestore: users/{uid}/plans/{planId}
  7. Return { plan, rationale, warnings }
  8. Sandbox fallback: generateDeterministicPlan(profile) if !ai
```

### 4.5 GET /api/fitness/plan — Get Current Plan (F02)

```
Request:
  Headers: x-user-id: <firebase-uid>

Response (200):
  { plan: WeeklyPlan }

Response (404):
  { error: "No plan found" }

Response (500):
  { error: "..." }

Implementation (server.ts lines 260–290):
  1. requireAuth → uid
  2. Query most recent plan: query(collection(users/{uid}/plans), orderBy("createdAt", "desc"), limit(1))
  3. If no plan → 404
  4. Return { plan: latestPlan }
```

### 4.6 POST /api/fitness/substitute — Find Exercise Substitute (F03)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: { exerciseId: string, preferredEquipment?: string[] }

Response (200):
  { substitutes: ExerciseSubstitute[] }

Response (400):
  { error: "exerciseId is required" }

Response (500):
  { error: "Failed to find substitution" }

Implementation (server.ts lines 290–310):
  1. requireAuth → uid
  2. Validate exerciseId present (400 if missing)
  3. call findExerciseSubstitution(exerciseId, preferredEquipment)
  4. Return { substitutes }
```

### 4.7 POST /api/fitness/checkin — Record Check-in (F09)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: CheckInInput
    { workoutId?, energyLevel, mood?, motivationLevel?, painOrIssues?,
      sleepQuality?, sleepDuration?, workoutCompleted?, notes? }

Response (200):
  { success: true, checkIn: CheckIn }

Response (400):
  { error: "energyLevel is required" }

Response (500):
  { error: "Failed to save check-in" }

Implementation (server.ts lines 312–341):
  1. requireAuth → uid
  2. Validate energyLevel present (400 if missing)
  3. Construct CheckIn from input + serverTimestamp
  4. addDoc(collection(users/{uid}/checkIns), checkIn)
  5. Return { success: true, checkIn }
  6. (F09 sentiment analysis + dropout risk scoring is designed but not wired in current code)
```

### 4.8 POST /api/fitness/log-workout — Log Workout + Trigger Adaptation (F05)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: WorkoutLogEntry (or WorkoutLogEntry shaped object)
    { planId, dayIndex, workoutName?, focus?, exercises: WorkoutExercise[],
      duration?, overallRpe?, notes?, completed?, skipped?, modified?,
      skippedExercises?, modifiedExercises?, ... }

Response (200):
  { success: true, workoutId: string, adaptedPlan?: WeeklyPlan }

Response (400):
  { error: "planId and exercises are required" }

Response (500):
  { error: "Failed to log workout" }

Implementation (server.ts lines 343–370):
  1. requireAuth → uid
  2. Validate planId && exercises?.length > 0 (400 if missing)
  3. Set userId = uid, completed = completed ?? true, createdAt = serverTimestamp()
  4. addDoc(collection(users/{uid}/workouts), workout) → workoutId
  5. Trigger adaptation: generateAdaptation(uid, workout) → adaptedPlan
  6. Return { success: true, workoutId, adaptedPlan }
  7. If adaptation fails → return { success: true, workoutId, adaptedPlan: null }
```

### 4.9 POST /api/fitness/recovery — Compute Recovery Score (F04)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: RecoveryInput
    { sleepDuration?, sleepQuality?, hrv?, restingHeartRate?, steps?,
      activeCalories?, workoutFrequency?, energyLevel?, mood?, motivationLevel? }

Response (200):
  { assessment: RecoveryAssessment }

Response (500):
  { error: "Failed to compute recovery" }

Implementation (server.ts lines 372–394):
  1. requireAuth → uid
  2. call computeRecoveryScore(input) → { score, recommendation, text, factors, dataSources, dataAgeHours }
  3. Construct RecoveryAssessment: { assessedAt: serverTimestamp(), recoveryScore: score, recommendation, recommendationText: text, factors, dataSources, dataAgeHours, generatedBy: "F04" }
  4. addDoc(collection(users/{uid}/recovery), assessment)
  5. Return { assessment }
  6. NOTE: computeRecoveryScore is a deterministic rules-based function (lines 1000–1129), NOT a Gemini call. The architecture specifies Flash Thinking for quality, but the current code uses rules.
```

### 4.10 POST /api/fitness/chat — Coaching Chat (F06)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: ChatRequest
    { message: string, sessionId?: string }

Response (200):
  { response: string, sandbox: boolean }

Response (400):
  { error: "message is required" }

Response (500):
  { error: "Failed to process chat" }

Implementation (server.ts lines 396–470):
  1. requireAuth → uid
  2. Validate message present (400 if missing)
  3. Fetch profile (getProfile(uid)) → build context string
  4. Build fullPrompt: `Context: ${context}\n\nUser question: ${message}\n\nProvide a helpful, personalized fitness coaching response...`
  5. Gemini generateContent with F06_SYSTEM_PROMPT + fullPrompt (temperature: 0.7)
  6. Save message + response to chat session:
     - If sessionId → setDoc(users/{uid}/chatSessions/{sessionId}, { messages: [userMsg, assistantMsg] }, { merge: true })
     - If no sessionId → addDoc(collection(users/{uid}/chatSessions), { messages: [userMsg, assistantMsg] })
  7. Return { response: responseText, sandbox: !ai }
  8. Sandbox fallback: "I'm here to help with your fitness journey!..." if !ai
```

### 4.11 POST /api/fitness/form-cue — Form Cues for Exercise (F07)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: { exerciseId?: string, userDescription?: string }

Response (200):
  { cue: string, sandbox: boolean }

Response (400):
  { error: "..." } (not explicitly checked — exerciseId is optional)

Response (500):
  { error: "Failed to get form cues" }

Implementation (server.ts lines 472–510):
  1. requireAuth → uid
  2. Build prompt from exerciseId + userDescription
  3. Gemini generateContent with F07_SYSTEM_PROMPT + prompt (temperature: 0.7)
  4. Return { cue: response.text || "No form cues available.", sandbox: !ai }
  5. Sandbox fallback: "Form cues unavailable (Gemini API not configured). Focus on controlled movement..." if !ai
```

### 4.12 POST /api/fitness/nutrition — Nutrition Guidance (F08)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: NutritionRequest
    { query: string, profile?: FitnessProfile }

Response (200):
  { guidance: string, disclaimer: string, sandbox: boolean }

Response (400):
  { error: "..." } (not explicitly checked — query is required by the prompt)

Response (500):
  { error: "Failed to get nutrition guidance" }

Implementation (server.ts lines 512–560):
  1. requireAuth → uid
  2. Build prompt: `User nutrition question: "${query}". Profile context: ${profile ? `goal=${profile.goal}, level=${profile.level}` : "none"}. Provide practical, evidence-based nutrition guidance...`
  3. Gemini generateContent with F08_SYSTEM_PROMPT + prompt (temperature: 0.7)
  4. Build response: { guidance: text, disclaimer: text.includes("medical") || text.includes("supplement") ? "This is general nutrition information, not medical advice..." : "This is general fitness nutrition guidance...", sandbox: false }
  5. Sandbox fallback if !ai or Gemini error
```

### 4.13 POST /api/fitness/adapt-plan — Manual Plan Adaptation (F05)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: { reason?: string, workoutData?: any }

Response (200):
  { adaptedPlan: WeeklyPlan }

Response (500):
  { error: "Failed to adapt plan" }

Implementation (server.ts lines 562–574):
  1. requireAuth → uid
  2. call generateAdaptation(uid, workoutData) → adaptedPlan
  3. Return { adaptedPlan }
  4. If error → 500
```

### 4.14 GET /api/fitness/progress — Aggregated Progress Data

```
Request:
  Headers: x-user-id: <firebase-uid>

Response (200):
  {
    totalWorkouts: number,
    completedWorkouts: number,
    totalVolume: number,           // sets × reps × weight summed
    recentWorkouts: WorkoutLogEntry[],  // last 7
    ... (additional aggregated fields)
  }

Response (401):
  { error: "Unauthorized: x-user-id header required" }

Response (500):
  { error: "..." }

Implementation (server.ts lines 576–600):
  1. requireAuth → uid
  2. Query workouts: query(collection(users/{uid}/workouts), orderBy("date", "desc"), limit(50))
  3. Aggregate: totalWorkouts = workouts.length, completedWorkouts = filter(w => w.completed).length, totalVolume = sum over exercises → sets → (weight × reps)
  4. Return aggregated data
  5. NOTE: This is a pure aggregation endpoint — no Gemini call, no token cost.
```

### 4.15 POST /api/fitness/webhook/healthkit — Apple HealthKit Callback (F10)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: HealthKit webhook payload (normalized to WearableInput shape)
    { steps?, activeCalories?, sleepDuration?, restingHeartRate?, hrv?,
      workoutSessions?: { duration, type, calories }[] }

Response (200):
  { success: true, dataProcessed: boolean }

Response (401):
  { error: "Unauthorized" }

Response (500):
  { error: "Failed to process HealthKit data" }

Implementation (server.ts lines 600–650):
  1. requireAuth → uid
  2. Validate healthDataConsent (if false → block, return 403 or error)
  3. Normalize payload to WearableDataPoint shape
  4. addDoc(collection(users/{uid}/wearableData/healthkit), normalizedData)
  5. Optionally trigger F04 recovery recalculation (future)
  6. Return { success: true, dataProcessed: true }
  7. NOTE: This is a stub — the actual HealthKit OAuth + webhook delivery is not yet configured. The endpoint structure is in place.
```

### 4.16 POST /api/fitness/webhook/googlefit — Google Fit Callback (F10)

```
Request:
  Headers: x-user-id: <firebase-uid>
  Body: Google Fit webhook payload (normalized to WearableInput shape)

Response (200):
  { success: true, dataProcessed: boolean }

Response (401):
  { error: "Unauthorized" }

Response (500):
  { error: "Failed to process Google Fit data" }

Implementation (server.ts lines 650–700):
  1. requireAuth → uid
  2. Validate healthDataConsent
  3. Normalize payload to WearableDataPoint shape
  4. addDoc(collection(users/{uid}/wearableData/googlefit), normalizedData)
  5. Optionally trigger F04 recovery recalculation (future)
  6. Return { success: true, dataProcessed: true }
  7. NOTE: Same as HealthKit — stub endpoint, actual Google Fit OAuth + webhook not yet configured.
```

### 4.17 POST /api/evaluate — PolyVerses Compatibility Endpoint

```
Request:
  Headers: (no auth required — this is a legacy PolyVerses endpoint)
  Body: { prompt, priority, role, agentType, userContext }

Response (200):
  { text: string, sandbox: boolean }

Response (500):
  { text: fallback, error: err.message, sandbox: true }

Implementation (server.ts lines 80–133):
  1. Extract agentType from body (opportunity | compliance | prd | rollback | default)
  2. If !ai → generateSandboxResponse(agentType, prompt, priority, role, userContext)
  3. Build agent-specific systemInstruction + modelPrompt
  4. Gemini generateContent with gemini-3.5-flash + systemInstruction (temperature: 0.7)
  5. Return { text: response.text, sandbox: false }
  6. On error → return sandbox fallback + error message
  7. NOTE: This is a legacy PolyVerses endpoint kept for compatibility. The fitness app primarily uses /api/fitness/* endpoints. The default agentType branch acts as F00 Orchestrator Router.
```

---

## 5. Every TypeScript Type — Full Reference

### 5.1 Core Fitness Types (src/types.ts — 613 lines)

#### FitnessProfile (lines 4–34)

```
interface FitnessProfile {
  uid: string;
  email: string;
  displayName: string;
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'weight_loss' | 'general_fitness' | 'maintain' | 'sport_specific';
  level: 'beginner' | 'intermediate' | 'advanced';
  focus: string[];                  // e.g. ['upper_body', 'core', 'cardio']
  injuries: string[];               // e.g. ['left knee pain', 'lower back tightness']
  equipment: string[];              // e.g. ['dumbbells', 'barbell', 'pull-up bar', 'none']
  daysPerWeek: number;              // 1–7
  sessionDuration: number;          // minutes, typically 15–90
  availableDays: string[];          // optional: ['Mon', 'Wed', 'Fri']
  weight?: number;                  // kg or lb — user-specifies unit
  height?: number;
  age?: number;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  healthDataConsent: boolean;       // required before wearable data processing
  disclaimerAccepted: boolean;      // required before first workout
  createdAt: number;                // Unix ms
  updatedAt: number;
}
```

#### WorkoutLogEntry (lines 36–57)

```
interface WorkoutLogEntry {
  id: string;
  userId: string;
  date: number;                     // Unix ms — workout date
  planId: string;                   // which plan this workout came from
  dayIndex: number;                 // which day of the plan (0 = first day)
  exercises: WorkoutExercise[];
  duration: number;                 // minutes
  overallRpe?: number;              // 1–10 Rate of Perceived Exertion
  notes?: string;
  completed: boolean;               // whether the user marked it done
  skippedExercises: string[];       // exercise IDs the user skipped
  modifiedExercises: ModifiedExercise[]; // exercises the user changed
  createdAt: number;
  updatedAt: number;
}
```

#### WorkoutExercise (lines 59–71)

```
interface WorkoutExercise {
  exerciseId: string;
  name: string;
  category: string;
  primaryMuscles: string[];
  prescribedSets: number;
  prescribedReps: number | string;  // 'AMRAP' or a number
  prescribedRestSeconds: number;
  prescribedRpe?: number;
  sets: ExerciseSet[];
}
```

#### ExerciseSet (lines 73–80)

```
interface ExerciseSet {
  setNumber: number;
  reps: number;
  weight: number;
  rpe?: number;
  completed: boolean;
  note?: string;
}
```

#### ModifiedExercise (lines 82–89)

```
interface ModifiedExercise {
  exerciseId: string;
  originalName: string;
  modifiedName: string;
  modificationReason: string;       // 'injury', 'equipment-unavailable', 'too-easy', 'too-hard', 'preference'
  newSets?: number;
  newReps?: number;
}
```

#### WeeklyPlan (lines 91–108)

```
interface WeeklyPlan {
  id: string;
  userId: string;
  weekNumber: number;
  startDate: number;                // Unix ms — Monday of the week
  version: number;                  // incremented on each adaptation
  days: PlanDay[];
  generatedBy: string;              // agent ID, e.g. 'F02'
  adaptedFromPlanId?: string;
  adaptationReason?: string;
  createdAt: number;
  updatedAt: number;
}
```

#### PlanDay (lines 110–120)

```
interface PlanDay {
  dayIndex: number;
  date: number;                     // Unix ms — the day this workout is scheduled
  dayLabel: string;                 // 'Monday' etc.
  focus: string;                    // 'Upper Body Strength', 'Full Body', etc.
  recoveryRecommendation?: 'train_normal' | 'reduce_intensity' | 'rest_day';
  recoveryScore?: number;           // 0–100, if wearable data available
  workouts: PlanWorkout[];
}
```

#### PlanWorkout (lines 122–130)

```
interface PlanWorkout {
  id: string;
  name: string;                     // e.g. 'Upper Body Push'
  focus: string;
  estimatedDuration: number;        // minutes
  warmup?: string[];                // exercise IDs for warmup
  mainExercises: PlanExercise[];
  cooldown?: string[];              // exercise IDs for cooldown / stretch
}
```

#### PlanExercise (lines 132–143)

```
interface PlanExercise {
  exerciseId: string;
  name: string;
  order: number;
  sets: number;
  reps: number | string;
  restSeconds: number;
  rpeTarget?: number;
  notes?: string;                   // e.g. 'Focus on controlled eccentric'
}
```

#### WearableDataPoint (lines 145–187)

```
interface WearableDataPoint {
  id: string;
  userId: string;
  source: 'healthkit' | 'googlefit' | 'strava' | 'garmin' | 'whoop' | 'oura';
  timestamp: number;                // Unix ms
  sleepDuration?: number;           // minutes
  sleepStartTime?: number;
  sleepEndTime?: number;
  sleepStages?: { deep?: number; light?: number; rem?: number; awake?: number; };
  restingHeartRate?: number;        // bpm
  hrv?: number;                     // ms (RMSSD or SDNN — source-dependent)
  heartRateZones?: { zone1?: number; zone2?: number; zone3?: number; zone4?: number; zone5?: number; };
  steps?: number;
  activeCalories?: number;
  activeMinutes?: number;
  floorsClimbed?: number;
  workoutSessions?: WearableWorkout[];
  rawData?: Record<string, unknown>; // passthrough for source-specific fields
  createdAt: number;
}
```

#### WearableWorkout (lines 189–200)

```
interface WearableWorkout {
  startTimestamp: number;
  endTimestamp: number;
  activityType: string;             // 'running', 'cycling', 'rowing', 'strength_training', etc.
  duration: number;                 // minutes
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  distance?: number;                // meters
  laps?: number;
  avgPace?: number;                 // min/km or min/mile
}
```

#### ChatSession (lines 202–211)

```
interface ChatSession {
  id: string;
  userId: string;
  title: string;                    // auto-generated from first message
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
```

#### ChatMessage (lines 213–228)

```
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;                 // which agent generated this (F06, F07, etc.)
  contextSnapshot?: {               // context at time of generation (for traceability)
    profileVersion: number;
    planId?: string;
    planVersion?: number;
    recentWorkoutIds?: string[];
    recoveryScore?: number;
  };
}
```

#### CheckIn (lines 230–253)

```
interface CheckIn {
  id: string;
  userId: string;
  date: number;                     // Unix ms
  workoutId?: string;               // associated workout, if post-workout
  energyLevel: number;              // 1–10
  mood: string;                     // free text or enum
  motivationLevel: number;          // 1–10
  sleepQuality?: number;            // 1–10
  painOrIssues?: string;            // free text
  muscleSoreness?: number;          // 1–10
  stressLevel?: number;             // 1–10
  workoutCompleted: boolean;
  skippedWorkoutReason?: string;
  createdAt: number;
}
```

#### RecoveryAssessment (lines 255–270)

```
interface RecoveryAssessment {
  id: string;
  userId: string;
  assessedAt: number;
  recoveryScore: number;            // 0–100
  recommendation: 'train_normal' | 'reduce_intensity' | 'rest_day' | 'active_recovery';
  factors: RecoveryFactor[];
  dataSources: string[];            // which wearable data was used
  dataAgeHours: number;             // how old the most recent data is
  generatedBy: string;              // agent ID, e.g. 'F04'
}
```

#### RecoveryFactor (lines 272–277)

```
interface RecoveryFactor {
  name: string;                     // 'sleep', 'hrv', 'resting_hr', 'workout_frequency', 'subjective'
  value: number;
  weight: number;                   // 0–1 contribution weight
  notes?: string;
}
```

#### NutritionAdvice (lines 279–294)

```
interface NutritionAdvice {
  id: string;
  userId: string;
  assessedAt: number;
  calorieTarget: number;            // kcal/day
  proteinTarget: number;            // g/day
  carbTarget?: number;              // g/day
  fatTarget?: number;               // g/day
  goal: string;                     // 'muscle_gain', 'fat_loss', 'maintenance', etc.
  notes: string[];
  generatedBy: string;
}
```

#### UserProgressSnapshot (lines 296–325)

```
interface UserProgressSnapshot {
  userId: string;
  generatedAt: number;
  profile: FitnessProfile;
  currentPlanId?: string;
  currentPlanWeek?: number;
  workoutsLast7Days: number;
  workoutsLast30Days: number;
  totalVolumeLast7Days: number;     // sets × reps × weight summed
  estimatedTotalVolumeLast30Days: number;
  avgRecoveryScoreLast7Days: number;
  avgSleepHoursLast7Days: number;
  streakDays: number;
  longestStreakDays: number;
  workoutsPerWeekAverage: number;
  weightEntries: WeightEntry[];
  weightChange30Days?: number;
}
```

#### WeightEntry (lines 327–331)

```
interface WeightEntry {
  date: number;
  weight: number;
  note?: string;
}
```

### 5.2 Agent & Orchestration Types (src/types.ts — lines 333–377)

#### FitnessAgentId (line 335–338)

```
type FitnessAgentId = 'F00' | 'F01' | 'F02' | 'F03' | 'F04' | 'F05' | 'F06' | 'F07' | 'F08' | 'F09' | 'F10' | 'F11';
```

#### FitnessAgent (lines 340–348)

```
interface FitnessAgent {
  id: FitnessAgentId;
  name: string;
  priority: 'High' | 'Medium' | 'Low';
  role: string;
  description: string;
  tools: string[];
  status: 'idle' | 'running' | 'completed' | 'waiting' | 'failed';
}
```

#### FitnessWorkflowStep (lines 350–360)

```
interface FitnessWorkflowStep {
  id: string;
  agentId: FitnessAgentId;
  agentName: string;
  action: string;
  timestamp: string;
  output: string;
  status: 'success' | 'warning' | 'error' | 'pending';
  priority: 'High' | 'Medium' | 'Low';
  confidenceScore?: number;
}
```

#### FitnessHumanGate (lines 362–376)

```
interface FitnessHumanGate {
  id: string;
  agentId: FitnessAgentId;
  agentName: string;
  title: string;
  description: string;
  type: 'approve' | 'modify' | 'rerun' | 'pause';
  schema: Record<string, unknown>;
  agentOutput: {
    detectedRisk?: string;
    recommendedAction?: string;
    overrideAllowedFor?: string;
  };
  status: 'pending' | 'approved' | 'modified' | 'rerun' | 'paused';
}
```

### 5.3 API Request/Response Types (src/types.ts — lines 380–613)

#### GeneratePlanRequest/Response (lines 380–392)

```
interface GeneratePlanRequest {
  userId: string;
  profile: FitnessProfile;
  weekNumber?: number;
  adaptationSourcePlanId?: string;
  recoveryScore?: number;
}
interface GeneratePlanResponse {
  plan: WeeklyPlan;
  rationale: string;                // agent explanation of choices
  warnings?: string[];              // e.g. 'Injury noted: left knee — avoid deep squats'
}
```

#### ChatRequest/ChatResponse (lines 394–411)

```
interface ChatRequest {
  userId: string;
  message: string;
  chatSessionId?: string;
  context: {
    profile: FitnessProfile;
    currentPlanId?: string;
    recentWorkoutIds?: string[];
    recoveryScore?: number;
    wearableDataAgeHours?: number;
  };
}
interface ChatResponse {
  reply: string;
  agentId: FitnessAgentId;
  suggestions?: string[];           // follow-up prompts the coach suggests
}
```

#### LogWorkoutRequest (lines 413–424)

```
interface LogWorkoutRequest {
  userId: string;
  planId: string;
  dayIndex: number;
  exercises: WorkoutExercise[];
  duration: number;
  overallRpe?: number;
  notes?: string;
  completed: boolean;
  skippedExercises?: string[];
  modifiedExercises?: ModifiedExercise[];
}
```

#### RecoveryRequest/Response (lines 426–437)

```
interface RecoveryRequest {
  userId: string;
  wearableData: WearableDataPoint[];
  recentWorkoutCount: number;       // workouts in last 7 days
  checkInData?: CheckIn[];
}
interface RecoveryResponse {
  assessment: RecoveryAssessment;
  recommendation: 'train_normal' | 'reduce_intensity' | 'rest_day' | 'active_recovery';
  explanation: string;
}
```

#### AdaptPlanRequest/Response (lines 439–459)

```
interface AdaptPlanRequest {
  userId: string;
  currentPlanId: string;
  completedWorkouts: string[];      // workout log IDs completed this week
  skippedWorkouts: string[];
  recoveryAssessment?: RecoveryAssessment;
  userFeedback?: string;            // free text from user
}
interface AdaptPlanResponse {
  adaptedPlan: WeeklyPlan;
  changes: PlanChange[];
  rationale: string;
}
```

#### PlanChange (lines 454–459)

```
interface PlanChange {
  type: 'added_exercise' | 'removed_exercise' | 'modified_volume' | 'modified_intensity' | 'swapped_day' | 'rest_day_added' | 'rest_day_removed';
  description: string;
  affectedDayIndex?: number;
  affectedExerciseId?: string;
}
```

#### ExerciseInput (lines 461–473)

```
interface ExerciseInput {
  id: string;
  name: string;
  category: string;
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: string;
  instructions: string;
  commonMistakes: string[];
  substitutionIds: string[];
  videoUrl?: string;
}
```

#### Workout / DailyWorkout / PlanOutput (lines 475–499)

```
interface Workout {
  workoutId: string;
  workoutName: string;
  focus: string;
  duration: number;
  exercises: ExerciseInput[];
}
interface DailyWorkout {
  dayIndex: number;
  date: string;
  recoveryRecommendation?: string;
  workouts: Workout[];
}
interface PlanOutput {
  weekNumber: number;
  startDate: string;
  endDate: string;
  days: DailyWorkout[];
  version: number;
  userId?: string;
  createdAt?: any;
  updatedAt?: any;
}
```

#### WorkoutLogEntry (duplicate, lines 501–516)

```
interface WorkoutLogEntry {
  userId?: string;
  planId: string;
  dayIndex: number;
  workoutName: string;
  focus: string;
  exercises: WorkoutExercise[];
  totalDuration?: number;
  rpe?: number;
  notes?: string;
  completed: boolean;
  skipped: boolean;
  modified: boolean;
  substitutions?: { exerciseId: string; reason: string }[];
  createdAt: any;
}
```

#### ExerciseSubstitute (lines 518–525)

```
interface ExerciseSubstitute {
  exerciseId: string;
  name: string;
  targetMuscles: string[];
  equipment: string[];
  difficulty: string;
  reason: string;
}
```

#### RecoveryInput (lines 527–538)

```
interface RecoveryInput {
  sleepDuration?: number;           // hours
  sleepQuality?: number;            // 1-5
  hrv?: number;                     // ms
  restingHeartRate?: number;        // bpm
  steps?: number;
  activeCalories?: number;
  workoutFrequency?: number;        // workouts in last 7 days
  energyLevel?: number;             // 1-5
  mood?: number;                    // 1-5
  motivationLevel?: number;         // 1-5
}
```

#### ChatRequest/ChatResponse (fitness API version, lines 540–548)

```
interface ChatRequest {
  message: string;
  sessionId?: string;
}
interface ChatResponse {
  response: string;
  sandbox: boolean;
}
```

#### NutritionRequest/NutritionResponse (lines 550–559)

```
interface NutritionRequest {
  query: string;
  profile?: FitnessProfile;
}
interface NutritionResponse {
  guidance: string;
  disclaimer: string;
  sandbox: boolean;
}
```

#### CheckInInput (lines 561–571)

```
interface CheckInInput {
  workoutId?: string;
  energyLevel?: number;            // 1-5
  mood?: number;                   // 1-5
  painOrIssues?: string;
  sleepQuality?: number;           // 1-5
  sleepDuration?: number;          // minutes
  motivationLevel?: number;        // 1-5
  workoutCompleted?: boolean;
  notes?: string;
}
```

#### SubscriptionTier / UserSubscription / TIER_FEATURES (lines 573–613)

```
type SubscriptionTier = 'free' | 'premium' | 'elite';

interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelledAt?: number;
  updatedAt: number;
}

const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  free: [
    'Basic weekly workout plan (non-adaptive)',
    'Exercise library access',
    'Workout logging',
    'Progress dashboard',
    '5 chat sessions per week',
  ],
  premium: [
    'Fully adaptive weekly plans (progressive overload)',
    'Unlimited coaching chat',
    'Apple HealthKit / Google Fit integration',
    'Recovery-based plan adaptation',
    'Daily digest notifications',
    'Motivation coach (sentiment analysis)',
    'Plan adaptation on workout completion',
    'Exercise substitution engine',
  ],
  elite: [
    'Everything in Premium',
    'All wearable integrations (Strava, Garmin, WHOOP, Oura)',
    'Nutrition advisor agent (calorie/macro targets)',
    'GLP-1 / special population mode',
    'Text-based form coaching',
    'Priority support',
    'Early access to new features (CV form analysis, AR coaching)',
  ],
};
```

---

## 6. Every Data Flow — Step by Step

### 6.1 Onboarding Flow

```
User signs up (Google OAuth via Firebase Auth)
  │
  ├─→ Firebase Auth creates user with UID
  │
  ▼
Onboarding screen: collect fitness profile fields
  │
  ├─→ FitnessOnboarding.tsx renders form
  │   ├─ Goal select (strength / hypertrophy / endurance / weight_loss / general_fitness / maintain / sport_specific)
  │   ├─ Level select (beginner / intermediate / advanced)
  │   ├─ Injuries text input (comma-separated)
  │   ├─ Equipment multi-select (dumbbells, barbell, pull-up bar, etc.)
  │   ├─ Days per week slider (1–7)
  │   ├─ Session duration slider (15–90 min)
  │   ├─ Focus areas multi-select
  │   ├─ Biometrics (weight, height, age, gender) — optional
  │   ├─ Health data consent toggle
  │   └─ Disclaimer acceptance checkbox
  │
  ▼
POST /api/fitness/profile (F01)
  │
  ├─→ Headers: x-user-id: <firebase-uid>
  │   ├─ Body: { goal, level, injuries, equipment, daysPerWeek, sessionDuration, focus, biometrics, healthDataConsent, disclaimerAccepted }
  │   └─ Server: requireAuth → uid
  │       ├─ Validate goal && level present
  │       ├─ Construct full FitnessProfile
  │       └─ saveProfile(uid, full) → setDoc(users/{uid}/profile/current, merge: true)
  │
  ▼
Save to Firestore: users/{uid}/profile/current
  │
  ▼
Trigger F02: generate initial weekly plan
  │
  ├─→ POST /api/fitness/generate-plan (body: {})
  │   ├─ Server: requireAuth → uid
  │   ├─ Fetch profile: getProfile(uid)
  │   ├─ Build plan generation prompt: buildPlanGenerationPrompt(profile)
  │   ├─ Gemini generateContent with F02 system prompt
  │   ├─ Parse response as WeeklyPlan JSON
  │   └─ Save plan: addDoc(users/{uid}/plans/{planId}, plan)
  │
  ▼
Save to Firestore: users/{uid}/plans/{planId}
  │
  ▼
Redirect to Today's Workout / Weekly Plan view
  │
  ├─→ App.tsx: setPlan(data.plan) → setOnboarded(true)
  ├─→ Today's Workout tab: getTodayWorkout() → render workout
  └─→ Weekly Plan tab: renderWeeklyPlan() → 7-day grid
```

### 6.2 Workout Execution Flow

```
User taps today's workout
  │
  ▼
GET /api/fitness/plan (F02)
  │
  ├─→ Headers: x-user-id: <firebase-uid>
  │   ├─ Server: requireAuth → uid
  │   ├─ Query latest plan: query(users/{uid}/plans, orderBy("createdAt", "desc"), limit(1))
  │   └─ Return { plan: latestPlan }
  │
  ▼
App.tsx: setPlan(data.plan)
  │
  ▼
getTodayWorkout()
  │
  ├─→ Find day matching today's dayIndex (Sunday=6, Mon=0, ..., Sat=5)
  ├─→ Return { day, workout: day.workouts[0] }
  └─→ If no workout today → render "No workout scheduled today" with "Generate My Plan" button
  │
  ▼
Render Today's Workout
  │
  ├─→ Workout header: name, focus, duration
  ├─→ Exercise cards: each exercise with prescribedSets, prescribedReps, prescribedRestSeconds
  ├─→ Per-set inputs: reps, weight, complete toggle
  ├─→ Rest timer button (starts countdown)
  ├─→ Next set button
  ├─→ Skip Workout button (red)
  └──→ Complete Workout button (green)
  │
  ▼
User logs sets/reps/weight per exercise
  │
  ├─→ exerciseLogs state: Record<exerciseId, ExerciseSet[]>
  ├─→ Each set: { setNumber, reps, weight, rpe?, completed, note? }
  │
  ▼
User taps "Complete Workout"
  │
  ▼
POST /api/fitness/log-workout (F05)
  │
  ├─→ Headers: x-user-id: <firebase-uid>, Content-Type: application/json
  │   ├─ Body: WorkoutLogEntry
  │   │   ├─ userId: currentUser.uid
  │   │   ├─ planId: plan.id || plan.weekNumber.toString()
  │   │   ├─ dayIndex: todayWorkout.day.dayIndex
  │   │   ├─ workoutName: todayWorkout.workout.workoutName
  │   │   ├─ focus: todayWorkout.workout.focus
  │   │   ├─ exercises: Object.entries(exerciseLogs).map(([exId, sets]) => ({
  │   │   │     exerciseId: exId,
  │   │   │     name: ExerciseLibrary.getExercise(parseInt(exId))?.name || exId,
  │   │   │     category: '',
  │   │   │     primaryMuscles: [],
  │   │   │     prescribedSets: sets.length,
  │   │   │     prescribedReps: '',
  │   │   │     prescribedRestSeconds: 60,
  │   │   │     sets: sets.map((s, i) => ({
  │   │   │       setNumber: i + 1,
  │   │   │       reps: s.reps || 0,
  │   │   │       weight: s.weight || 0,
  │   │   │       rpe: s.rpe,
  │   │   │       completed: s.completed,
  │   │   │       note: s.note,
  │   │   │     })),
  │   │   │   })),
  │   │   ├─ duration: 0,
  │   │   ├─ completed: true,
  │   │   ├─ skipped: false,
  │   │   ├─ modified: false,
  │   │   └─ createdAt: Date.now()
  │   └─ Server:
  │       ├─ requireAuth → uid
  │       ├─ Validate planId && exercises?.length > 0
  │       ├─ Set userId, completed, createdAt
  │       ├─ addDoc(users/{uid}/workouts/{workoutId}, workout) → workoutId
  │       └─ generateAdaptation(uid, workout) → adaptedPlan
  │           ├─ Fetch current plan + workout logs + recovery scores
  │           ├─ Build adaptation prompt
  │           ├─ Gemini generateContent with F05 system prompt
  │           ├─ Parse adapted plan
  │           └─ Save adapted plan: addDoc(users/{uid}/plans/{newPlanId}, adaptedPlan)
  │
  ▼
Response: { success: true, workoutId, adaptedPlan? }
  │
  ▼
App.tsx:
  │
  ├─→ alert('Workout logged! Your plan will adapt for next week.')
  ├─→ setExerciseLogs({})
  ├─→ setTodayWorkout(null)
  └─→ fetchPlan() → reload current plan (adapted version if applicable)
```

### 6.3 Conversational Coach Flow

```
User sends message in Coach Chat
  │
  ▼
POST /api/fitness/chat (F06)
  │
  ├─→ Headers: x-user-id: <firebase-uid>, Content-Type: application/json
  │   ├─ Body: { message: "How should I progress my squats?", sessionId?: "chat-abc123" }
  │   └─ Server:
  │       ├─ requireAuth → uid
  │       ├─ Validate message present
  │       ├─ Fetch profile: getProfile(uid)
  │       ├─ Build context string:
  │       │   `User profile: goal=${profile.goal}, level=${profile.level},
  │       │    injuries=[${profile.injuries.join(", ")}],
  │       │    equipment=[${profile.equipment.join(", ")}],
  │       │    daysPerWeek=${profile.daysPerWeek},
  │       │    sessionDuration=${profile.sessionDuration}min`
  │       ├─ Build fullPrompt:
  │       │   `Context: ${context}\n\nUser question: ${message}\n\n
  │       │    Provide a helpful, personalized fitness coaching response.
  │       │    Be encouraging but factual. If the question is about injuries
  │       │    or medical conditions, include a disclaimer...`
  │       ├─ Gemini generateContent:
  │       │   ├─ model: "gemini-3.5-flash"
  │       │   ├─ contents: fullPrompt
  │       │   └─ config: { systemInstruction: F06_SYSTEM_PROMPT, temperature: 0.7 }
  │       ├─ responseText = response.text || "Sorry, I couldn't generate a response."
  │       ├─ Build message data:
  │       │   ├─ userMsg: { id: crypto.randomUUID(), role: "user", content: message, timestamp: serverTimestamp(), agentId: "F06" }
  │       │   └─ assistantMsg: { id: crypto.randomUUID(), role: "assistant", content: responseText, timestamp: serverTimestamp(), agentId: "F06" }
  │       ├─ Save to chat session:
  │       │   ├─ If sessionId → setDoc(users/{uid}/chatSessions/{sessionId}, { messages: [userMsg, assistantMsg] }, { merge: true })
  │       │   └─ If no sessionId → addDoc(collection(users/{uid}/chatSessions), { messages: [userMsg, assistantMsg] })
  │       └─ Return { response: responseText, sandbox: !ai }
  │
  ▼
Response: { response: "...", sandbox: false }
  │
  ▼
App.tsx: renderCoachChat()
  │
  ├─→ Display user message + assistant response
  ├─→ If sandbox → show "AI not configured" indicator
  └─→ (Future: chat message list with scrollback, session persistence, follow-up suggestions)
```

### 6.4 Daily Digest Flow (Designed — Not Yet Implemented)

```
Every morning (cron or scheduled function)
  │
  ├─→ For each active premium user:
  │   │
  │   ├─→ Fetch sleep data (if wearable connected)
  │   │   └─→ Query users/{uid}/wearableData/healthkit or googlefit, most recent
  │   │
  │   ├─→ Fetch yesterday's workout (if any)
  │   │   └─→ Query users/{uid}/workouts, orderBy("date", "desc"), limit(1)
  │   │
  │   ├─→ Fetch today's plan
  │   │   └─→ Query users/{uid}/plans, orderBy("createdAt", "desc"), limit(1)
  │   │
  │   ├─→ Compose digest message:
  │   │   ├─ "Good morning! Here's your fitness update:"
  │   │   ├─ If workout yesterday: "You completed [workout name] — great job!"
  │   │   ├─ If recovery score available: "Your recovery score is [score]/100 — [recommendation]"
  │   │   ├─ If today's workout: "Today's workout: [name] — [focus], [duration] min"
  │   │   └─ Motivational closing (F09 tone)
  │   │
  │   └─→ Send push notification via FCM
  │       └─→ (Future: FCM topic or direct push to user's device token)
  │
  └─→ Log: digest sent timestamp per user
      └─→ (Future: users/{uid}/notifications/{notifId} with digest timestamp)
```

---

## 7. Client-Side Architecture — App.tsx + Components

### 7.1 App.tsx (643 lines) — The App Shell

```
App.tsx structure:
├── Imports (lines 1–12)
│   ├── React: useState, useEffect
│   ├── FitnessOnboarding component
│   ├── Lucide icons: Target, Dumbbell, Activity, Heart, Clock, BarChart3, Users, Zap,
│   │   ChevronUp, ChevronDown, Pause, Play, Plus, Minus, Clock as ClockIcon,
│   │   Sparkles, Check, AlertTriangle, Settings, LogOut
│   ├── firebase: auth, db, handleFirestoreError, OperationType
│   ├── firebase/auth: onAuthStateChanged, signOut, User
│   ├── firestore: doc, getDoc, setDoc, serverTimestamp
│   ├── types: FitnessProfile, WeeklyPlan, WorkoutLogEntry
│   └── ExerciseLibrary
├── Types (line 14)
│   └── FitnessTab = 'today' | 'weekly' | 'progress' | 'coach' | 'settings'
├── State (lines 17–28)
│   ├── onboarded: boolean
│   ├── currentUser: User | null
│   ├── loading: boolean
│   ├── activeTab: FitnessTab
│   ├── profile: FitnessProfile | null
│   ├── plan: WeeklyPlan | null
│   ├── todayWorkout: { day, workout } | null
│   ├── expandedDay: number | null
│   ├── restTimer: number | null
│   ├── currentSet: { exerciseId, setNumber } | null
│   ├── exerciseLogs: Record<string, any[]>
│   └── showCoachPanel: boolean
├── Effects (lines 30–76)
│   ├── onAuthStateChanged (lines 30–50)
│   │   ├─ On user sign-in: fetch profile from users/{uid}/profile/current
│   │   ├─ If profile exists → setProfile + setOnboarded(true)
│   │   └─ Set loading(false)
│   └── fetchPlan on profile load (lines 58–76)
│       └─ GET /api/fitness/plan → setPlan(data.plan)
├── Handlers (lines 78–180)
│   ├── generatePlan (lines 78–93) → POST /api/fitness/generate-plan
│   ├── getTodayWorkout (lines 95–104) → find day by dayIndex
│   ├── handleSetComplete (lines 110–120) → toggle set completed
│   ├── handleStartRestTimer (lines 122–125) → set restTimer seconds
│   ├── handleNextSet (lines 127–131) → advance setNumber
│   └── handleSubmitWorkout (lines 133–180) → POST /api/fitness/log-workout
├── Render functions (lines 190–557)
│   ├── renderToday (lines 190–354) — Today's Workout tab
│   │   ├─ Empty state: "No workout scheduled today" + generatePlan button
│   │   ├─ Workout header: name, focus, duration, rest timer
│   │   ├─ Exercise cards with set logging (reps, weight, complete toggle)
│   │   ├─ Rest timer display + button
│   │   ├─ Next set button
│   │   ├─ Skip Workout (red) + Complete Workout (green) buttons
│   │   └─ Disclaimer footer
│   ├── renderWeeklyPlan (lines 356–457) — Weekly Plan tab
│   │   ├─ Empty state: "No plan yet" + generatePlan button
│   │   ├─ 7-day grid (Sun–Sat) with expand/collapse
│   │   ├─ Today's day highlighted (blue border)
│   │   └─ Expanded day: workout details with exercises, sets, reps, rest
│   ├── renderProgress (lines 459–470) — Progress tab
│   │   └─ Placeholder: "Track your strength trends... Coming soon"
│   ├── renderCoachChat (lines 472–483) — Coach Chat tab
│   │   └─ Placeholder: "Chat with your AI fitness coach... Coming soon"
│   └── renderSettings (lines 485–557) — Settings tab
│       ├─ Edit Profile button
│       ├─ Wearable Connections button
│       ├─ Notifications button
│       ├─ Disclaimer & Safety button
│       ├─ About PolySync section with GitHub link
│       └─ Sign Out button
├── Loading state (lines 559–566)
│   └─ Activity icon + "Loading PolySync..." text
├── Onboarding state (lines 568–570)
│   └─ FitnessOnboarding component
└── Main render (lines 572–643)
    ├── Background gradient
    ├── Header: PolySync logo + "AI Fitness Coach" badge + goal display + status pills
    ├── Tab navigation: Today's Workout, Weekly Plan, Progress, Coach Chat, Settings
    ├── Tab content: renderToday / renderWeeklyPlan / renderProgress / renderCoachChat / renderSettings
    └── Footer disclaimer
```

### 7.2 Component Inventory

| Component | File | Status | Role |
|---|---|---|---|
| **FitnessOnboarding** | src/components/FitnessOnboarding.tsx (734 lines) | Implemented | Onboarding form — goal, level, injuries, equipment, days/week, session duration, focus, biometrics, health data consent, disclaimer acceptance. On complete → calls handleOnboardingComplete → POST /api/fitness/profile. |
| **OrchestrationConsole** | src/components/OrchestrationConsole.tsx (not yet adapted for fitness) | PolyVerses legacy — needs fitness adaptation | Agent network diagram + orchestration console. In fitness context: visualize F00–F11 agent network, show workflow steps (onboarding → plan generation → compliance check → plan delivery → workout log → adaptation). |
| **D3Heatmap** | src/components/D3Heatmap.tsx | Implemented | Agent telemetry heatmap — shows F00–F11 agent activity over time. |
| **RechartsHeatmap** | src/components/RechartsHeatmap.tsx | Implemented | Progress/retention charts — workout frequency, volume trends, recovery score distribution. |
| **ObservabilityDashboard** | src/components/ObservabilityDashboard.tsx | Implemented (PolyVerses-style) | Observability dashboard — agent telemetry, coaching quality metrics, engagement funnel, retention cohorts, API cost tracking. Needs rewiring to fitness agents. |
| **PromptConsole** | src/components/PromptConsole.tsx | Implemented (PolyVerses-style) | Prompt console — browse/copy agent system prompts. In fitness: F00–F11 system prompts. |
| **CodeBrowser** | src/components/CodeBrowser.tsx | Implemented (PolyVerses-style) | Code browser — sample code for agents. In fitness: F00–F11 sample code. |
| **FitnessOnboarding** | src/components/FitnessOnboarding.tsx | Implemented | The onboarding flow — replaces PolyVerses' Onboarding.tsx. |

### 7.3 Tab Navigation

```
tabs: { id: FitnessTab; icon: any; label: string }[] = [
  { id: 'today',    icon: Activity,    label: "Today's Workout" },
  { id: 'weekly',   icon: Target,      label: 'Weekly Plan' },
  { id: 'progress', icon: BarChart3,   label: 'Progress' },
  { id: 'coach',    icon: Sparkles,    label: 'Coach Chat' },
  { id: 'settings', icon: Settings,    label: 'Settings' },
];
```

---

## 8. Technology Stack — Every Layer

| Layer | Technology | Version | Role |
|---|---|---|---|
| Frontend framework | React | 19.x | UI components, state management, tab navigation |
| Build tool | Vite | 6.x | Dev server (middleware mode) + production build |
| Language | TypeScript | ~5.8 | Type safety across client + server |
| Styling | Tailwind CSS | 4.x | Utility-first styling, dark theme (#0C0C0E bg, #121215 surfaces) |
| Animation | Motion (framer-motion successor) | 12.x | Animations (rest timer, transitions, etc.) |
| Charts | Recharts + D3 | 3.9 / 7.9 | Progress dashboard, agent heatmap, recovery score distribution |
| Icons | Lucide React | 0.546 | UI icons (Activity, Target, Dumbbell, Heart, Clock, BarChart3, etc.) |
| Server runtime | Express + tsx (dev) / esbuild (prod) | 4.21 / 4.21 / 0.25 | API server, static serving, Gemini client |
| AI backend | @google/genai (Gemini) | 2.4 | Gemini 3.5 Flash / Flash Thinking client — all agent LLM calls |
| Auth | Firebase Auth (Google SSO) | 12.15 | User authentication — Google OAuth → Firebase UID |
| Database | Firebase Firestore | 12.15 | Per-user data storage — profiles, workouts, plans, recovery, wearables, chats, check-ins |
| Deployment | Node.js server (self-hosted or serverless) | 18+ | Production deployment target |
| Future: Push notifications | Firebase Cloud Messaging | — | Daily digest push notifications (not yet implemented) |
| Future: Payments | Stripe | — | Subscription tiers (free/premium/elite) — not yet implemented |
| Future: Mobile | React Native or PWA upgrade | — | Mobile app — not yet implemented |

### 8.1 Package.json Dependencies

```
{
  "name": "polysync-ai-fitness-coach",
  "dependencies": {
    "@google/genai": "^2.4.0",
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "d3": "^7.9.0",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "firebase": "^12.15.0",
    "firebase-admin": "^14.4.0",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "node-cron": "^4.6.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "recharts": "^3.9.0",
    "uuid": "^14.0.2",
    "vite": "^6.2.3"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.1.14",
    "tsx": "^4.21.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.3"
  }
}
```

Note: `node-cron` is present in package.json but not yet used in the fitness server.ts. It's intended for the distillation scheduler (governance layer, future).

### 8.2 Scripts

```
"scripts": {
  "dev": "tsx server.ts",                          // dev: Vite middleware + Express
  "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
  "start": "node dist/server.cjs",                 // prod: serve dist/server.cjs
  "clean": "rm -rf dist server.js",
  "lint": "tsc --noEmit"
}
```

---

## 9. Security Model — Full Detail

### 9.1 Authentication

| Layer | Mechanism | Details |
|---|---|---|
| Sign-up | Firebase Google SSO | User signs in with Google OAuth → Firebase creates user with UID |
| Session | Firebase Auth token | Client holds Firebase Auth token; sends x-user-id header (UID extracted from token) to server |
| Server auth | x-user-id header | `requireAuth(req, res)` extracts UID from header; returns 401 if missing |
| Email verification | Required for write operations | Firestore rules enforce email verification before write |

### 9.2 Firestore Security Rules

| Rule | Enforcement | Details |
|---|---|---|
| Default-deny | All collections | No read/write without explicit rule allowing it |
| Per-user ownership | `users/{uid}/...` | Rules check that the requesting user's UID matches the document path UID |
| Email verification | Write operations | `request.auth.token.email_verified == true` required for writes |
| Validated schemas | Each collection | Rules validate document shape (e.g., profile has required fields) |
| Immutable fields | createdAt, workout logs | Protected from client modification — server writes these with serverTimestamp() |
| Health data consent | Wearable data read/write | `get(/databases/$(database)/documents/users/$(request.auth.uid)/profile/current).data.healthDataConsent == true` required before wearable data access |
| Disclaimer acceptance | First workout | Required before first workout log (enforced in profile, checked on log-workout) |

See `firestore.rules` and `security_spec.md` for the full rule set.

### 9.3 API Key Security

| Concern | Mitigation |
|---|---|
| Gemini API key exposure | Key held server-side only in `GEMINI_API_KEY` env var. Never shipped to browser. Client calls app's own API endpoints — never calls Gemini directly. |
| Key leakage via errors | Error messages returned to client do not include the API key. Gemini errors are caught and returned as generic "Gemini API unavailable" messages. |
| Sandbox fallback | If `GEMINI_API_KEY` is missing or equals `"MY_GEMINI_API_KEY"`, server runs in sandbox mode — all LLM calls return deterministic sandbox responses. No real API calls made. |

### 9.4 Health Data Security

| Concern | Mitigation |
|---|---|
| Consent before wearable data | `healthDataConsent` flag on FitnessProfile. Checked at API level (wearable endpoints should block if false) and enforced by Firestore rules. |
| Encryption at rest | Firebase Firestore encrypts all data at rest by default. |
| Not used for model training | Gemini API calls are made with user data as context, but the data is not retained by Google for training (Gemini API terms). |
| GDPR/CCPA deletion | Firebase Admin SDK can delete user data across all collections on request (future — deletion pipeline not yet implemented). |

### 9.5 Compliance

| Concern | Mitigation |
|---|---|
| Fitness disclaimer | All AI-generated workout content includes "AI-generated fitness guidance. Listen to your body and consult a professional for injuries." rendered in App.tsx (line 349–351) and server responses. |
| Medical queries | F06 system prompt includes safety rules: "If asked about injuries or medical conditions, recommend consulting a healthcare professional and do not give specific medical advice." F08 includes similar rules for nutrition. |
| Injury-exercise conflicts | F02 exercise selection (`selectExercisesForGoal`) filters out exercises that target injured body parts (lines 866–872 of server.ts). |
| Special modes | `specialMode` field on FitnessProfile (e.g., "GLP-1", "postpartum", "injury_rehab"). Designed to adjust safety thresholds — not yet fully implemented in code. |

---

## 10. Deployment Model

### 10.1 Development

```
npm run dev
  → tsx server.ts
  → Express server on port 3000
  → Vite middleware mode (serves React app with HMR)
  → Gemini client initialized (or sandbox if no API key)
  → Firebase connected (from src/firebase.ts)
```

### 10.2 Production Build

```
npm run build
  → vite build → dist/ (React app static assets)
  → esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs
  → node dist/server.cjs
  → Express server on port 3000
  → Serves dist/ static assets + SPA fallback
  → Gemini client initialized
  → Firebase connected
```

### 10.3 Hosting Options

| Option | Details |
|---|---|
| Self-hosted Node.js | Deploy to any Node.js host (EC2, DigitalOcean, Render, Fly.io). Run `node dist/server.cjs`. Set `GEMINI_API_KEY` and `FIREBASE_PROJECT_ID` env vars. |
| Serverless (Vercel) | Deploy as Vercel serverless functions. The esbuild bundle is Node-compatible. Vercel handles scaling. Set env vars in Vercel dashboard. |
| Serverless (AWS Lambda) | Use Lambda with Node.js adapter. The esbuild bundle can be packaged as a Lambda deployment. API Gateway fronts the Lambda. |
| Serverless (Google Cloud Run) | Containerize the Node.js server, deploy to Cloud Run. Scales to zero when idle. |

### 10.4 Firebase Configuration

| Resource | Value |
|---|---|
| Firebase project | `mythical-hour-zbndl` |
| Firestore database | `ai-studio-polyverses-619398f7-7b6f-4bfd-a018-f7c56956dd81` |
| Auth provider | Google SSO |
| Storage | Not yet used (future — exercise video URLs, user uploaded content) |
| Cloud Messaging | Not yet configured (future — push notifications) |

---

## 11. Governance Layer — Designed, Not Yet Implemented

The governance layer is a set of wrappers and new components that sit ON TOP of the existing 12-agent mesh (F00–F11) and 16 endpoints. It does not replace any existing functionality — it adds token budget enforcement, circuit breakers, observability, context caching, scheduled distillation, and a knowledge layer that indexes the existing Firestore data.

### 11.1 Why This Layer Is Needed

The fitness codebase has no token tracking. Every Gemini call burns tokens with no record. A heavy chat user can burn 500K+ tokens in one session without anyone knowing. There's no session budget, no circuit breaker, no observability endpoint, no cache for repeated queries, and no distillation of accumulated fitness data into insights.

### 11.2 Session Token Budget (Designed)

| Field | Value |
|---|---|
| Budget | 200,000 tokens per session |
| Tracked via | `sessionBudgets` Map<sessionId, { tokens_used, started_at, specialist_invocations }> |
| Session ID | `x-session-id` header, or `uuidv4()` if absent |
| Check point | Every `/api/fitness/*` endpoint that makes a Gemini call |
| Exceeded behavior | 429 with `error: "Session token budget exceeded"`, `session_id`, `budget` snapshot |
| Warning threshold | >50% used AND <20% remaining → reason in budget response, call not blocked |
| Reset | On server restart (in-memory) |

**Estimated per-user weekly burn (moderately active user):**
- F00 routing: 7 days × 5 requests/day × 1K = 35K
- F02 weekly plan: 15K
- F04 daily recovery: 7 × 2K = 14K
- F06 coaching chat: 7 days × 3 messages/day × 6K = 126K
- F09 motivation: 7 × 1.5K = 10.5K
- F11 compliance: 15K (per plan generation)
- **Total: ~215K tokens/user/week** — within the 200K session budget for a single session, but a heavy chat day can exceed it.

### 11.3 Circuit Breakers (Designed)

| Tier | Model | Used by | Behavior when open |
|---|---|---|---|
| small | Gemini 3.5 Flash | F01, F03, F07, F08, F09, F11 (light calls) | Fall back to sandbox |
| medium | Gemini 3.5 Flash (reasoning) | F02, F04, F05, F06 (reasoning calls) | Fall back to Flash without thinking |
| capable | Gemini 3.5 Pro (if available) | F02 (high-quality plans), F06 (high-quality coaching) | Fall back to Flash Thinking |

**Trigger:** 3 failures in 5 minutes for the same tier → open breaker → subsequent calls return 429.

**Current reality:** no circuit breakers. Gemini failures are caught with try/catch and fallback to sandbox messages, but the failure isn't counted and the next request will try Gemini again.

### 11.4 Observability Endpoint (Designed)

```
GET /api/budget
Response:
{
  session_tokens_used: number,
  session_budget: 200000,
  session_remaining: number,
  weekly_tokens_used: number,
  weekly_tokens_budget: 1500000,
  agent_breakdown: { F00: n, F01: n, F02: n, F03: n, F04: n, F05: n, F06: n, F07: n, F08: n, F09: n, F10: 0, F11: n },
  circuit_breakers: [
    { tier: "small", status: "closed", reason?: string },
    { tier: "medium", status: "closed", reason?: string },
    { tier: "capable", status: "closed", reason?: string }
  ],
  cache_stats: { size: number, max: 100, hit_rate_estimate: number },
  distillation_stats: { level2_run_count: number, level3_run_count: number, level4_run_count: number, tokens_distilled_this_week: number }
}
```

### 11.5 Context Cache (Designed)

| Field | Value |
|---|---|
| Store | In-memory Map<string, CacheEntry> |
| Max entries | 100 |
| TTL | 24 hours |
| Eviction | LRU — when full, remove 20% of least-recently-accessed |
| Key | `sessionId:hashed(userMessage + intent)` |
| Cached endpoints | F06 chat (cache response for repeated message), F04 recovery (cache score if wearable data unchanged), F02 plan (cache plan if profile unchanged) |
| Not cached | F11 compliance (safety-critical — every check must be fresh), F09 motivation (tone adapts to current state), F10 ETL (no LLM call) |

### 11.6 Distillation Pipeline (Designed)

| Level | Cron | What it produces | Per-user cost | Storage |
|---|---|---|---|---|
| Level 2 (gist) | "0 3 * * 0" — Sunday 3am | Weekly fitness gist: volume trend, recovery trend, common exercises, check-in patterns, chat themes | ~2K | users/{uid}/weeklyGists/{weekStartDate} |
| Level 3 (summary) | "0 4 1 * *" — 1st of month 4am | Monthly fitness summary: progress toward goal, consistency score, recovery health, form concerns, nutrition patterns | ~4K | users/{uid}/monthlySummaries/{month} |
| Level 4 (principle) | "0 5 1 1,4,7,10 *" — 1st of Jan/Apr/Jul/Oct 5am | Atomic coaching principles: recurring patterns, stall points, proactive tip opportunities | ~4K | users/{uid}/coachingPrinciples (array on profile) |

**Token budget for distillation (per 100 users):** ~233K tokens/week (L2: 200K + L3: 30K + L4: 3K).

### 11.7 Knowledge Layer — FitnessNote (Designed)

```
FitnessNote {
  id: string (UUID)
  uid: string
  source_collection: 'workouts' | 'checkIns' | 'chatSessions' | 'recovery' | 'wearableData' | 'plans'
  source_doc_id: string
  source_type: 'workout_log' | 'check_in' | 'chat_message' | 'recovery_assessment' | 'wearable_snapshot' | 'weekly_plan'
  verbatim_text: string
  classifier: FitnessClassifier
  para_bucket: 'Project' | 'Area' | 'Resource' | 'Archive'
  project_id?: string              // e.g. "goal_build_muscle"
  distillation_level: 1 | 2 | 3 | 4
  gist?: string
  summary?: string
  principle?: string
  created_at: string
  updated_at: string
  engagement_score: number
  graph_edges?: GraphEdge[]
}

FitnessClassifier {
  type: 'workout' | 'check_in' | 'chat' | 'recovery' | 'nutrition' | 'form' | 'motivation' | 'plan'
  entities: string[]              // exercises, body parts, supplements, goals
  date?: string
  decision_made: boolean          // plan change, rest recommendation
  open_questions: string[]        // unanswered user questions
}

GraphEdge {
  target_type: 'note' | 'workout' | 'exercise' | 'goal' | 'check_in' | 'recovery'
  target_id: string
  relation: 'PART_OF_WEEK' | 'FOLLOWS' | 'CITES' | 'RELATED_TO' | 'RECOVERED_FROM' | 'PAIN_REPORTED_FOR'
  direction: 'outgoing' | 'incoming'
}
```

**How it indexes existing collections:**

| Existing collection | Creates FitnessNote with... |
|---|---|
| users/{uid}/workouts/{workoutId} | source_collection: "workouts", source_type: "workout_log", classifier.type: "workout", entities: ["squat", "bench_press"], project_id: "goal_build_muscle" |
| users/{uid}/checkIns/{checkInId} | source_collection: "checkIns", source_type: "check_in", classifier.type: "check_in", decision_made: false |
| users/{uid}/chatSessions/{sessionId}/messages/{messageId} | source_collection: "chatSessions", source_type: "chat_message", classifier.type: "chat", open_questions: ["how much protein?"] |
| users/{uid}/recovery/{assessmentId} | source_collection: "recovery", source_type: "recovery_assessment", classifier.type: "recovery", decision_made: true (if rest recommended) |
| users/{uid}/wearableData/{source}/{timestamp} | source_collection: "wearableData", source_type: "wearable_snapshot", classifier.type: "recovery" |

### 11.8 Governance API Endpoints (Designed)

| Endpoint | Purpose | Tokens |
|---|---|---|
| GET /api/budget | Session tokens, agent breakdown (F00–F11), circuit breakers, cache stats, distillation stats | 0 |
| POST /api/fitness/capture-note | Index Firestore data into FitnessNote with classifier | ~2K |
| POST /api/fitness/think | Intent router + retrieval + assembly — recall from indexed fitness data, no capable model | ~2K + ~2K |
| POST /api/fitness/specialist | Invoke F00–F11 with governance wrapper — budget check + circuit breaker + token tracking | 1–15K |
| POST /api/fitness/gates/:id/decide | Human gate for medical queries (F11) + significant plan changes (F05) | 0 |
| POST /api/fitness/distill/batch | Manual distillation trigger — Level 2/3/4 for specific users or all users | 2–4K/user |

### 11.9 Build Sequence — 5 Phases

**Phase 1 — Token tracking + session budget:**
1. Add `recordTokenUsage()`, `checkSessionBudget()`, `sessionBudgets` Map to server.ts
2. Add token estimation to every Gemini call in F00–F11
3. Add `checkSessionBudget()` before every Gemini call → 429 if exceeded
4. Add `GET /api/budget` endpoint — session tokens + agent breakdown
5. Add `x-session-id` header handling — client generates on mount

**Phase 2 — Circuit breakers + observability:**
1. Add `circuitBreakers` object + `checkCircuitBreaker()` + `openCircuitBreaker()`
2. Wire before every Gemini call → 429 if open for that tier
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
6. Add Level 2/3/4 storage collections (weeklyGists, monthlySummaries, coachingPrinciples)

**Phase 5 — Human gate for health decisions:**
1. Extend F11 to trigger human gate for medical questions + significant plan changes
2. Add `POST /api/fitness/gates/:id/decide`
3. Wire human gate UI into coaching chat
4. Track human override rate (7-day window)

---

## 12. File Map — Every File in the Codebase

| File | Lines | Role |
|---|---|---|
| `server.ts` | 1224 | Main server — Express setup, Gemini init, all 16 fitness endpoints + /api/evaluate, plan generation helpers, system prompts (F06/F07/F08), generateSandboxResponse, static serving |
| `src/types.ts` | 613 | All TypeScript interfaces: FitnessProfile, WorkoutLogEntry, WeeklyPlan, WearableDataPoint, ChatSession, CheckIn, RecoveryAssessment, NutritionAdvice, UserProgressSnapshot, FitnessAgent, FitnessWorkflowStep, FitnessHumanGate, all API request/response types, SubscriptionTier, TIER_FEATURES |
| `src/App.tsx` | 643 | React app shell — auth state, tab navigation (today/weekly/progress/coach/settings), render functions for each tab, workout logging, plan display, settings, disclaimer |
| `src/firebase.ts` | (not read — exists) | Firebase init — auth + Firestore client (db export used by server.ts) |
| `src/ExerciseLibrary.ts` | (not read — exists) | Bundled exercise data — ExerciseLibrary object with getAllExercises(), getExercise(id), findExerciseSubstitution(id, preferredEquipment) |
| `src/components/FitnessOnboarding.tsx` | 734 | Onboarding form component — goal, level, injuries, equipment, days/week, session duration, focus, biometrics, consent, disclaimer |
| `src/components/OrchestrationConsole.tsx` | (PolyVerses legacy — needs fitness adaptation) | Agent network diagram + orchestration console |
| `src/components/D3Heatmap.tsx` | (exists) | D3 agent telemetry heatmap |
| `src/components/RechartsHeatmap.tsx` | (exists) | Recharts progress/retention charts |
| `src/components/ObservabilityDashboard.tsx` | (exists) | Observability dashboard — needs fitness rewiring |
| `src/components/PromptConsole.tsx` | (exists) | Prompt console — needs fitness adaptation |
| `src/components/CodeBrowser.tsx` | (exists) | Code browser — needs fitness adaptation |
| `src/firestore.rules` | (exists) | Firestore security rules — default-deny, per-user ownership, email verification, health data consent check |
| `docs/ARCHITECTURE.md` | 328 | Existing architecture doc — high-level overview, agent details, data flow, tech stack, security model, deployment model |
| `docs/FEATURES_ROADMAP.md` | (exists) | Feature roadmap |
| `docs/GAP_ANALYSIS.md` | (exists) | Gap analysis — PolyVerses → PolySync |
| `docs/IMPACT_ANALYSIS.md` | (exists) | Impact analysis |
| `docs/PRD.md` | (exists) | Product Requirements Document |
| `docs/fitness-prd.md` | (exists) | Fitness PRD |
| `docs/06-second-brain-architecture.md` | 682 | Governance + knowledge layer design (PR #10) |
| `docs/architecture-overview.html` | 321 | Interactive HTML architecture overview (PR #10) |
| `docs/governance-state.md` | 416 | Governance state — what exists vs designed (PR #10) |
| `package.json` | 55 | Dependencies, scripts, project metadata |
| `firestore.rules` | (exists) | Firestore security rules |
| `security_spec.md` | (exists) | Security specification |

---

## 13. What's Missing — Gap Analysis

### 13.1 Not Yet Implemented (Code)

| Feature | Impact | Priority |
|---|---|---|
| Token tracking + session budget | Can't enforce token limits; heavy users can burn unlimited tokens | High — governance layer Phase 1 |
| Circuit breakers | Gemini failures aren't tracked; repeated failing calls waste time | High — governance layer Phase 2 |
| Observability endpoint (/api/budget) | No way to see token usage, agent breakdown, breaker state from an API | High — governance layer Phase 1/2 |
| Context cache | Repeated questions trigger fresh Gemini calls every time | Medium — governance layer Phase 3 |
| Distillation pipeline | Accumulated fitness data (workouts, check-ins, chats, recovery) is never summarized into insights | Medium — governance layer Phase 4 |
| Knowledge layer (FitnessNote) | Can't search or ask questions across workout logs + check-ins + chats + recovery | Medium — governance layer Phase 4 |
| Human gate for plan changes | F05 can adapt plan aggressively without user approval | Medium — governance layer Phase 5 |
| Push notifications (FCM) | No daily digest, no workout reminders, no re-engagement alerts | Medium — feature enhancement |
| Payments (Stripe) | No subscription tiers enforced — free/premium/elite are documented but not gated | Medium — feature enhancement |
| Mobile (React Native / PWA) | No mobile app — desktop-only experience | Low — future |
| F09 motivation analysis | Check-in data is saved but not analyzed for dropout risk | Low — feature enhancement |
| F10 wearable webhooks (actual delivery) | HealthKit/Google Fit endpoints exist but no OAuth + webhook delivery configured | Low — integration work |
| F11 injury check in plan generation | Exercise selection filters by injury, but no explicit F11 compliance gate call before plan generation | Low — safety enhancement |

### 13.2 Partially Implemented

| Feature | What's there | What's missing |
|---|---|---|
| F01 Profile validation | Saves profile with server-side validation (goal + level required) | Gemini-based contradiction detection not wired |
| F02 Workout generation | Gemini generates plan, saves to Firestore, returns plan + rationale + warnings | Deterministic fallback exists (generateDeterministicPlan); progressive overload logic is in the Gemini prompt, not verified |
| F04 Recovery analysis | computeRecoveryScore is a deterministic rules-based function (not Gemini) | Architecture specifies Flash Thinking for quality — code uses rules. Recovery score is saved but not used to influence plan generation in real-time (designed but not wired) |
| F05 Plan adaptation | Triggered after workout log, calls generateAdaptation (Gemini) | Adaptation logic is partially Gemini-driven; deterministic fallbacks not fully specified |
| F06 Coaching chat | Gemini generates response with profile context, saves to Firestore | Medical question detection is in the system prompt (safety rules) but not gated through a separate F11 call. Conversation history is saved but not used as context for subsequent messages (each message is independent) |
| F09 Motivation | Check-in endpoint saves check-in to Firestore | Sentiment analysis + dropout risk scoring not wired. Daily digest motivation messages not generated |
| F10 Wearable data ingest | Webhook endpoints exist (healthkit, googlefit) | No OAuth setup, no actual webhook delivery, no normalization logic wired |
| F11 Compliance gate | Consent endpoint saves consent flag. Exercise selection filters by injury. F06/F08 system prompts include safety rules | No explicit F11 call before plan generation. Medical question detection in chat is passive (system prompt rules) not active (gated through F11 endpoint). Special modes (GLP-1, postpartum, injury rehab) not implemented |

---

## 14. Relationship to PolyVerses (Inheritance)

PolySync inherits the following from PolyVerses:

| PolyVerses component | PolySync reuse | What changed |
|---|---|---|
| Multi-agent orchestration pattern | Reused — 12-agent mesh (F00–F11) instead of 23-agent PM mesh | Agent definitions changed from PM agents to fitness agents |
| Agent network diagram (D3) | Reused — D3Heatmap.tsx + OrchestrationConsole.tsx | Node/link definitions changed to F00–F11 |
| Observability dashboard | Reused — ObservabilityDashboard.tsx | Metric definitions changed to fitness (coaching quality, engagement, recovery) |
| Human-in-the-loop gates | Reused — FitnessHumanGate interface + gate UI | Gate content changed from PM compliance to fitness safety |
| Per-agent system prompts | Reused — PromptConsole.tsx | Prompts changed to F00–F11 fitness system prompts |
| RBAC | Designed — SubscriptionTier (free/premium/elite) | Role definitions changed from CPO/Group PM/PM/Product Ops to user/premium/elite |
| Firebase Auth + Firestore | Reused — same patterns | Collection structure changed to fitness (users/{uid}/profile, workouts, plans, etc.) |
| Server-side Gemini + sandbox fallback | Reused — same patterns | Gemini model changed to 3.5 Flash, system instructions changed to fitness |
| Workflow execution with step logging | Reused — FitnessWorkflowStep interface | Workflow steps changed to fitness flows (onboarding → plan → compliance → adapt) |
| Conflict resolution (MoE council) | Designed — not yet implemented in fitness | Conflict scenarios changed to fitness (recovery says rest, plan adaptor says push) |
| D3 + Recharts visualizations | Reused — same components | Chart data changed to fitness (workout frequency, volume, recovery distribution) |
| CodeBrowser + sample code | Reused — CodeBrowser.tsx | Sample code changed to F00–F11 fitness examples |

**Reuse estimate:** ~60% of PolyVerses infrastructure is directly reusable. The fitness-specific work is: agent definitions (F00–F11), system prompts, endpoint implementations (16 endpoints), type definitions (FitnessProfile, WorkoutLogEntry, WeeklyPlan, etc.), and the client app shell (App.tsx, FitnessOnboarding).

---

## 15. Token Cost Summary — Every Agent Call

| Agent | Gemini model | System prompt length | Typical prompt length | Typical response length | Estimated total tokens | Volume |
|---|---|---|---|---|---|---|
| F00 Orchestrator | Flash | ~300 words | ~100 words | ~300 words | ~1K | Every /api/evaluate call |
| F01 Profile | Flash | ~200 words | ~200 words (profile data) | ~300 words | ~2K | Onboarding + profile edit |
| F02 Workout Generator | Flash | ~400 words | ~600 words (profile + exercise library context) | ~1K words (full plan) | ~8–15K | Weekly per user + on adaptation |
| F03 Exercise Library | Flash | ~200 words | ~100 words (exercise ID + equipment) | ~200 words (substitution list) | ~1K | Per substitution query |
| F04 Recovery Analyst | Flash | ~300 words | ~300 words (wearable data + check-ins) | ~300 words (score + recommendation) | ~2K | Daily per active user |
| F05 Plan Adaptor | Flash | ~300 words | ~500 words (workout logs + recovery + plan) | ~500 words (adapted plan) | ~4–8K | After each workout log + manual adapt |
| F06 Coaching Chat | Flash | ~500 words (F06_SYSTEM_PROMPT) | ~400 words (profile context + message) | ~500 words (coaching response) | ~4–12K | Every chat message |
| F07 Form Coach | Flash | ~400 words (F07_SYSTEM_PROMPT) | ~200 words (exercise ID + description) | ~300 words (form cues) | ~1–2K | Per form question |
| F08 Nutrition Advisor | Flash | ~400 words (F08_SYSTEM_PROMPT) | ~200 words (query + profile) | ~300 words (guidance + disclaimer) | ~2–4K | Per nutrition question |
| F09 Motivation Coach | Flash | ~200 words | ~200 words (check-in data) | ~200 words (motivational message) | ~1–2K | Per check-in (designed) |
| F10 Data Ingest | None (ETL) | N/A | N/A | N/A | 0 | Per webhook |
| F11 Compliance Gate | Flash | ~300 words | ~200 words (plan/exercise + injuries) | ~200 words (safety check + disclaimer) | ~2K | Per plan generation + medical query |

**Total per active user per week (moderate usage):** ~215K tokens
**Total per active user per week (heavy chat):** ~400K+ tokens — exceeds session budget, would trigger 429 under governance layer

---

## 16. Quick Reference — Every Endpoint at a Glance

| # | Method | Endpoint | Agent | Auth | Gemini? | Token cost |
|---|---|---|---|---|---|---|
| 1 | POST | /api/fitness/profile | F01 | x-user-id | No (server validation) | 0 |
| 2 | GET | /api/fitness/profile | F01 | x-user-id | No | 0 |
| 3 | POST | /api/fitness/consent | F11 | x-user-id | No | 0 |
| 4 | POST | /api/fitness/generate-plan | F02 | x-user-id | Yes (Flash) | 8–15K |
| 5 | GET | /api/fitness/plan | F02 | x-user-id | No | 0 |
| 6 | POST | /api/fitness/substitute | F03 | x-user-id | No (lookup) | 0 |
| 7 | POST | /api/fitness/checkin | F09 | x-user-id | No (save only) | 0 |
| 8 | POST | /api/fitness/log-workout | F05 | x-user-id | Yes (Flash, adaptation) | 0 + 4–8K |
| 9 | POST | /api/fitness/recovery | F04 | x-user-id | No (rules-based) | 0 |
| 10 | POST | /api/fitness/chat | F06 | x-user-id | Yes (Flash) | 4–12K |
| 11 | POST | /api/fitness/form-cue | F07 | x-user-id | Yes (Flash) | 1–2K |
| 12 | POST | /api/fitness/nutrition | F08 | x-user-id | Yes (Flash) | 2–4K |
| 13 | POST | /api/fitness/adapt-plan | F05 | x-user-id | Yes (Flash) | 4–8K |
| 14 | GET | /api/fitness/progress | — | x-user-id | No (aggregation) | 0 |
| 15 | POST | /api/fitness/webhook/healthkit | F10 | x-user-id | No (ETL) | 0 |
| 16 | POST | /api/fitness/webhook/googlefit | F10 | x-user-id | No (ETL) | 0 |
| 17 | POST | /api/evaluate | F00 (default) | No auth | Yes (Flash) | ~1K |

---

*Document version: 2.0 — Complete architecture reference for PolySync AI Fitness Coach. Covers every agent (F00–F11), every endpoint (16 + /api/evaluate), every TypeScript type, every data flow, the client app shell, technology stack, security model, deployment model, and the governance layer design (token budgets, circuit breakers, observability, cache, distillation, knowledge layer) that is not yet implemented.*
