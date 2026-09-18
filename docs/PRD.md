# PolyVerses — Product Requirements Document

## PolyVerses AI Product Management Workbench

**Version:** 1.1  
**Status:** Draft — Phase 0 foundation complete; Phase 1 agent runtime (F00–F11) in progress  
**Date:** September 17, 2026  
**Product:** AI Product Management Workbench (PM Workbench)  
**Target Launch:** Phase 1 MVP (12-agent orchestration mesh) in 4-6 weeks

PolyVerses is an **AI-native product management workbench** that uses a 12-agent specialist orchestration mesh (F00–F11) to assist product leaders with requirements drafting, technical design, release planning, sprint management, discovery research, risk analysis, metrics definition, prioritization (RICE), change communications, and knowledge curation. Each decision is traced to the specific agent that produced it, with full observability into token budgets, circuit breaker state, and human gate activity.

**Note on repo scope:** This repository (`OssamaMokhtar/PolyVerses`) contains **PolyVerses** — the PM workbench described in this document. The fitness coaching product **PolySync** is a separate product built on a different codebase. This PRD covers PolyVerses only.

## 1. Executive Summary

PolyVerses is being transformed from a multi-agent product management workbench into **PolySync — an AI-powered fitness coaching platform**. The platform uses a 12-agent orchestration mesh (repurposed from the existing 23-agent framework) to generate adaptive weekly workout plans, coach users through workout sessions via natural language, track progress, analyze wearable data for recovery-based adjustments, and provide motivational coaching.

**Market opportunity:** The AI-driven fitness coaching market is projected to grow from $6.2B (2025) to $46.8B (2034) at 25.1% CAGR, with agentic AI fitness coaching specifically growing from $3.8B to $27.4B at 24.5% CAGR. 340M+ people globally already use AI-assisted fitness tools, projected to reach 1.1B by 2034.

**Value proposition:** A coach-quality adaptive fitness platform at $12-15/month (vs. $100-150/month for human coaches) that uses multi-agent AI reasoning — not a single chat prompt — to generate, adapt, and explain every coaching decision, with full observability into which agent produced each recommendation.

**Key differentiators:**
- Multi-agent reasoning architecture (each decision traced to specific agent + rationale)
- Recovery-based real-time adaptation from wearable data (HealthKit, Google Fit, future: Garmin, WHOOP, Oura, Strava)
- Conversational AI coach with full user context (not a static FAQ bot)
- Sentiment-aware motivation coaching (dropout risk detection + re-engagement)
- Multi-wearable aggregation (HealthKit + Google Fit + Strava + Garmin + WHOOP + Oura)
- Transparent observability (users and coaches can see which agent produced each recommendation)
- Affordable pricing ($12-15/mo vs. $13-150/mo competitors)

---

## 2. Problem Statement

| Pain Point | Current Alternatives | Why It Matters |
|---|---|---|
| Static workout plans that don't adapt to recovery, injury, or schedule changes | Fitbod, Caliber basic tier, most mobile apps | Users plateau; plans become irrelevant; high churn |
| No real-time adaptation based on daily readiness | All mobile apps except Tonal (hardware only) | Users train hard on poor-recovery days (injury risk) or skip because plan feels too hard |
| No conversational coach to ask questions | Most apps have no chat; Freeletics Flo + iFIT Tailor are exceptions | Users make mistakes, get injured, or quit with no one to ask |
| Wearable data (sleep, HRV, RHR) sits unused | Apps integrate only 1-2 devices at most; data collected but not acted on | Users don't benefit from the data they're already collecting |
| Human coaches cost $100-150/month | Future, Caliber premium | Majority of consumers cannot afford personalized coaching |
| No motivation or sentiment awareness | None of the major apps | High dropoff rates; no proactive re-engagement when users lose motivation |
| Limited exercise library or poor substitution logic | Basic apps have 50-100 exercises; substitutions are manual or non-existent | Users can't adapt when equipment missing, injury flares, or exercise doesn't work for them |
| GLP-1 users have no specialized programming | None of the major apps | Rapidly growing segment (weight-loss medication users) needs strength-preserving, recovery-aware programming |

---

## 3. Target Users

| Segment | Description | Market Size (est.) | Willingness to Pay |
|---|---|---|---|
| Self-driven intermediates | Ages 25-45, own a wearable, work out 2-5x/week, want structure without a human coach | Largest segment | $10-20/month |
| Wearable owners seeking insight | Apple Watch, Garmin, WHOOP, Oura users who track data but don't act on it | ~100M+ globally | $8-15/month |
| GLP-1 / weight-loss medication users | People on GLP-1 agonists needing strength-preserving, recovery-aware programming | Rapidly growing segment | $10-20/month |
| Return-to-fitness / injury-aware users | Users returning after injury or break who need safe, adapted programming | Large underserved segment | $10-15/month |
| Premium hybrid seekers | AI for daily coaching + optional human coach for form checks | Niche, high ARPU | $30-50/month |

**Out of scope for MVP:** Clinical rehabilitation, competitive athletes, complete beginners needing in-person form instruction, users without any fitness equipment (bodyweight-only is supported but not the primary target).

---

## 4. Core User Stories

### 4.1 Onboarding & Profile

- **US-1:** As a new user, I can sign up with Google OAuth and complete a fitness onboarding flow (goals, level, injuries, equipment, days/week, session duration) in under 2 minutes so I can get my first workout plan immediately.
- **US-2:** As a user, I can edit my fitness profile at any time (goals, injuries, equipment, schedule) and my future workout plans adapt to the changes.
- **US-3:** As a user with an injury, I can declare it during onboarding or in settings, and I receive workouts that avoid or accommodate that injury (e.g., no shoulder exercises if I have a shoulder injury).
- **US-4:** As a user with a medical condition (e.g., GLP-1 medication, postpartum, hypertension), I can enable a "special mode" that adjusts programming and provides appropriate disclaimers.

### 4.2 Weekly Plan & Workout Execution

- **US-5:** As a user, I see my week's workouts in a 7-day grid view, with each day showing the workout name, focus area, and exercise count.
- **US-6:** As a user, I tap a workout to enter an active session where I log sets, reps, and weight for each exercise, with a built-in rest timer between sets.
- **US-7:** As a user, I can complete, skip, or modify a workout. If I skip, the plan adapts for the next week. If I modify (e.g., swap an exercise), the substitution is remembered.
- **US-8:** As a user, if I can't do an exercise (missing equipment, injury flare-up, doesn't feel right), I can request a substitution and get an alternative that targets the same muscle groups.
- **US-9:** As a user, I see a rest timer counting down between sets, and I can adjust the rest duration based on my preference or the workout type.

### 4.3 Conversational Coach

- **US-10:** As a user, I can chat with the AI coach at any time to ask questions about form, nutrition, recovery, programming ("why am I not progressing?"), or rest day advice.
- **US-11:** As a user, the coach knows my actual profile, recent workouts, current plan, and wearables data, so its advice is personalized to me — not generic.
- **US-12:** As a user, if I ask a medical question (e.g., "should I train with this injury?"), the coach recognizes this and either provides safe general guidance with a disclaimer or redirects me to consult a healthcare professional.
- **US-13:** As a user, I can ask the coach to explain why a particular exercise was chosen for my plan, and the coach explains the reasoning (e.g., "This exercise targets your weak point in the bench press — your lockout — by focusing on triceps strength").

