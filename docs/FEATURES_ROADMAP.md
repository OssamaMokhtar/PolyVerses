# PolySync — Features & Roadmap

> **AI Fitness Coach · Feature Inventory & Phased Roadmap · v1.1 · 2026-09-12**

---

## 1. Feature Status Legend

| Status | Meaning |
|---|---|
| ✅ Done | Built and shipped in current codebase |
| 🔴 Not Started | Not yet built; critical for MVP |
| 🟡 Planned | Designed/specified; not yet implemented |
| ⚪ Future | Interesting but not in current phases |
| ➖ N/A | Not applicable to this product |

---

## 2. Feature Inventory — What's Done vs. What's Needed

### 2.1 Foundation & Platform

| Feature | Status | Notes |
|---|---|---|
| Multi-agent orchestration framework | ✅ Done | PolyVerses' 23-agent mesh → refactor to 12 fitness agents |
| Agent network visualization (D3 force graph) | ✅ Done | Reuse; update node/link definitions for fitness agents |
| Observability dashboard (telemetry heatmap, SLA metrics) | ✅ Done | Reuse; add fitness-specific metrics (workout completion, retention, recovery distribution) |
| Human-in-the-loop gates | ✅ Done | Reuse pattern; map to fitness compliance gate (injury check, medical disclaimer, health consent) |
| Prompt console (per-agent system prompts) | ✅ Done | Reuse; replace 23 PM prompts with 12 fitness agent prompts |
| RBAC (role-based access control) | ✅ Done | Reuse pattern; map to user/coach/admin or free/premium/elite tiers |
| Firebase Auth (Google SSO) | ✅ Done | Reuse; keep as primary auth |
| Firestore per-user document storage | ✅ Done | Reuse; add fitness collections (profile, workouts, plans, wearableData, chatSessions, checkIns, subscriptions) |
| Server-side Gemini API with sandbox fallback | ✅ Done | Reuse; add fitness-specific endpoints and system instructions |
| React + Vite + TypeScript + Tailwind stack | ✅ Done | Reuse; no change needed |
| CI pipeline (lint, typecheck, build, audit) | ✅ Done | Reuse; ensure new files pass |
| D3 + Recharts visualizations | ✅ Done | Reuse for progress charts, agent heatmaps, recovery distribution |

### 2.2 Onboarding & Profile

| Feature | Status | Notes |
|---|---|---|
| Google SSO sign-up/login | ✅ Done | Reuse Firebase Auth flow |
| Fitness profile onboarding (goals, level, injuries, equipment, days/week, session duration, focus) | 🔴 Not Started | Complete rewrite of Onboarding.tsx |
| Profile editing after onboarding | 🔴 Not Started | Settings screen |
| Health data consent toggle (required before wearable processing) | 🔴 Not Started | Part of onboarding + settings |
| Special mode selection (none / GLP-1 / postpartum / injury rehab) | 🔴 Not Started | Onboarding + profile edit |
| Optional demographic fields (weight, height, age, gender) | 🔴 Not Started | Onboarding optional step |
| Profile validation (contradiction detection) | 🟡 Planned | F01 Profile Agent logic in server.ts |

### 2.3 Exercise Library

| Feature | Status | Notes |
|---|---|---|
| Exercise library data file (200+ exercises with metadata) | 🔴 Not Started | New file: src/ExerciseLibrary.ts |
| Exercise lookup by ID | 🔴 Not Started | F03 Exercise Library Agent |
| Exercise search by muscle group / equipment / difficulty | 🔴 Not Started | F03 |
| Exercise substitution (same muscle, matching equipment) | 🔴 Not Started | F03 + F02 |
| Exercise form cues & common mistakes | 🔴 Not Started | Part of exercise library data; surfaced by F07 |
| Exercise illustrations/video refs | ⚪ Future | URLs in exercise data; render in workout session UI later |

### 2.4 Workout Plan Generation

| Feature | Status | Notes |
|---|---|---|
| Weekly workout plan generation from profile + exercise library | 🔴 Not Started | F02 Workout Generator Agent + server endpoint |
| Exercise selection matching equipment + avoiding injuries | 🔴 Not Started | F02 + F11 Compliance Gate |
| Sets/reps/rest/RPE assignment per goal + level | 🔴 Not Started | F02 |
| Progressive overload logic (increase weight/reps when previous workout completed at target) | 🔴 Not Started | F05 Plan Adaptor |
| Plan storage in Firestore | 🔴 Not Started | `users/{uid}/plans/{planId}` |
| Weekly plan view (7-day grid, expandable) | 🔴 Not Started | New UI component |
| Recovery-based recommendation per day (train / reduce / rest) | 🔴 Not Started | F04 + F05; displayed in weekly plan view |