### 4.4 Wearable Integration & Recovery

- **US-14:** As a user with an Apple Watch, I can connect Apple HealthKit and the coach uses my sleep data, resting heart rate, and activity data to assess my recovery.
- **US-15:** As a user with a Garmin, WHOOP, or Oura device, I can connect it and get the same recovery insights.
- **US-16:** As a user, I see a daily morning digest (push notification or in-app) that summarizes my sleep, yesterday's workout, and today's recommended plan based on my recovery state.
- **US-17:** As a user, if my recovery is low (poor sleep, high HRV, high resting HR), the coach suggests a lighter workout or rest day and explains why (e.g., "Your HRV is 20% below your baseline and you slept 5.5 hours — today's plan is reduced to 60% volume to protect your recovery").

### 4.5 Progress & Analytics

- **US-18:** As a user, I see progress charts showing my strength trends for each exercise (weight lifted over time), workout frequency (calendar heatmap), total volume over time, and body weight trend (if I log it).
- **US-19:** As a user, I see my streaks and consistency score to motivate continued use.
- **US-20:** As a user, I can export my data (workouts, progress, wearable data) in a standard format (CSV/JSON) for my own records or to share with a human coach.

### 4.6 Privacy & Compliance

- **US-21:** As a user, I must explicitly consent to health data processing before any wearable data is collected or used for coaching decisions.
- **US-22:** As a user, I can request data deletion at any time (GDPR/CCPA compliance), and my data is deleted from all systems within 30 days.
- **US-23:** As a user, I see a clear disclaimer on all workout content: "AI coach provides fitness guidance, not medical advice. Consult a healthcare professional for injuries or medical conditions."

### 4.7 Monetization

- **US-24:** As a free user, I can create a profile, get a basic weekly plan (non-adaptive), log workouts, and chat with the coach limited to 5 sessions per week.
- **US-25:** As a premium user ($12/month), I get full adaptive plans, unlimited chat, wearable integration, daily digests, motivation coaching, and progress analytics.
- **US-26:** As an elite user ($20/month), I get everything in premium plus multi-wearable aggregation, sentiment coaching, GLP-1/special mode programming, priority support, and early access to CV/AR features.

---

## 5. Feature Inventory — Done vs. Not Yet

### 5.1 Foundation — COMPLETED (Phase 0)

| Feature | Status | Details |
|---|---|---|
| **Exercise Library** | ✅ DONE | 101 exercises across 7 categories (strength, hypertrophy, mobility, core, cardio, plyometric, endurance) with metadata: name, muscle groups, equipment, difficulty, instructions, common mistakes, substitutions, video reference URLs. File: `src/ExerciseLibrary.ts` |
| **Fitness Types** | ✅ DONE | 33 TypeScript interfaces covering: FitnessProfile, WorkoutPlan, WorkoutLogEntry, ExerciseLog, DailyWorkout, ExerciseTarget, RecoveryAssessment, WellnessSnapshot, ChatSession, ChatMessage, CheckIn, UserSubscription, WearableDataPoint, HealthDataConsent, SubscriptionTier, etc. File: `src/types.ts` |
| **Firestore Security Rules** | ✅ DONE | 419-line ruleset with 10 user subcollections (profile, workouts, plans, wearableData, chatSessions, checkIns, recovery, subscription, settings, dailyDigest), public exercise library read access, health data consent gating, field-level validation, timestamp integrity, and ABAC patterns. File: `firestore.rules` |
| **README Pivot** | ✅ DONE | README.md rewritten as AI Fitness Coach Platform with agent roster, architecture overview, tech stack, setup, and data flow. File: `README.md` |
| **Market Research** | ✅ DONE | Comprehensive research: market size ($3.2B-$21.79B in 2025, 18-25% CAGR through 2034), 340M+ users, competitor analysis (Fitbod, Freeletics, Future, Healthify, FitTrack, JuggernautAI, Tempo, Mustang, Peloton Guide, Vi, Symmetrix), trend data, gap analysis. Source: web research + Forbes + ISSA |
| **Multi-Agent Orchestration Framework** | ✅ REUSED | 23-agent mesh from PolyVerses → refactorable to 12 fitness agents. Includes state management, routing, circuit breakers, conflict resolution (MoE council), workflow execution with step-by-step logging. |
| **Agent Network Visualization** | ✅ REUSED | D3 force-directed graph with 23 nodes + links → update node/link definitions for 12 fitness agents. |
| **Observability Dashboard** | ✅ REUSED | Telemetry heatmap, SLA metrics, failover UI → add fitness-specific metrics (coaching quality, agent performance, engagement funnel). |
| **Human-in-the-Loop Gates** | ✅ REUSED | Compliance gate UI, 15-minute undo window, RBAC → map to fitness compliance gate (injury check, medical disclaimer, consent gate). |
| **Prompt Console** | ✅ REUSED | Per-agent system prompts browsable + copyable → replace 23 PM prompts with 12 fitness prompts. |
| **RBAC Pattern** | ✅ REUSED | CPO/Group PM/PM/Product Ops → refactor to User/Premium/Elite tiers or Coach/Admin roles. |
| **Firebase Auth (Google SSO)** | ✅ REUSED | Same authentication system. |
| **Firestore Per-User Storage** | ✅ REUSED | Same storage pattern + new fitness collections. |
| **Server-Side Gemini API** | ✅ REUSED | Express endpoint + sandbox fallback → add fitness endpoints with agent-specific system instructions. |
| **React + Vite + TypeScript + Tailwind** | ✅ REUSED | Same stack. |
| **CI Pipeline** | ✅ REUSED | Lint, typecheck, build, dependency audit. |
| **D3 + Recharts** | ✅ REUSED | Same visualization libraries for progress charts, agent heatmaps, recovery score distribution. |
| **CodeBrowser + AthenaCodeStore** | ✅ REUSED | Sample code for all agents → replace PM agent samples with fitness agent samples. |

### 5.2 Phase 1 — Core Coaching Loop — NOT STARTED

| Feature | Status | Effort | Dependencies |
|---|---|---|---|
| **F01 Profile Agent** — validates profile, detects contradictions, suggests clarifications | 🔴 NOT STARTED | 1-2 hours | 0.8 (types), 0.9 (server) |
| **F02 Workout Generator Agent** + `/api/fitness/generate-plan` — generates weekly plan from profile + exercise library; applies periodization basics; respects injuries + equipment | 🔴 NOT STARTED | 3-4 hours | 0.6 (exercise library), 0.8 (types), 0.9 (server), 1.1 (onboarding) |
| **F11 Compliance Gate Agent** — injury conflict check, medical disclaimer, health consent gate, safety thresholds, special mode adjustments | 🔴 NOT STARTED | 2-3 hours | 0.9 (server), 0.8 (types) |
| **Fitness Onboarding UI** (`Onboarding.tsx` rewrite) — Google SSO → fitness profile capture (goals, level, injuries, equipment, days, duration, focus, biometrics, health data consent, special mode) → complete | 🔴 NOT STARTED | 3-4 hours | 0.6, 0.8, 0.9 (F01 logic), 1.1 |
| **Weekly Plan View** (`WeeklyPlan.tsx`) — 7-day grid, expandable, shows workout name + focus + exercise count per day, tap to start | 🔴 NOT STARTED | 2-3 hours | 1.2 (plan generation) |
| **Active Workout Session UI** (`WorkoutSession.tsx`) — set logging (sets, reps, weight per exercise), rest timer, complete/skip/modify actions, substitution flow | 🔴 NOT STARTED | 4-6 hours | 1.3 (plan view), 0.6 (exercise library) |
| **Workout Logging API** (`/api/fitness/log-workout`) — saves completed workout to Firestore, triggers adaptation | 🔴 NOT STARTED | 1-2 hours | 0.7 (Firestore rules), 0.8 (types), 1.4 (session UI) |
| **F05 Plan Adaptor Agent** + `/api/fitness/adapt-plan` — adjusts next week: completed/skipped, recovery, feedback, progressive overload | 🔴 NOT STARTED | 3-4 hours | 1.5 (logging), 2.4 (recovery, optional for MVP) |
| **Progress Dashboard** (`ProgressDashboard.tsx`) — strength trends (per exercise), workout frequency (calendar heatmap), volume trends, body weight log | 🟡 PLANNED | 2-3 hours | 1.5 (logging data) |
| **App Tab Navigation** (`App.tsx` update) — replace PM tabs (orchestration, observability, prompt-console, workflow, settings) with fitness tabs (today's workout, weekly plan, progress, coach chat, settings) | 🔴 NOT STARTED | 1-2 hours | — |

**MVP = F01 + F02 + F11 + Onboarding UI + Weekly Plan View + Workout Session UI + Log Workout API + Plan Adaptor + App Tab Navigation**

### 5.3 Phase 2 — Conversational Coach + Wearables — NOT STARTED

| Feature | Status | Effort | Dependencies |
|---|---|---|---|
| **F06 Coaching Chat Agent** + chat UI — NL coach with full user context (profile, recent workouts, current plan, wearable data); routes to specialist knowledge; flags unsafe questions; explains reasoning | 🔴 NOT STARTED | 5-7 hours | 0.9 (server), 0.8 (types), 1.1 (profile), 1.2 (plan gen) |
| **F04 Recovery Analyst Agent** + `/api/fitness/recovery` — wearable data + workout frequency → recovery score 0-100; train/reduce/rest recommendation with explanation | 🔴 NOT STARTED | 2-3 hours | 0.7 (Firestore), 0.8 (types), 0.9 (server), 2.2 or 2.3 (wearable data) |
| **Recovery-Based Plan Adjustment** — F05 uses recovery score to adjust intensity/volume for next week | 🔴 NOT STARTED | 1-2 hours | 2.4 (recovery agent), 1.6 (plan adaptor) |
| **Apple HealthKit Integration** (web) — web Safari API for sleep, HR, steps, active calories; future: native mobile app for full access | 🔴 NOT STARTED | 3-4 hours | 0.7, 0.8, 0.9, 2.4 |
| **Google Fit Integration** (web) — web OAuth + REST API for similar data points | 🔴 NOT STARTED | 2-3 hours | 0.7, 0.8, 0.9, 2.4 |
| **F03 Exercise Library Agent** + `/api/fitness/substitute` — exercise lookup, substitution queries (same muscle groups, similar movement pattern, equipment constraints), form cues + common mistakes | 🔴 NOT STARTED | 1-2 hours | 0.6 (library), 0.9 (server) |
| **F07 Form Coach Agent** + `/api/fitness/form-cue` — exercise form cues + common mistakes per exercise; interprets user descriptions of movement feel; text-based for MVP (CV/AR later) | 🔴 NOT STARTED | 1-2 hours | 0.6 (library), 0.9 (server) |
| **Wearable Data View Dashboards** — simple dashboards per connected wearable: sleep trends, HRV trend, resting HR trend, steps/active calories | 🟡 PLANNED | 2-3 hours | 2.2, 2.3 |
| **Strava / Garmin / WHOOP / Oura Integrations** — expand wearable sources beyond HealthKit + Google Fit | ⚪ FUTURE | 2-4 hours each | 2.2 or 2.3 (pattern established) |

### 5.4 Phase 3 — Engagement & Retention — NOT STARTED

| Feature | Status | Effort | Dependencies |
|---|---|---|---|
| **F09 Motivation Coach Agent** — check-in + chat tone analysis; dropout risk detection; tone adjustment; proactive re-engagement nudges | 🔴 NOT STARTED | 2-3 hours | 2.1 (chat data), 3.2 (check-in data) |
| **Check-In Flow** — post-workout check-in (energy, mood, pain, sleep quality, motivation) + end-of-day check-in; saves to Firestore | 🔴 NOT STARTED | 2-3 hours | 0.7, 0.8, 0.9, 3.1 |
| **Push Notifications (FCM)** + **Daily Digest** — morning push notification with sleep summary, yesterday's workout, today's plan; customizable schedule | 🔴 NOT STARTED | 4-6 hours | 0.9, 2.2 or 2.3 (digest content), 1.5 (workout data), 3.1 (check-in data) |
| **Streaks & Consistency Tracking** — visual streaks, consistency score, motivation metrics | 🟡 PLANNED | 1-2 hours | 1.5 (workout logging) |
| **NUX Funnel Analytics** — onboarding completion rate, first workout completion, 7-day/30-day retention tracking in ObservabilityDashboard | 🟡 PLANNED | 1-2 hours | 1.1-1.4 (funnel events) |

### 5.5 Phase 4 — Monetization & Premium — FUTURE

| Feature | Status | Effort | Dependencies |
|---|---|---|---|
| **Stripe Subscription** — 3 tiers (free/premium/elite), tier gating on features, Stripe webhook handling, subscription status in Firestore | ⚪ FUTURE | 4-6 hours | 1.1-1.6 (need working product before charging) |
| **F08 Nutrition Advisor Agent** + `/api/fitness/nutrition` — calorie/macro estimation based on profile + goals; meal suggestions; dietary preferences; flags medical nutrition questions | 🔴 NOT STARTED | 2-3 hours | 0.8 (types), 0.9 (server), 1.1 (profile) |
| **GLP-1 / Special Mode Programming** — adjusted workout intensity, recovery emphasis, nutrition guidance for users on weight-loss medications or with special conditions | 🟡 PLANNED | 2-3 hours | 4.2 (nutrition), 1.2 (plan gen), 1.1 (profile flag) |
| **Exercise Substitution Engine** (during workout) — real-time substitution flow in WorkoutSession UI: "I can't do this exercise" → shows alternatives → user picks → plan updated | 🟡 PLANNED | 1-2 hours | 0.6 (library), 1.4 (session UI), F03 agent |
| **Text-Based Form Coaching** — F07 form cues integrated into coaching chat; user asks "how do I do this exercise?" → form cues + common mistakes | 🟡 PLANNED | 1-2 hours | 2.1 (chat), 0.6 (library) |
| **Data Export** — export workouts, progress, wearable data as CSV/JSON | 🟡 PLANNED | 1-2 hours | 1.5 (workout data), 2.2/2.3 (wearable data) |
| **GDPR/CCPA Deletion Pipeline** — user data deletion request → delete from Firestore + any cached data within 30 days | 🟡 PLANNED | 2-3 hours | — |

### 5.6 Phase 5 — Advanced (3-6 Months Out) — FUTURE

| Feature | Status | Notes |
|---|---|---|
| **Mobile App** (React Native or PWA upgrade) | ⚪ FUTURE | Better mobile UX, offline workout logging, native HealthKit/Google Fit access |
| **CV Form Analysis** (TensorFlow.js / MediaPipe) | ⚪ FUTURE | Real-time form feedback via camera; partnership potential with form analysis startups |
| **Coach Marketplace** (Stripe Connect) | ⚪ FUTURE | Connect users with human coaches for form checks, program review; PolyVerses takes commission |
| **B2B / Enterprise Dashboard** | ⚪ FUTURE | Corporate wellness programs, gym chains, insurance companies |
| **AR Form Overlay** | ⚪ FUTURE | AR glasses / phone camera → overlay perfect form template on user's movement |
| **Continuous Glucose Monitor Integration** | ⚪ FUTURE | For GLP-1 users and diabetics; adjust nutrition + workout advice based on glucose trends |
| **Advanced Periodization** | ⚪ FUTURE | Block periodization, peaking for events, sport-specific programming |
| **Custom Workout Builder** | ⚪ FUTURE | Let advanced users build their own workouts; AI suggests improvements |
| **Social Features** | ⚪ FUTURE | Friends, leaderboards, challenges, workout sharing |
| **Nutrition Tracking** | ⚪ FUTURE | Food logging, macro tracking, meal plan generation (beyond advice) |

---

## 6. Architecture Overview

### 6.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              POLYSYNC AI FITNESS COACH                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │   React + Vite   │    │   Firebase       │    │   Server (Sim)   │       │
│  │   + TypeScript   │    │   (Auth/Firestore)│   │   (Express)      │       │
│  │   + Tailwind     │    │                  │    │                  │       │
│  │                  │    │  ┌─────────────┐ │    │  ┌─────────────┐ │       │
│  │  ┌─────────────┐ │    │  │ users/{uid} │ │    │  │ /api/fitness│ │       │
│  │  │ Onboarding  │ │    │  │  └ profiles  │ │    │  │  /profile   │ │       │
│  │  └─────────────┘ │    │  │  └ workouts  │ │    │  │  /generate- │ │       │
│  │  ┌─────────────┐ │    │  │  └ plans     │ │    │  │  plan       │ │       │
│  │  │ Today's     │ │    │  │  └ wearable  │ │    │  │  /log-      │ │       │
│  │  │ Workout     │ │    │  │  └ chat      │ │    │  │  workout    │ │       │
│  │  └─────────────┘ │    │  │  └ checkins  │ │    │  │  /adapt-plan│ │       │
│  │  ┌─────────────┐ │    │  │  └ recovery  │ │    │  │  /chat      │ │       │
│  │  │ Weekly Plan │ │    │  │  └ subs      │ │    │  │  /recovery  │ │       │
│  │  └─────────────┘ │    │  │  └ settings  │ │    │  │  /nutrition │ │       │
│  │  ┌─────────────┐ │    │  │  └ digest    │ │    │  │  /form-cue  │ │       │
│  │  │ Progress    │ │    │  └─────────────┘ │    │  │  /substitute│ │       │
│  │  └─────────────┘ │    │                  │    │  │  /checkin   │ │       │
│  │  ┌─────────────┐ │    │  ┌─────────────┐ │    │  │  /consent   │ │       │
│  │  │ Coach Chat  │ │    │  │ exerciseLib │ │    │  └─────────────┘ │       │
│  │  └─────────────┘ │    │  │ (public)    │ │    │                  │       │
│  │  ┌─────────────┐ │    │  └─────────────┘ │    │  ┌─────────────┐ │       │
│  │  │ Settings    │ │    │                  │    │  │ Gemini 3.5  │ │       │
│  │  └─────────────┘ │    │                  │    │  │ Flash/Pro   │ │       │
│  └──────────────────┘    └──────────────────┘    │  └─────────────┘ │       │
│                                                   └──────────────────┘       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    12-AGENT ORCHESTRATION MESH                       │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │    │
│  │  │  F00    │→│  F01    │→│  F02    │→│  F11    │→│  F05    │  │    │
│  │  │Orchestr │  │ Profile │  │Workout  │  │Compliance│  │ Adaptor │  │    │
│  │  │  ator   │  │  Agent  │  │Generator│  │  Gate   │  │  Agent  │  │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │    │
│  │       ↑            ↑            ↑            ↑            ↑          │    │
│  │       │            │            │            │            │          │    │
│  │  ┌────┴────────────┴────────────┴────────────┴────────────┴───┐     │    │
│  │  │                    WORKFLOW EXECUTION                        │     │    │
│  │  │  Profile → Generate Plan → Compliance Check → Serve Plan    │     │    │
│  │  │  → Log Workout → Adapt Plan → (loop)                        │     │    │
│  │  └─────────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │    │
│  │  │  F03    │  │  F04    │  │  F06    │  │  F07    │  │  F08    │  │    │
│  │  │Exercise │  │Recovery │  │ Chat    │  │ Form    │  │Nutrition│  │    │
│  │  │ Library │  │Analyst  │  │ Coach   │  │ Coach   │  │ Advisor │  │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │    │
│  │                                                                      │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                              │    │
│  │  │  F09    │  │  F10    │  │  F11    │                              │    │
│  │  │Motivation│  │ Data    │  │Compliance│                              │    │
│  │  │ Coach   │  │ Ingest  │  │ Gate    │                              │    │
│  │  └─────────┘  └─────────┘  └─────────┘                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    UI LAYER                                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │ Today's     │  │ Weekly Plan │  │ Progress    │                 │    │
│  │  │ Workout     │  │ (7-day grid)│  │ Dashboard   │                 │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │ Coach Chat  │  │ Settings    │  │ Wearable    │                 │    │
│  │  │ (F06 chat)  │  │ (profile,   │  │ Data Views  │                 │    │
│  │  │             │  │ wearables,  │  │ (F10 data)  │                 │    │
│  │  │             │  │ export,    │  │             │                 │    │
│  │  │             │  │ subscription)│  │             │                 │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    OBSERVABILITY LAYER                              │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │    │
│  │  │ Agent Network    │  │ Telemetry        │  │ Coaching Quality │  │    │
│  │  │ Diagram (D3)     │  │ Heatmap + SLA    │  │ Metrics          │  │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │    │
│  │  │ NUX Funnel       │  │ Retention        │  │ API Cost         │  │    │
│  │  │ Analytics        │  │ Cohorts          │  │ Tracking         │  │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Agent Architecture — 12 Agents

| ID | Agent Name | Role | Responsibility | Gemini Route | Status |
|---|---|---|---|---|---|
| **F00** | **Orchestrator Router** | Master Coordinator | Routes requests; manages multi-agent workflows; idempotency; circuit breaker; conflict resolution (MoE council) | Standard | ✅ Reused from PolyVerses |
| **F01** | **Profile Agent** | Onboarding & Profile Manager | Validates profile; detects contradictions (e.g., "beginner" + "5x/week advanced programs"); suggests clarifications; normalizes inputs | Standard | 🔴 Not started |
| **F02** | **Workout Generator** | Plan Architect | Generates weekly plan from profile + exercise library; applies periodization basics (undulating, linear); respects injuries + equipment constraints; produces daily workouts with exercises, sets, reps, rest, RPE targets | Reasoning (Flash Thinking for quality) | 🔴 Not started |
| **F03** | **Exercise Library** | Knowledge Base | Exercise metadata lookup; substitution queries (same muscle groups, similar movement pattern, equipment constraints); form cues + common mistakes per exercise | Standard (lookup, low cost) | 🔴 Not started |
| **F04** | **Recovery Analyst** | Biometric Interpreter | Wearable data + workout frequency + check-ins → recovery score 0-100; train/reduce/rest recommendation with explanation of factors; low-latency (cached where possible) | Reasoning | 🔴 Not started |
| **F05** | **Plan Adaptor** | Adaptive Engine | Adjusts next week's plan: completed/skipped workouts, recovery score, user feedback, progressive overload (weight/reps increase when ready); deload weeks when needed | Reasoning | 🔴 Not started |
| **F06** | **Coaching Chat** | Conversational Coach | NL coach with full user context (profile, recent workouts, current plan, wearable data, chat history); routes to specialist knowledge (F03/F04/F07/F08); flags unsafe questions; explains reasoning behind recommendations | Reasoning (highest quality — Pro/Flash Thinking) | 🔴 Not started |
| **F07** | **Form Coach** | Form Guidance | Exercise form cues + common mistakes per exercise; interprets user descriptions of movement feel ("my knee hurts during squats"); text-based for MVP (CV/AR later); suggests form fixes | Standard | 🔴 Not started |
| **F08** | **Nutrition Advisor** | Nutrition Coach | Calorie/macro estimation based on profile + goals; meal suggestions; dietary preferences (vegetarian, keto, etc.); flags medical nutrition questions (e.g., "should I take this supplement?"); integrates with GLP-1 mode | Standard | 🔴 Not started |
| **F09** | **Motivation Coach** | Sentiment & Engagement | Check-in + chat tone analysis; dropout risk detection (declining engagement, negative sentiment, skipped workouts); tone adjustment (encouraging vs. challenging); proactive re-engagement nudges (push notifications) | Standard + light sentiment analysis | 🔴 Not started |
| **F10** | **Data Ingest** | Wearable Data Pipeline | Normalizes wearable data from HealthKit/Google Fit/Strava/Garmin/WHOOP/Oura into common `WearableDataPoint` schema; handles auth flows; deduplicates; timestamps; no LLM (ETL, rule-based) | Rule-based (no LLM cost) | 🔴 Not started |
| **F11** | **Compliance Gate** | Safety & Legal | Injury conflict check (workout contradicts declared injury → block + explain); medical disclaimer trigger (user asks medical question → disclaimer + redirect); health consent gate (no wearable data used without explicit consent); safety thresholds (max volume, max intensity for beginners); special mode adjustments (GLP-1, postpartum, hypertension) | Reasoning (safety-critical — high quality) | 🔴 Not started |

### 6.3 Data Flow

```
User Action                          Firestore                          Server
─────────────                        ──────────                          ───────
1. Sign up (Google SSO)         →   users/{uid}/profile/           ← F01 validates
                                                              ← F11 consent gate
2. Complete onboarding          →   users/{uid}/profile/           ← F01 saves
3. Request weekly plan          →   (read profile)                  → F02 generates
                                →   users/{uid}/plans/{planId}/    ← F02 saves plan
4. View weekly plan             →   (read plans/{planId})           ← F02 returns plan
5. Start workout session        →   (read plans/{planId}/days/)    ← F02 returns day
6. Log sets/reps/weight         →   users/{uid}/workouts/{id}/    ← F05 logs
7. Complete workout             →   (update workout status)        → F05 adapts
                                →   users/{uid}/plans/{newPlanId}/ ← F05 saves adapted
8. Connect HealthKit            →   users/{uid}/wearableData/     ← F10 ingests
9. Request recovery score       →   (read wearableData + workouts) → F04 computes
                                →   users/{uid}/recovery/{id}/    ← F04 saves
10. Chat with coach             →   users/{uid}/chatSessions/     ← F06 responds
                                →   (append messages)             ← F06 saves
11. Submit check-in             →   users/{uid}/checkIns/         ← F09 logs
                                →   (trigger if needed)           ← F09 analyzes
```

### 6.4 API Routes

| Method | Endpoint | Agent | Description |
|---|---|---|---|
| POST | `/api/fitness/profile` | F01 | Save/update user fitness profile |
| GET | `/api/fitness/profile` | F01 | Get current user profile |
| POST | `/api/fitness/generate-plan` | F02 | Generate weekly workout plan from profile |
| GET | `/api/fitness/plan` | F02 | Get current week's plan |
| POST | `/api/fitness/log-workout` | F05 | Save completed workout; triggers adaptation |
| POST | `/api/fitness/adapt-plan` | F05 | Manually trigger plan adaptation |
| POST | `/api/fitness/chat` | F06 | Send message to coaching chat; get streamed response |
| POST | `/api/fitness/recovery` | F04 | Compute recovery score + recommendation |
| POST | `/api/fitness/nutrition` | F08 | Get nutrition guidance for query |
| POST | `/api/fitness/form-cue` | F07 | Get form cues for exercise |
| POST | `/api/fitness/substitute` | F03 | Find exercise substitution |
| POST | `/api/fitness/checkin` | F09 | Submit daily check-in |
| POST | `/api/fitness/webhook/healthkit` | F10 | Apple HealthKit callback (future) |
| POST | `/api/fitness/webhook/googlefit` | F10 | Google Fit callback (future) |
| GET | `/api/fitness/progress` | — | Aggregated progress data for charts |
| POST | `/api/fitness/consent` | F11 | Set health data consent flag |
| DELETE | `/api/fitness/data` | — | Request data deletion (GDPR/CCPA) |

All routes: server-side Gemini 3.5 Flash with agent-specific `systemInstruction`; sandbox fallback if `GEMINI_API_KEY` is missing.

### 6.5 Firestore Data Model

```
users/{userId}/
  profile/                  → FitnessProfile
    - goal: 'build_muscle' | 'lose_weight' | 'improve_endurance' | 'general_fitness' | 'maintain'
    - level: 'beginner' | 'intermediate' | 'advanced'
    - injuries: string[] (e.g., ['right_shoulder', 'lower_back'])
    - equipment: string[] (e.g., ['barbell', 'dumbbells', 'bench'])
    - daysPerWeek: 2 | 3 | 4 | 5 | 6
    - sessionDuration: 30 | 45 | 60 | 75 | 90 (minutes)
    - focus: string[] (e.g., ['upper_body', 'lower_body', 'core'])
    - biometrics?: { age, height, weight, gender }
    - healthDataConsent: boolean
    - specialMode: 'none' | 'glp1' | 'postpartum' | 'hypertension' | 'injury_rehab'
    - createdAt: timestamp
    - updatedAt: timestamp

  workouts/{workoutId}/     → WorkoutLogEntry
    - date: timestamp
    - planId: string
    - dayIndex: number
    - workoutName: string
    - focus: string
    - exercises: ExerciseLog[]
      - exerciseId: string
      - exerciseName: string
      - sets: SetLog[]
        - setNumber: number
        - reps: number
        - weight: number (kg)
        - rpe?: number (1-10)
        - completed: boolean
      - duration?: number (minutes)
    - totalDuration?: number (minutes)
    - rpe?: number (overall perceived exertion)
    - notes?: string
    - completed: boolean
    - skipped: boolean
    - modified: boolean (exercise substitutions made)
    - substitutions?: { exerciseId: string, reason: string }[]
    - createdAt: timestamp

  plans/{planId}/           → WeeklyPlan
    - weekNumber: number
    - startDate: timestamp
    - endDate: timestamp
    - days: DailyWorkout[]
      - dayIndex: number (0=Monday, 6=Sunday)
      - date: timestamp
      - recoveryRecommendation?: string
      - workouts: Workout[]
        - workoutId: string
        - workoutName: string
        - focus: string
        - duration: number (minutes)
        - exercises: Exercise[]
          - exerciseId: string
          - exerciseName: string
          - targetMuscles: string[]
          - equipment: string[]
          - instructions: string
          - commonMistakes: string[]
          - substitutionIds: string[] (alternative exercise IDs)
          - sets: number
          - reps: number | string (e.g., '8-12')
          - rest: number (seconds)
          - rpeTarget: number (1-10)
          - allowsSubstitution: boolean
    - version: number (increment on adaptation)
    - createdAt: timestamp
    - updatedAt: timestamp

  wearableData/{source}/{timestamp}/ → WearableDataPoint
    - source: 'apple_health' | 'google_fit' | 'strava' | 'garmin' | 'whoop' | 'oura'
    - timestamp: timestamp
    - steps?: number
    - activeCalories?: number
    - sleepDuration?: number (minutes)
    - sleepStages?: { deep: number, light: number, rem: number, awake: number }
    - restingHeartRate?: number (bpm)
    - hrv?: number (ms)
    - workoutSessions?: { duration: number, type: string, calories: number }[]
    - ingestedAt: timestamp

  chatSessions/{sessionId}/ → ChatSession
    - createdAt: timestamp
    - lastMessageAt: timestamp
    - contextSnapshot: { planId, profileSummary, recentWorkouts }
    - messages: ChatMessage[]
      - id: string
      - role: 'user' | 'assistant' | 'system'
      - content: string
      - timestamp: timestamp
      - agentId?: string (which agent produced this response)
      - typingDuration?: number (ms, for observability)

  checkIns/{checkInId}/     → CheckIn
    - date: timestamp
    - workoutId?: string (if post-workout)
    - energyLevel: 1 | 2 | 3 | 4 | 5
    - mood: 1 | 2 | 3 | 4 | 5
    - painOrIssues?: string (free text)
    - sleepQuality: 1 | 2 | 3 | 4 | 5
    - sleepDuration?: number (minutes, if not from wearable)
    - motivationLevel: 1 | 2 | 3 | 4 | 5
    - workoutCompleted: boolean
    - notes?: string
    - createdAt: timestamp

  recovery/{assessmentId}/  → RecoveryAssessment
    - assessedAt: timestamp
    - recoveryScore: number (0-100)
    - recommendation: 'train_normal' | 'reduce_volume' | 'reduce_intensity' | 'rest'
    - recommendationText: string (explanation for user)
    - factors: { name: string, value: string, impact: 'positive' | 'negative' }[]
    - dataSources: string[] (e.g., ['apple_health', 'checkin'])
    - dataAgeHours: number (how old is the newest data point)

  subscription/             → UserSubscription
    - tier: 'free' | 'premium' | 'elite'
    - stripeCustomerId?: string
    - stripeSubscriptionId?: string
    - status: 'active' | 'past_due' | 'canceled' | 'incomplete'
    - currentPeriodEnd?: timestamp
    - createdAt: timestamp

  settings/                 → UserSettings
    - notificationsEnabled: boolean
    - dailyDigestTime?: string (HH:mm)
    - preferredRestDuration?: number (seconds)
    - theme: 'light' | 'dark' | 'system'
    - createdAt: timestamp
    - updatedAt: timestamp

  dailyDigest/{timestamp}/  → DailyDigest (read-only, generated by server)
    - date: timestamp
    - sleepSummary?: string
    - yesterdayWorkout?: { name, completed, duration }
    - todaysPlan?: { workoutName, focus, duration }
    - recoveryRecommendation?: string
    - generatedAt: timestamp

exerciseLibrary/{exerciseId}/ → Exercise (public read-only)
  - id: string
  - name: string
  - category: 'strength' | 'hypertrophy' | 'mobility' | 'core' | 'cardio' | 'plyometric' | 'endurance'
  - targetMuscles: string[]
  - secondaryMuscles: string[]
  - equipment: string[]
  - difficulty: 'beginner' | 'intermediate' | 'advanced'
  - instructions: string
  - commonMistakes: string[]
  - substitutionIds: string[]
  - videoUrl?: string
  - createdAt: timestamp
```

---

## 7. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Onboarding completion rate | > 70% of sign-ups reach profile complete | Funnel: sign-up → each step → profile saved |
| First workout completion | > 50% of onboarded users complete first workout within 48 hours | Workout logged within 48h of sign-up |
| 7-day retention | > 40% (users who log ≥ 1 workout in day 7) | Analytics event: workout_completed on day 7 |
| 30-day retention | > 20% (users who log ≥ 1 workout in day 30) | Analytics event: workout_completed on day 30 |
| Workout completion rate | > 60% of scheduled workouts completed | Completed / (completed + skipped) |
| Chat engagement | > 30% of active users send ≥ 1 chat message per week | Chat session count per user per week |
| Plan adaptation adoption | > 80% of users have ≥ 1 adaptation within first 3 weeks | Adaptation events per user |
| Wearable connection rate | > 40% of premium users connect ≥ 1 wearable | Wearable data writes per user |
| Daily digest open rate | > 50% | Push notification open rate |
| AI response quality | < 2% of chat responses flagged as unhelpful/unsafe | User thumbs-down + Compliance Gate escalations |
| Exercise substitution usage | > 15% of workouts have ≥ 1 substitution | Substitution events per workout |

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Latency** | Chat response < 3 seconds; plan generation < 5 seconds; recovery score < 1 second (cached where possible); workout logging < 500ms |
| **Availability** | 99.5% uptime for core coaching features during peak hours (6am-10pm user local time) |
| **Privacy** | Health data consent gate at API level (F11); wearable data encrypted at rest (Firebase); GDPR/CCPA deletion pipeline; explicit consent before any health data processing; no health data used for model training |
| **Safety** | Compliance Gate (F11) rejects workout recommendations that contradict declared injuries; medical advice queries get disclaimer + redirect; all workout plans include "consult a professional" footer; conservative exercise recommendations for beginners; no max-load recommendations without supervision note |
| **Scalability** | Server-side Gemini calls are stateless; Firestore scales automatically; exercise library is static (bundled TypeScript file, no database reads for lookup); wearable data webhooks are idempotent |
| **Mobile** | Responsive web app (PWA-capable), mobile-first UX; FCM push notifications; offline workout logging queued for sync when online |
| **Cost** | Gemini 3.5 Flash for standard agents (F01, F03, F07, F09, F10); Flash Thinking / Pro for chat (F06) + plan generation (F02); target < $0.05 per active user per day at scale |
| **Accessibility** | WCAG 2.1 AA compliance; keyboard navigable; screen reader friendly; color contrast compliant |

---

## 9. Competitive Landscape

### 9.1 Direct Competitors

| Competitor | Type | Pricing | Key Features | Gaps vs. PolyVerses |
|---|---|---|---|---|
| **Fitbod** | Mobile app | $13/month | AI workout generation, exercise library, streaming | No chat coach, no wearable integration beyond basic, no recovery-based adaptation, no motivation coaching |
| **Freeletics** | Mobile app | $12/month | AI workout plans, Flo coaching chat, bodyweight focus | Limited equipment support, no wearable integration, no recovery analysis, limited exercise library |
| **Future** | Human coach + app | $150/month | Real human coach, app tracking, chat with coach | Very expensive, human coach bottleneck, no AI autonomy, no recovery-based adaptation |
| **Caliber** | Mobile app | Free + $10/month premium | Strength training focus, progressive overload, some AI | No chat coach, no wearable integration, limited adaptation, no motivation coaching |
| **Healthify** | Mobile app | Freemium | AI nutrition + fitness, calorie tracking, some coaching | Nutrition-focused, limited workout generation, no recovery, no wearable integration |
| **FitTrack** | Mobile app | $10/month | AI workout plans, basic tracking | Basic features, no chat, no wearables, no recovery |
| **JuggernautAI** | Mobile app | $30/month | AI coaching, strength focus, some adaptation | Niche (strength athletes), no wearables, no chat, expensive |
| **Tempo** | Hardware + app | $13/month + hardware | AI coaching, home gym hardware, computer vision | Hardware required, expensive, no wearables, no chat |
| **Mustang** | Mobile app | Varies | AI coaching, strength focus | Limited info, niche, no wearables |
| **Peloton Guide** | Hardware + app | $13/month + hardware | AI coaching, camera-based form, classes | Hardware required, no wearables, no chat, classes-focused |
| **iFIT Tailor** | Mobile app | Included in iFIT ($13-39/month) | AI workout adaptation, Galaxy Watch integration | Samsung ecosystem only, limited to hardware ecosystem, no chat |
| **Vi** | Hardware + app | $200+ hardware + subscription | AI coaching headphones, workout audio | Hardware required, audio-only, no visual, no wearables integration |

### 9.2 PolyVerses (PolySync) Competitive Advantages

| Advantage | PolySync | Closest Competitor | Gap |
|---|---|---|---|
| **Multi-agent reasoning** (each decision traced to specific agent + rationale) | ✅ Unique | None | No competitor uses multi-agent architecture; all use single-model or rule-based systems |
| **Recovery-based real-time adaptation** from wearables | ✅ Phase 2 | iFIT Tailor (partial — Galaxy Watch only) | Only iFIT Tailor does any wearable-based adaptation, and it's limited to one ecosystem |
| **Conversational coach** with full user context | ✅ Phase 2 | Freeletics Flo (partial — limited context) | Freeletics Flo is closest but has limited personalization and no wearable data integration |
| **Sentiment-aware motivation coaching** | ✅ Phase 3 | None | No competitor does sentiment analysis or dropout risk detection |
| **Multi-wearable aggregation** (HealthKit + Google Fit + Strava + Garmin + WHOOP + Oura) | ✅ Phase 2-3 | None (max 1-2 devices per competitor) | No competitor aggregates across multiple wearable ecosystems |
| **Transparent observability** (users can see which agent produced each recommendation + why) | ✅ Unique | None | Differentiator for coaching quality trust |
| **GLP-1 / special mode programming** | ✅ Phase 4 | None | Rapidly growing segment with no specialized solution |
| **Affordable pricing** ($12-15/month vs. $13-150/month) | ✅ | Fitbod ($13), Freeletics ($12), Caliber ($10 premium) | Competitive with lowest-priced alternatives but far cheaper than human coaches ($150/month) |
| **Compliance gate** (injury conflict check, medical disclaimer, safety thresholds) | ✅ Unique | None | Safety feature no competitor has; important for liability and user trust |

### 9.3 Market Positioning

**Primary positioning:** "The AI fitness coach that adapts to you — your workouts, your recovery, your progress, all powered by multi-agent AI that knows your body."

**Secondary positioning (niche):** "The first AI fitness coach for GLP-1 users — strength-preserving, recovery-aware programming designed for your medication journey."

**Competitive moat:** The multi-agent architecture + recovery-based adaptation + conversational coach combination is unique. No competitor can replicate this quickly because it requires a fundamental architectural shift (not just a feature add).

---

## 10. Go-to-Market Strategy

### 10.1 Launch Phases

| Phase | Timeline | Focus | Success Criteria |
|---|---|---|---|
| **Alpha** | Week 1-4 | Internal testing, friend/family beta (10-20 users), bug fixing | Core loop works end-to-end, no critical bugs |
| **Beta** | Week 5-8 | Public beta (100-500 users), feedback collection, iteration | 7-day retention > 30%, onboarding completion > 60%, first workout completion > 40% |
| **Launch** | Week 9-12 | Public launch, marketing push, influencer outreach | 1,000+ users, 7-day retention > 40%, 30-day retention > 20%, workout completion > 60% |
| **Growth** | Month 4-6 | Feature additions (chat, wearables, motivation), paid acquisition | 10,000+ users, revenue > $10K/month, wearable connection rate > 40% |

### 10.2 Acquisition Channels

| Channel | Strategy | Expected CAC |
|---|---|---|
| **Content marketing** | Blog posts, YouTube videos, social media content about AI fitness, recovery, adaptive training | Low ($1-5 per user) |
| **Influencer partnerships** | Fitness influencers, GLP-1 community leaders, wearable enthusiasts | Medium ($10-30 per user) |
| **App store optimization** | SEO for "AI fitness coach", "adaptive workout", "personalized training" | Low (organic) |
| **Referral program** | "Invite a friend, both get 1 month premium free" | Low ($2-5 per user) |
| **Community building** | Discord/Reddit communities for AI fitness, GLP-1 fitness, wearable data enthusiasts | Low (organic) |
| **Paid ads** | Google Ads, social media ads (Instagram, TikTok) targeting fitness + wearable interests | High ($20-50 per user) — use selectively |

### 10.3 Pricing Strategy

| Tier | Price | Features | Target |
|---|---|---|---|
| **Free** | $0 | Profile, basic weekly plan (non-adaptive), workout logging, limited chat (5 sessions/week), basic progress view | User acquisition, funnel top |
| **Premium** | $12/month | Full adaptive plans, unlimited chat, wearable integration (HealthKit + Google Fit), daily digests, motivation coaching, full progress analytics, exercise substitution | Core revenue, majority of users |
| **Elite** | $20/month | All premium + multi-wearable aggregation (Strava, Garmin, WHOOP, Oura), sentiment coaching, GLP-1/special mode programming, priority support, early access to CV/AR features, custom workout builder | High-ARPU niche, enthusiasts |

**Annual discount:** 2 months free (18 months for price of 12) to improve retention and LTV.

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Gemini API quality insufficient for coaching chat** | Medium | High (chat is #1 differentiator) | Use Flash Thinking / Pro for F06; invest heavily in system prompt quality; allow user feedback ("was this helpful?") to iterate; have fallback to rule-based responses for common questions |
| **Exercise library quality / coverage gaps** | Low | Medium (101 exercises is solid start) | Allow user feedback on substitutions; expand library based on usage patterns; target 200+ exercises by Phase 2; consider ExerciseDB API or scraped data for expansion |
| **HealthKit/Google Fit web API limitations** | High | Medium (web APIs are limited vs. native) | Ship with user-reported check-ins as fallback; prioritize native mobile app (Phase 5) for full wearable access; web APIs sufficient for sleep, HR, steps, active calories |
| **User acquisition cost high** in competitive market | High | High ($6.2B market has many players) | Differentiate on: (1) conversational coach quality, (2) recovery-based adaptation, (3) multi-wearable aggregation, (4) affordable pricing; target niche first (GLP-1 users, injury-aware) before broadening; content marketing + community building over paid ads initially |
| **Dropout / retention below targets** | High | High (fitness apps have high churn) | Invest in Phase 3 (notifications, motivation, check-ins) early; track NUX funnel from day 1; iterate on onboarding completeness; build habit-forming features (streaks, daily digest, progress visibility) |
| **Liability / safety issues** (injury from bad advice) | Low | Very High (injury, lawsuit) | F11 Compliance Gate is safety-critical; never skip it; clear disclaimers everywhere; conservative exercise recommendations; no medical advice; consult professional for injuries; liability insurance |
| **Gemini API cost exceeds budget** at scale | Medium | Medium | Use Flash for standard agents; route only F06 (chat) and F02 (plan generation) to higher-tier models; cache responses where possible; target < $0.05/active user/day; monitor cost per user metric |
| **Wearable data quality issues** (missing data, outliers) | Medium | Low-Medium | F04 Recovery Analyst handles missing data gracefully (uses available data, notes gaps); outlier detection; user can manually correct; multiple data sources provide redundancy |

---

## 12. Open Questions

| # | Question | Decision Needed By | Owner |
|---|---|---|---|
| OQ-1 | Full pivot of PolyVerses → fitness coach, or add fitness as a module alongside PM workbench? | **Now** (README pivot suggests full pivot, but needs confirmation) | Product |
| OQ-2 | Apple HealthKit on web: use HealthKit JS API (Safari-only) or wait for native mobile app? | Before Phase 2 | Engineering |
| OQ-3 | Push notification provider: FCM (web) only, or also APNs via OneSignal/etc.? | Before Phase 3 | Engineering |
| OQ-4 | Subscription billing: Stripe directly or merchant-of-record (Lemon Squeezy) for global tax handling? | Before Phase 4 | Product + Engineering |
| OQ-5 | Gemini model tier: Flash only for cost, or Flash + Pro routing for coaching quality? | Before launch | Product + Engineering |
| OQ-6 | Exercise library expansion: 200+ exercises by Phase 2 — source? (ExerciseDB API, scraped data, manual entry) | Before Phase 2 | Product |
| OQ-7 | Web app only for MVP, or invest in PWA offline support + installability from the start? | Before Phase 1 | Engineering |
| OQ-8 | Observability dashboard: keep it as a debug/admin view, or expose coaching transparency to users (show which agent produced each recommendation)? | Before Phase 1 | Product |

---

## 13. Appendix

### 13.1 Exercise Library Coverage

Current library: 101 exercises across 7 categories:
- **Strength:** 49 exercises (barbell, dumbbell, machine, cable, bodyweight)
- **Hypertrophy:** 11 exercises (higher rep ranges, isolation focus)
- **Mobility:** 17 exercises (dynamic stretching, joint mobility, foam rolling)
- **Core:** 13 exercises (planks, rotations, anti-movement, flexion)
- **Cardio:** 5 exercises (running, cycling, rowing, jumping rope, HIIT)
- **Plyometric:** 5 exercises (box jumps, depth jumps, bounds, medicine ball throws)
- **Endurance:** 1 exercise (long-duration steady state — placeholder for expansion)

Target by Phase 2: 200+ exercises with full metadata coverage.

### 13.2 Agent System Prompt Strategy

Each agent has a `systemInstruction` that defines:
1. **Role and expertise** (e.g., "You are the Workout Generator Agent, an expert exercise physiologist and program designer...")
2. **Input schema** (what data the agent receives)
3. **Output schema** (what format the agent returns — strict JSON for programmatic use)
4. **Constraints** (e.g., "Never recommend an exercise that uses equipment the user doesn't have", "Never contradict a declared injury")
5. **Safety rules** (e.g., "If the user asks about an injury, recommend consulting a healthcare professional")
6. **Tone** (e.g., "Encouraging but factual; explain your reasoning; never overpromise")

System prompts are stored in `AthenaCodeStore.ts` (or dedicated `agents/` directory) and editable via the Prompt Console UI.

### 13.3 Feedback Loops

```
User Feedback                          System Response
─────────────                          ──────────────
Thumbs up/down on chat response  →  Log to observability; if < 80% helpful, flag for prompt iteration
Exercise substitution accepted   →  Remember substitution; prioritize next time; update user preference profile
Workout skipped                   →  F05 adapts next week (reduce volume or move to different day)
Workout completed with high RPE  →  F05 considers reducing intensity next time; F04 notes in recovery
Workout completed with low RPE   →  F05 considers progressive overload (increase weight/reps)
Check-in shows declining motivation →  F09 triggers re-engagement nudge (push notification or chat)
Recovery score low for 3+ days   →  F05 schedules deload week; F06 suggests rest day activities
Wearable disconnected            →  F04 uses check-in data as fallback; F09 sends re-connection nudge
```

---

*Document version: 1.0 — PolyVerses AI Fitness Coach Platform PRD*  
*Phase 0 foundation complete: exercise library (101 exercises), types (33 interfaces), Firestore rules (10 collections + consent gate), README pivot, market research*  
*Phase 1 core coaching loop not yet started — next: server.ts fitness API routes + agent system prompts*