### 2.5 Workout Session Execution

| Feature | Status | Notes |
|---|---|---|
| Active workout view (today's exercises with set logging) | 🔴 Not Started | New UI component: WorkoutSession.tsx |
| Set logging (sets × reps × weight, completed/skipped/modified per set) | 🔴 Not Started | F05 + Firestore workout log |
| Rest timer between sets | 🔴 Not Started | Client-side timer in workout session UI |
| Complete / skip / modify workout | 🔴 Not Started | Per-exercise actions + overall workout status |
| Workout history storage | 🔴 Not Started | `users/{uid}/workouts/{workoutId}` |
| Workout log to Firestore | 🔴 Not Started | POST /api/fitness/log-workout |
| Exercise substitution during workout (can't do → suggest alternative) | 🔴 Not Started | F03 + UI action |

### 2.6 Plan Adaptation

| Feature | Status | Notes |
|---|---|---|
| Weekly adaptation (adjust next week based on completed/skipped, recovery, feedback) | 🔴 Not Started | F05 Plan Adaptor |
| Progressive overload application | 🔴 Not Started | F05 |
| Recovery-aware adjustment (low recovery → reduce volume) | 🔴 Not Started | F05 + F04 |
| Exercise swap on pain/discomfort feedback | 🔴 Not Started | F05 + F03 + F11 |

### 2.7 Conversational Coach

| Feature | Status | Notes |
|---|---|---|
| Coaching chat interface (message UI + streaming response) | 🔴 Not Started | New UI component: CoachingChat.tsx |
| Context-aware responses (profile + recent workouts + plan + recovery) | 🔴 Not Started | F06 + server endpoint |
| Supportive coach persona | 🔴 Not Started | F06 system prompt |
| Form question handling (routes to F07 knowledge) | 🔴 Not Started | F06 orchestrates |
| Nutrition question handling (routes to F08 knowledge) | 🔴 Not Started | F06 orchestrates |
| Recovery question handling (routes to F04 knowledge) | 🔴 Not Started | F06 orchestrates |
| Program question handling (routes to F02/F05 knowledge) | 🔴 Not Started | F06 orchestrates |
| Medical/injury question → disclaimer + professional referral | 🔴 Not Started | F11 Compliance Gate |
| Conversation history storage | 🔴 Not Started | `users/{uid}/chatSessions/{sessionId}` |
| Quick-action buttons for common queries | 🟡 Planned | UI feature; "What should I eat?", "My knee hurts", "Why am I stuck?" |

### 2.8 Wearable Integration & Recovery

| Feature | Status | Notes |
|---|---|---|
| Apple HealthKit integration (web Safari + future native) | 🔴 Not Started | F10 + webhook endpoint + client permission flow |
| Google Fit integration (web OAuth + future native) | 🔴 Not Started | F10 + webhook + OAuth flow |
| Strava integration | ⚪ Future | F10 + API; Phase 2+ |
| Garmin integration | ⚪ Future | F10 + API; Phase 2+ |
| WHOOP integration | ⚪ Future | F10 + API; Phase 2+ |
| Oura integration | ⚪ Future | F10 + API; Phase 2+ |
| Common wearable data schema (normalization) | 🔴 Not Started | F10 ETL logic |
| Recovery score computation (sleep, HRV, RHR, workout frequency, check-ins) | 🔴 Not Started | F04 + server endpoint |
| Recovery recommendation (train / reduce / rest) | 🔴 Not Started | F04 |
| Recovery score display in daily digest + weekly plan | 🔴 Not Started | UI components |
| Insight: "Your recovery is low today — consider a lighter workout" | 🔴 Not Started | F04 + UI |

### 2.9 Daily Digest & Notifications

| Feature | Status | Notes |
|---|---|---|
| Push notification service (FCM for web; APNs for native later) | 🔴 Not Started | New service module |
| Morning digest: sleep summary (if wearable) + yesterday's workout recap + today's plan preview + motivation tip | 🔴 Not Started | F09 + F04 + scheduled function |
| Workout reminder notifications | 🟡 Planned | Optional setting; push notification |
| Check-in prompt (post-workout or end-of-day) | 🔴 Not Started | F09 + UI |
| Digest open rate tracking | ⚪ Future | Analytics |

### 2.10 Check-ins & Sentiment

| Feature | Status | Notes |
|---|---|---|
| Post-workout check-in (energy, mood, pain, sleep quality, motivation — 1–10 scales) | 🔴 Not Started | UI prompt + F09 endpoint |
| End-of-day check-in (optional) | 🟡 Planned | F09 |
| Dropout risk detection (declining frequency + low motivation + negative mood) | 🔴 Not Started | F09 logic |
| Sentiment-aware messaging tone adjustment | 🔴 Not Started | F09 + F06 |
| Re-engagement notification for high-risk users | ⚪ Future | F09 + notification service |

### 2.11 Progress & Analytics

| Feature | Status | Notes |
|---|---|---|
| Strength progress charts (per exercise, bar/line chart over time) | 🔴 Not Started | Reuse D3/Recharts; new component |
| Workout frequency view (calendar heatmap or streak view) | 🔴 Not Started | Reuse D3/Recharts |
| Volume trends (sets × reps × weight per muscle group over time) | ⚪ Future | Advanced; Phase 2+ |
| Body weight log (user-entered, trend chart) | 🟡 Planned | Profile + progress view |
| Streak & consistency tracking | 🔴 Not Started | Computed from workout logs |
| NUX funnel analytics (sign-up → onboarded → first workout → 7-day → 30-day retention) | 🔴 Not Started | ObservabilityDashboard repurposed |
| Agent performance heatmap (fitness agents) | 🟡 Planned | Reuse existing heatmap; update agent list |

### 2.12 Compliance, Privacy & Safety

| Feature | Status | Notes |
|---|---|---|
| Fitness disclaimer on all workout content | 🔴 Not Started | F11 + UI footer |
| Medical advice blocking (Compliance Gate) | 🔴 Not Started | F11 |
| Health data consent gate (API-level + Firestore rules) | 🔴 Not Started | F11 + firestore.rules |
| GDPR/CCPA data deletion pipeline | 🟡 Planned | Firebase Admin SDK; separate admin function |
| Data export (user can download their data) | 🟡 Planned | Settings screen |
| Injury-safe exercise recommendations (Compliance Gate checks against declared injuries) | 🔴 Not Started | F11 |
| GLP-1 / postpartum / injury rehab mode safety adjustments | 🔴 Not Started | F11 + F02 + F08 |

### 2.13 Monetization & Subscription

| Feature | Status | Notes |
|---|---|---|
| Stripe integration (customer creation, subscription management) | ⚪ Future | Phase 4 |
| Free tier (basic plan, limited chat) | 🔴 Not Started | Tier gating logic + UI |
| Premium tier ($12–15/mo: full adaptive plans, unlimited chat, wearables, digests, motivation coaching, analytics) | ⚪ Future | Phase 4 |
| Elite tier ($20–30/mo: all premium + multi-wearable, sentiment coaching, GLP-1 mode, priority support) | ⚪ Future | Phase 4 |
| Free trial (7–14 days premium) | ⚪ Future | Phase 4 |
| Subscription status display in settings | ⚪ Future | Phase 4 |
| Tier-gated feature visibility (free users see upgrade prompts for premium features) | ⚪ Future | Phase 4 |

### 2.14 Advanced (Phase 5+)

| Feature | Status | Notes |
|---|---|---|
| Computer vision form analysis (phone camera + pose estimation) | ⚪ Future | TensorFlow.js / MediaPipe; Phase 5 |
| AR form overlay | ⚪ Future | Phase 5 |
| Human coach marketplace (AI daily + human add-on) | ⚪ Future | Phase 5; Stripe Connect |
| B2B / enterprise dashboard (employer wellness, gym chains) | ⚪ Future | Phase 5 |
| Native iOS/Android app | ⚪ Future | React Native or PWA upgrade; Phase 5 |
| Continuous glucose monitor integration | ⚪ Future | Phase 5 |
| Advanced periodization (block periodization, peaking, sport-specific) | ⚪ Future | Phase 5 |
| Custom workout builder (user assembles, AI validates) | ⚪ Future | Phase 5 |
| Social features (friends, leaderboards, challenges) | ⚪ Future | Phase 5 |
| Nutrition tracking with food logging | ⚪ Future | Phase 5+ |

---

## 3. Phased Roadmap

### Phase 0: Foundation (Week 1–2) — IN PROGRESS
| # | Feature | Status |
|---|---|---|
| 0.1 | Architecture update (README, ARCHITECTURE.md, agent roster) | ✅ Done (this doc) |
| 0.2 | PRD | ✅ Done (this doc) |
| 0.3 | Features & Roadmap | ✅ Done (this doc) |
| 0.4 | Impact Analysis & Prioritization | ✅ Done (this doc) |
| 0.5 | Gap Analysis | ✅ Done (this doc) |
| 0.6 | Exercise Library data file (200+ exercises) | 🔴 Next |
| 0.7 | Firestore data model + security rules update | 🔴 Next |
| 0.8 | types.ts update with fitness types | 🔴 Next |
| 0.9 | server.ts update with fitness API routes + agent system prompts | 🔴 Next |
| 0.10 | AthenaCodeStore.ts update with fitness agent code samples | 🔴 Next |
| 0.11 | metadata.json + package.json description update | 🔴 Next |
| 0.12 | CI/CD: add deploy.yml for production deployment | ⚪ Future |

### Phase 1: Core Coaching Loop (Week 3–5)
| # | Feature | Status |
|---|---|---|
| 1.1 | Fitness onboarding flow (Onboarding.tsx rewrite) | 🔴 |
| 1.2 | Workout Generator Agent + /api/fitness/generate-plan | 🔴 |
| 1.3 | Weekly plan view (7-day grid) | 🔴 |
| 1.4 | Active workout session UI (set logging, rest timer) | 🔴 |
| 1.5 | Workout logging to Firestore | 🔴 |
| 1.6 | Plan adaptation (F05) + /api/fitness/log-workout triggers adaptation | 🔴 |
| 1.7 | Progress dashboard (strength trends, frequency) | 🔴 |

### Phase 2: Conversational Coach + Wearables (Week 6–8)
| # | Feature | Status |
|---|---|---|
| 2.1 | Coaching Chat Agent + /api/fitness/chat + chat UI | 🔴 |
| 2.2 | Apple HealthKit integration (web) | 🔴 |
| 2.3 | Google Fit integration (web) | 🔴 |
| 2.4 | Recovery Analyst Agent + /api/fitness/recovery | 🔴 |
| 2.5 | Recovery-based plan adjustment (F05 + F04) | 🔴 |
| 2.6 | Wearable data view (simple dashboards per source) | 🟡 |
| 2.7 | Strava / Garmin / WHOOP / Oura integrations | ⚪ |

### Phase 3: Engagement & Retention (Week 9–11)
| # | Feature | Status |
|---|---|---|
| 3.1 | Push notifications (FCM) + daily digest | 🔴 |
| 3.2 | Motivation Coach Agent + sentiment analysis | 🔴 |
| 3.3 | Check-in flow (post-workout + end-of-day) | 🔴 |
| 3.4 | Streaks & consistency tracking | 🟡 |
| 3.5 | NUX funnel analytics in ObservabilityDashboard | 🔴 |

### Phase 4: Monetization & Premium Features (Week 12–14)
| # | Feature | Status |
|---|---|---|
| 4.1 | Stripe subscription (free / premium / elite tiers) | ⚪ |
| 4.2 | Nutrition Advisor Agent + /api/fitness/nutrition | 🔴 |
| 4.3 | GLP-1 / special mode programming | 🟡 |
| 4.4 | Exercise substitution engine (during workout) | 🟡 |
| 4.5 | Text-based form coaching (F07 + chat integration) | 🟡 |

### Phase 5: Advanced (3–6 months out)
| # | Feature | Status |
|---|---|---|
| 5.1 | Mobile app (React Native or PWA upgrade) | ⚪ |
| 5.2 | CV form analysis | ⚪ |
| 5.3 | Coach marketplace | ⚪ |
| 5.4 | B2B dashboard | ⚪ |

---

*Document version: 1.0 — Feature inventory and phased roadmap for PolySync.*
*Updated: 2026-09-12*
