# PolyVerses — Complete Architecture Reference

> **AI Product Management Workbench · 12-Agent Orchestration Mesh · v1.0 · 2026-09-17**

**Status:** Phase 1 — agent runtime (F00–F11) implementation in progress. Architecture reference documents the design for the full PM workbench including agent registry, orchestrator, governance layer, and 4 API endpoints.

**Scope:** The full PolyVerses PM workbench system — the 12-agent specialist mesh (F00–F11) for product management tasks, the orchestrator router (F00), the governance layer (token budgets, circuit breakers, observability), and the 4 API endpoints (`/api/orchestrate`, `/api/observability`, `/api/agents`, `/api/route`).

**Note on repo scope:** This architecture reference covers **PolyVerses** — the PM workbench. The fitness coaching product **PolySync** has its own architecture documented separately. This document is about PolyVerses only.

---

## 1. System Overview

PolyVerses is an **AI-native product management workbench** built on a **server-rendered React + Vite + TypeScript + Firebase + Express** stack. It orchestrates a **12-agent specialist AI mesh (F00–F11)** to assist product leaders with core PM tasks: requirements drafting, technical design, release planning, sprint management, discovery research, risk analysis, metrics definition, RICE prioritization, change communications, and knowledge curation. The Gemini API key is held **server-side** in `server.ts`; the client calls the app's own API endpoints and never sees the key.

### 1.1 What PolyVerses Does

1. **Query routing (F00 Orchestrator):** A user submits a product question. F00 analyzes the query, determines which specialist agent(s) should handle it, and routes the request. Routing is transparent — the user sees which agent was selected and why.

2. **Agent execution:** Each of the 12 specialist agents (F01–F11) has a domain-specific system prompt, model tier (flash / flash-thinking / pro), token budget, and capability set. Agents produce structured responses with markdown formatting.

3. **Human gate:** Certain agent responses (especially decisions that affect product direction) require human approval before being actioned. The gate is surfaced in the ThinkSurface UI.

4. **Observability (S1 governance):** Every agent invocation is logged with input/output token counts, model tier, intent, and gate status. The ObservabilityDashboard shows real-time budget usage (session 100K, weekly 500K), circuit breaker state, and decision gate activity.

5. **Knowledge curation (F11):** Agent outputs and PM notes are indexed, tagged, and linked. F11 curates the knowledge base so past decisions are retrievable.

### 1.2 Agent Roles (F00–F11)

| Agent | Name | Domain | Model Tier | Budget |
|-------|------|--------|------------|--------|
| F00 | Orchestrator Router | Query analysis + routing | flash | 5K/turn |
| F01 | Prompt Engineer | Prompt optimization | flash | 5K/turn |
| F02 | Requirements Engineer | User stories, FRs, acceptance criteria | flash-thinking | 10K/turn |
| F03 | Technical Architect | RFCs, design docs, architecture decisions | pro | 20K/turn |
| F04 | Release Manager | Release planning, cut lists, launch tracking | flash | 5K/turn |
| F05 | Sprint Planner | Sprint goals, backlog, task breakdown | flash | 5K/turn |
| F06 | Discovery Engineer | Assumption validation, research design, prototyping | flash-thinking | 10K/turn |
| F07 | Risk Analyst | Risk identification, assessment, mitigation | flash | 5K/turn |
| F08 | Metrics Analyst | KPI definition, measurement strategy, dashboards | flash | 5K/turn |
| F09 | Prioritization Lead | RICE scoring, roadmap ordering | flash-thinking | 10K/turn |
| F10 | Change Manager | Stakeholder communication, adoption planning | flash | 5K/turn |
| F11 | Knowledge Steward | Note indexing, curation, linking, progressive summarization | flash | 4K/turn |

### 1.3 Implementation Status

| Component | Status |
|-----------|--------|
| 12-agent mesh (F00–F11) with system prompts | Implemented — `src/agents/index.ts` |
| Agent registry (types, capabilities, triggers) | Implemented — `src/agents/index.ts` |
| Orchestrator router (F00) with deterministic + Gemini routing | Implemented — `server.ts` |
| 4 PM API endpoints (`/api/orchestrate`, `/api/observability`, `/api/agents`, `/api/route`) | Implemented — `server.ts` |
| Token budget tracking (session 100K, weekly 500K, per-agent) | Implemented — `server.ts` |
| Circuit breaker (small/medium/capable levels) | Implemented — `server.ts` |
| Agent run logging + observability endpoint | Implemented — `server.ts` |
| Sandbox fallback when Gemini API key unavailable | Implemented — `server.ts` |
| ThinkSurface query interface (React component) | Implemented — `src/components/ThinkSurface.tsx` |
| ObservabilityDashboard governance panel (React component) | Implemented — `src/components/ObservabilityDashboard.tsx` |
| App.tsx PM Workbench tab + Observability tab | Implemented — `src/App.tsx` |
| AgentNetworkDiagram visualization | Implemented — `src/components/AgentNetworkDiagram.tsx` |
| OrchestrationConsole | Implemented — `src/components/OrchestrationConsole.tsx` |
| PromptConsole | Implemented — `src/components/PromptConsole.tsx` |
| Capture & Index layer | Designed — not yet implemented |
| Retrieve & Assemble layer | Designed — not yet implemented |
| Reason & Act layer | Designed — not yet implemented |
| Human gate workflow | Designed — not yet implemented |
| Distillation scheduler | Designed — not yet implemented |

### 1.4 What's Not Yet Implemented

- **Capture & Index layer:** No ingestion pipeline for PM notes, meeting transcripts, or product docs. F11 knowledge steward operates on-demand only.
- **Retrieve & Assemble layer:** No context retrieval from indexed knowledge. Each query is treated as standalone.
- **Reason & Act layer:** No multi-agent collaboration loop where agents build on each other's outputs.
- **Human gate workflow:** Gate UI exists but no workflow for reviewing/approving/rejecting gated decisions.
- **Distillation scheduler:** No scheduled batch distillation of accumulated knowledge into principles (Level 4 summaries).

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT (React SPA / PWA)                         │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ ThinkSurface │  │ Observability│  │ Agent Network│                  │
│  │ (query input │  │ Dashboard    │  │ Diagram      │                  │
│  │  + results)  │  │ (governance) │  │ (visualization)│                │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│  ┌──────────────┐  ┌──────────────┐                                    │
│  │ Orchestration│  │ Prompt       │                                    │
│  │ Console      │  │ Console      │                                    │
│  └──────────────┘  └──────────────┘                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                PM Workbench Tab Navigation (App.tsx)                ││
│  │  [Today] [Weekly] [Progress] [Coach] [Settings] [PM Workbench]     ││
│  │                                        [Observability]              ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                           │  HTTP (REST)
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SERVER (Express + Vite, port 3000)                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     PM WORKBENCH LAYER (NEW)                            ││
│  │  F00 ─ Orchestrator Router  ─── routes queries to specialist agents    ││
│  │  F01 ─ Prompt Engineer      ─── optimizes agent prompts                ││
│  │  F02 ─ Requirements Engineer ─── drafts user stories + acceptance crit ││
│  │  F03 ─ Technical Architect  ─── writes RFCs + design docs              ││
│  │  F04 ─ Release Manager      ─── plans releases + cut lists             ││
│  │  F05 ─ Sprint Planner       ─── breaks down sprints + backlogs         ││
│  │  F06 ─ Discovery Engineer   ─── validates assumptions + research design││
│  │  F07 ─ Risk Analyst         ─── identifies + assesses product risks     ││
│  │  F08 ─ Metrics Analyst      ─── defines KPIs + measurement strategy     ││
│  │  F09 ─ Prioritization Lead  ─── RICE scoring + roadmap ordering         ││
│  │  F10 ─ Change Manager       ─── stakeholder comms + adoption planning   ││
│  │  F11 ─ Knowledge Steward    ─── indexes + curates PM notes + decisions  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     GOVERNANCE LAYER (S1 — implemented)                ││
│  │  • Token budget tracking (session 100K, weekly 500K, per-agent caps)   ││
│  │  • Circuit breaker (small → medium → capable escalation)               ││
│  │  • AgentRun logging (every invocation recorded)                         ││
│  │  • Observability endpoint (/api/observability)                          ││
│  │  • Budget enforcement before agent invocation                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     LEGACY FITNESS LAYER (PolySync — separate product) ││
│  │  /api/fitness/* endpoints retained for reference                        ││
│  │  NOT part of PolyVerses PM workbench scope                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  API ENDPOINTS                                                          ││
│  │  POST /api/orchestrate  ─── submit query, get routed response          ││
│  │  GET  /api/observability ─── budget + run history + stats              ││
│  │  GET  /api/agents        ─── list all 12 agents with metadata          ││
│  │  POST /api/route         ─── preview routing decision without executing ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Client Architecture (App.tsx)

### 3.1 Tab Structure

PolyVerses extends the existing fitness app shell with two new tabs:

| Tab | Component | Purpose |
|-----|-----------|---------|
| PM Workbench | `ThinkSurface` | Query input, routing preview, agent response display, human gate trigger |
| Observability | `ObservabilityDashboard` | Budget tracking, circuit breaker status, run history, gate activity |

The fitness tabs (Today's Workout, Weekly Plan, Progress, Coach Chat, Settings) remain for the legacy PolySync layer.

### 3.2 ThinkSurface Component

**File:** `src/components/ThinkSurface.tsx` (477 lines)

The ThinkSurface is the primary user interface for the PM workbench. It provides:

1. **Query input:** A textarea where the PM types a product question
2. **Context input:** Optional background/requirements text to enrich the query
3. **Quick prompts:** Six pre-built prompt templates covering common PM tasks (user stories, RICE prioritization, risk analysis, release plan, research, change comms)
4. **Routing preview:** Before executing, the user can preview which agent F00 would route to
5. **Execute:** Submits to `/api/orchestrate`, displays the agent's response with markdown formatting
6. **Human gate indicator:** Shows when a response requires human approval (shield icon + "Gate" badge)
7. **Budget bar:** Real-time session and weekly token usage with color-coded progress bars
8. **History tab:** Recent queries with agent IDs, timestamps, and gate status

**State management:**
- `query` / `context` — user input
- `isRunning` — loading state during API call
- `result` — orchestrate response data
- `routingOnly` — preview routing decision
- `history` — recent query list from observability
- `budget` — current budget state
- `error` — API error display
- `showOutput` — toggle for showing/hiding full response text

### 3.3 ObservabilityDashboard Component

**File:** `src/components/ObservabilityDashboard.tsx` (403 lines)

The ObservabilityDashboard is the governance panel for S1. It provides three views:

**Budget View:**
- Circuit breaker status card (color-coded: green/amber/red)
- Session budget card (100K tokens, progress bar, used/remaining)
- Weekly budget card (500K tokens/week, progress bar, used/remaining)
- Per-agent budget table (all 12 agents with used/budget/percentUsed)

**Runs View:**
- Summary stats (total runs, total tokens, average per run)
- Scrollable list of recent agent runs with agent ID, model tier, intent, input/output tokens, timestamp, gate indicator

**Gates View:**
- Decision gate rate stat
- List of runs that triggered the human gate

**Data source:** `GET /api/observability` — returns `{ budget, runs, stats, recentActivity }`

### 3.4 Existing PM Components

The following components already exist and are part of the PM workbench UI:

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| AgentNetworkDiagram | `src/components/AgentNetworkDiagram.tsx` | 773 | D3 force-directed graph of agent topology with heatmap overlay |
| OrchestrationConsole | `src/components/OrchestrationConsole.tsx` | 1942 | Multi-agent orchestration control panel with agent status, routing visualization, and execution controls |
| PromptConsole | `src/components/PromptConsole.tsx` | 702 | Prompt editing and optimization interface for F01 Prompt Engineer |

---

## 4. Server Architecture (server.ts)

### 4.1 File Structure

**File:** `server.ts` (1932 lines total, ~560 lines for PM workbench layer)

The PM workbench layer is appended after the fitness layer in `server.ts`. It consists of:

1. **Agent import** (line ~1325): `import { AGENTS, listAgentIds, getAgent, findAgentsByTriggers, ModelTier } from "./src/agents/index";`
2. **Session budget state** (lines ~1325–1350): In-memory budget tracking per session
3. **Budget functions** (lines ~1365–1395): `checkBudget()`, `recordUsage()`
4. **Orchestrator** (lines ~1395–1550): `orchestrateQuery()`, `deterministicRoute()`, `extractAgentId()`, `invokeAgent()`, `sandboxAgentResponse()`
5. **Observability** (lines ~1550–1700): `logAgentRun()`, `handleObservability()`
6. **API endpoints** (lines ~1870–1930): `/api/orchestrate`, `/api/observability`, `/api/agents`, `/api/route`

### 4.2 Agent Registry (`src/agents/index.ts`)

**File:** `src/agents/index.ts` (716 lines, 46.9KB)

The agent registry defines all 12 agents as TypeScript constants:

```typescript
export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;       // 700-755 chars each
  modelTier: ModelTier;       // 'flash' | 'flash-thinking' | 'pro'
  defaultBudget: number;      // tokens per invocation (4000-20000)
  estimatedTokens: { input: number; output: number };
  capabilities: string[];
  triggers: string[];         // keywords that route to this agent
  requiresGate: boolean;      // whether human approval is needed
}
```

Each agent has:
- A unique ID (F00–F11)
- A human-readable name
- A description for the agent list
- A full system prompt (700-755 characters) defining the agent's role, expertise, output format, and constraints
- A model tier assignment
- A default token budget
- Estimated input/output tokens for budget planning
- Capability tags for discovery
- Trigger keywords for deterministic routing
- A gate flag (F00, F02, F03, F06, F09 require gate; others don't)

### 4.3 Model Tier Router

The server routes agent invocations to the appropriate Gemini model based on the agent's `modelTier`:

| Tier | Model | Use Case | Cost |
|------|-------|----------|------|
| `flash` | `gemini-2.0-flash` | Fast, cheap tasks (routing, simple drafting) | ~$0.10/1M input |
| `flash-thinking` | `gemini-2.0-flash-thinking-exp` | Reasoning-heavy tasks (requirements, discovery, risks, prioritization) | ~$0.50/1M input |
| `pro` | `gemini-2.0-pro` | Complex architecture decisions, detailed design docs | ~$1.50/1M input |

When the Gemini API key is unavailable (`key === 'MY_GEMINI_API_KEY'`), the server falls back to `sandboxAgentResponse()` which generates realistic placeholder responses based on the agent ID and query.

### 4.4 Token Budget System

**Session budget:** 100,000 tokens per session (resets when server restarts)
**Weekly budget:** 500,000 tokens per week (tracked in-memory, resets weekly)
**Per-agent budgets:** Each agent has a per-session cap (4,000-20,000 tokens depending on tier)

**Budget check flow:**
1. Before invoking an agent, `checkBudget(agentId, estimatedTokens)` is called
2. If the agent's per-agent budget is exceeded → circuit breaker → 'small', invocation blocked
3. If the session budget is exceeded → circuit breaker → 'medium', invocation blocked
4. If both pass → invocation proceeds, `recordUsage()` updates counters

**Circuit breaker escalation:**
- `none` → normal operation, all agents available
- `small` → small agents (F01, F04, F05, F07, F08, F10, F11) blocked; synthesis agents (F02, F03, F06, F09) may still run
- `medium` → pause all synthesis agent invocations
- `capable` → halt all agent invocations entirely

### 4.5 Orchestrator Routing

F00 orchestrator uses two routing strategies:

**Deterministic routing (primary):** Matches query keywords against each agent's `triggers` array. Returns the first matching agent as primary, with any additional matches as secondary.

**Gemini-based routing (when API available):** Sends the query to Gemini 2.0 Flash with F00's system prompt, parses the JSON response to extract `primaryAgent`, `rationale`, `confidence`, and `requiresGate`.

**Fallback routing:** If no agent matches, defaults to F02 (Requirements Engineer) with low confidence.

### 4.6 API Endpoints

#### POST /api/orchestrate

Submits a PM query for full orchestration.

**Request:**
```json
{
  "query": "Write user stories for a new onboarding flow",
  "context": "Optional background text..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routing": {
      "primaryAgent": "F02",
      "primaryAgentName": "Requirements Engineer",
      "rationale": "Matched F02 based on query keywords.",
      "secondaryAgents": ["F07", "F09"],
      "requiresGate": false,
      "intent": "requirements-drafting",
      "confidence": 0.7
    },
    "agentId": "F02",
    "agentName": "Requirements Engineer",
    "modelTier": "flash-thinking",
    "inputTokens": 1200,
    "outputTokens": 3500,
    "output": "## User Stories...",
    "requiresGate": false,
    "budget": {
      "sessionUsed": 54000,
      "sessionRemaining": 46000,
      "weeklyUsed": 128000,
      "weeklyRemaining": 372000
    }
  }
}
```

#### GET /api/observability

Returns current governance state.

**Response:**
```json
{
  "success": true,
  "data": {
    "budget": {
      "sessionUsed": 54000,
      "sessionBudget": 100000,
      "sessionRemaining": 46000,
      "sessionPercentUsed": 54.0,
      "weeklyUsed": 128000,
      "weeklyBudget": 500000,
      "weeklyRemaining": 372000,
      "weeklyPercentUsed": 25.6,
      "perAgent": {
        "F00": { "used": 5000, "budget": 5000, "percentUsed": 100.0 },
        "F02": { "used": 15000, "budget": 10000, "percentUsed": 150.0 }
      },
      "circuitBreakerLevel": "none"
    },
    "runs": [...],
    "recentActivity": [...],
    "stats": {
      "totalRuns": 8,
      "totalTokensUsed": 54000,
      "averageTokensPerRun": 6750,
      "decisionGateRate": 0,
      "circuitBreakerTriggers": 0,
      "weeklyRunCount": 8,
      "weeklyTokenUsage": 128000
    }
  }
}
```

#### GET /api/agents

Returns the full agent registry.

**Response:**
```json
{
  "success": true,
  "data": {
    "agents": [
      { "id": "F00", "name": "Orchestrator Router", "description": "Analyzes PM queries, determines routing...", "modelTier": "flash", "defaultBudget": 5000, "capabilities": [...], "triggers": [...], "requiresGate": true, "estimatedTokens": { "input": 1000, "output": 500 } },
      ...
    ],
    "count": 12
  }
}
```

#### POST /api/route

Preview routing without executing the full query.

**Request:**
```json
{ "query": "Write user stories for a new onboarding flow" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routing": { "primaryAgent": "F02", "primaryAgentName": "Requirements Engineer", "rationale": "...", "secondaryAgents": ["F07", "F09"], "requiresGate": false, "intent": "requirements-drafting", "confidence": 0.7 },
    "agent": { "id": "F02", "name": "Requirements Engineer", "description": "...", "modelTier": "flash-thinking", "requiresGate": false, "estimatedTokens": { "input": 1000, "output": 500 } }
  }
}
```

---

## 5. Data Flow Diagrams

### 5.1 Query Execution Flow (L0)

```
User → ThinkSurface ──query──→ F00 Orchestrator ──route──→ Specialist Agent (F01-F11)
                                                        │
                                          Gemini API / Sandbox
                                                        │
                                           Response + tokens
                                                        │
                                           Budget check + recordUsage()
                                                        │
                                           AgentRun log ──→ Firestore
                                                        │
                                           Response ──→ ThinkSurface UI
                                                        │
                                           If requiresGate: Human Gate ──→ Decision
```

### 5.2 Budget Enforcement Flow

```
Agent invocation requested
         │
         ▼
checkBudget(agentId, estimatedTokens)
         │
         ├── Agent budget exceeded ──→ circuitBreaker = 'small' ──→ BLOCK
         ├── Session budget exceeded ──→ circuitBreaker = 'medium' ──→ BLOCK
         └── Both OK ──→ proceed
                        │
                        ▼
                   invokeAgent()
                        │
                        ▼
                   recordUsage(agentId, inputTokens, outputTokens)
                        │
                        ├── sessionUsed += total
                        ├── perAgent[agentId].used += total
                        └── Check if any agent budget exceeded → escalate circuit breaker
```

### 5.3 Observability Data Flow

```
Every agent invocation:
  logAgentRun(uid, agentId, modelTier, inputTokens, outputTokens, intent, outcome, gateTriggered)
    → Create AgentRun object
    → Push to recentRuns array (max 100)
    → Write to Firestore /agent_runs/{runId}

GET /api/observability:
  → Read sessionBudget state
  → Read recentRuns (last 20)
  → Compute stats (totalRuns, totalTokens, avgTokens, gateRate, weekly usage)
  → Return { budget, runs, stats, recentActivity }
```

---

## 6. Agent System Prompts (Summary)

Each agent has a system prompt of 700-755 characters. Below is a summary of each:

| Agent | System Prompt Summary |
|-------|----------------------|
| F00 | Analyze PM queries, determine routing to specialist agents, output JSON with primaryAgent, rationale, confidence, requiresGate. Use keyword matching when Gemini unavailable. |
| F01 | Optimize prompts: improve clarity, add structure, suggest variables, apply best practices. Output: before/after comparison with rationale. |
| F02 | Draft user stories with AC, functional requirements, out of scope, open questions. Ask for clarification. Output: markdown with sections. |
| F03 | Evaluate architecture options in parallel, produce trade-off analysis, recommend with rationale. Cover simplicity vs power, build vs buy, developer experience, operational cost. |
| F04 | Create release plans: goals, target audiences, cut list table with priority/status/owner, risks/mitigations, milestones with dates. Conservative cuts. |
| F05 | Break product goals into sprint backlog: theme, goal sentence, prioritized items with tasks and AC, effort estimates, blockers. |
| F06 | Identify riskiest assumptions, design validation experiments, suggest prototypes. Output: assumptions table (risk level, validation method, success criteria). |
| F07 | Identify product risks (technical, market, UX, delivery, dependency, compliance). Assess likelihood/impact (1-5), suggest mitigations. Output: prioritized risk table. |
| F08 | Define KPIs and measurement strategy: north star metric, supporting metrics, definitions, targets, instrumentation needs, dashboards. |
| F09 | Prioritize using RICE (Reach, Impact 1-3, Confidence %, Effort months). Score each item, rank, explain rationale. |
| F10 | Draft stakeholder communications: audience analysis, key messages, channels, timing, FAQ. Tailor tone to audience. |
| F11 | Index and curate PM notes: assign tags, projects, types, link related items, produce summaries. Progressive summarization (Level 1 verbatim → Level 4 principle). |

Full system prompts are in `src/agents/index.ts` lines 40-690.

---

## 7. Governance Layer (S1 — Implemented)

### 7.1 Token Budgets

| Scope | Budget | Reset |
|-------|--------|-------|
| Session | 100,000 tokens | Server restart |
| Weekly | 500,000 tokens | Calendar week |
| Per-agent (F00) | 5,000/turn | Per invocation |
| Per-agent (F01) | 5,000/turn | Per invocation |
| Per-agent (F02) | 10,000/turn | Per invocation |
| Per-agent (F03) | 20,000/turn | Per invocation |
| Per-agent (F04-F05, F07-F08, F10) | 5,000/turn | Per invocation |
| Per-agent (F06, F09) | 10,000/turn | Per invocation |
| Per-agent (F11) | 4,000/turn | Per invocation |

### 7.2 Circuit Breakers

| Level | Trigger | Effect |
|-------|---------|--------|
| `none` | No budget exceeded | All agents operational |
| `small` | Any agent's per-agent budget exceeded | Small agents blocked; synthesis agents may still run |
| `medium` | Session budget exceeded | All synthesis agent invocations paused |
| `capable` | Critical threshold reached | All agent invocations halted |

### 7.3 AgentRun Logging

Every invocation creates an `AgentRun` record:

```typescript
interface AgentRun {
  id: string;                    // run_YYYYMMDD_HHMMSS_RANDOM
  agentId: string;               // F00-F11
  modelTier: ModelTier;          // flash / flash-thinking / pro
  inputTokens: number;
  outputTokens: number;
  durationMs: number;            // 0 in current implementation
  intent: string;                // from routing decision
  outcome: string;               // first 500 chars of response
  decisionGateTriggered: boolean;
  timestamp: string;             // ISO 8601
  userId: string;                // Firebase UID
}
```

Recent runs are stored in-memory (last 100) and written to Firestore for persistence.

### 7.4 Observability Endpoint Design

`GET /api/observability` returns:

- `budget`: Full budget state (session, weekly, per-agent, circuit breaker level)
- `runs`: Last 20 agent runs with full metadata
- `recentActivity`: Last 10 activities (agent runs + decision gates)
- `stats`: Aggregated statistics (total runs, total tokens, average per run, gate rate, circuit breaker triggers, weekly counts)

---

## 8. Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend framework | React | 18.x |
| UI animation | motion/react (framer-motion) | latest |
| Icons | lucide-react | latest |
| Data visualization | d3 | latest |
| Charts | recharts | latest |
| Build tool | Vite | 6.x |
| Backend framework | Express | latest |
| AI SDK | @google/genai | latest |
| Environment | dotenv | latest |
| Database | Firebase Firestore | latest |
| Auth | Firebase Auth (Google OAuth) | latest |
| Language | TypeScript | latest |
| Agent registry | TypeScript (src/agents/index.ts) | 716 lines |

---

## 9. Security Model

### 9.1 API Key Protection

The Gemini API key is stored server-side in `server.ts` via `process.env.GEMINI_API_KEY`. The client never receives the key. All AI calls are proxied through the Express server.

**Important:** The key must be set to a real Gemini API key in production. The default value `'MY_GEMINI_API_KEY'` triggers sandbox mode (no actual Gemini calls).

### 9.2 Auth Requirements

All PM workbench endpoints require Firebase authentication:
- `POST /api/orchestrate` — requires auth
- `GET /api/observability` — requires auth
- `GET /api/agents` — requires auth
- `POST /api/route` — requires auth

Unauthenticated requests receive a 401 JSON response and the function returns early.

### 9.3 Firestore Security

Agent run logs are written to Firestore at `agent_runs/{runId}`. The `logAgentRun()` function uses `setDoc()` with the run ID as the document ID.

---

## 10. Deployment Model

### 10.1 Development

```bash
npm run dev      # Start Vite dev server + Express server
npm run build    # Build production bundle to dist/
npx tsc --noEmit --skipLibCheck  # TypeScript type check
```

### 10.2 Production

The Express server serves the Vite-built static files and handles all API requests on port 3000. The Vite build produces:
- `dist/index.html` — entry point
- `dist/assets/index-*.css` — bundled CSS
- `dist/assets/index-*.js` — bundled JavaScript (client + server code)

### 10.3 Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GEMINI_API_KEY` | Yes (for AI routing) | `MY_GEMINI_API_KEY` (sandbox) | Gemini API authentication |
| `PORT` | No | 3000 | Server port |

---

## 11. Build Sequence (Phase 1 — Agent Runtime)

Phase 1 builds the agent runtime layer in sequence:

### Step 1: Agent Registry + System Prompts ✅ COMPLETE
- Created `src/agents/index.ts` with all 12 agent definitions
- Each agent has system prompt, model tier, budget, capabilities, triggers
- Imported into `server.ts`

### Step 2: Orchestrator Router + Model Tier Router ✅ COMPLETE
- `orchestrateQuery()` — receives query, routes via F00, invokes specialist
- `deterministicRoute()` — keyword-based routing using agent triggers
- `extractAgentId()` — fallback extraction from Gemini text
- `invokeAgent()` — Gemini API call with model tier selection, sandbox fallback
- `sandboxAgentResponse()` — realistic placeholder responses per agent

### Step 3: Governance S1 — Observability + Budget Tracking ✅ COMPLETE
- `checkBudget()` — pre-invocation budget check
- `recordUsage()` — post-invocation token accounting
- `logAgentRun()` — AgentRun logging to in-memory array + Firestore
- `handleObservability()` — aggregates budget, runs, stats for `/api/observability`
- Circuit breaker escalation (none → small → medium → capable)

### Step 4: API Endpoints ✅ COMPLETE
- `POST /api/orchestrate` — full query orchestration
- `GET /api/observability` — governance state
- `GET /api/agents` — agent registry
- `POST /api/route` — routing preview

### Step 5: PM Workbench Frontend — ThinkSurface ✅ COMPLETE
- Query input with quick prompts
- Context input
- Routing preview before execution
- Agent response display with markdown
- Human gate indicator
- Budget bar (session + weekly)
- History tab with recent queries

### Step 6: PM Workbench Frontend — ObservabilityDashboard ✅ COMPLETE
- Budget view (session, weekly, per-agent, circuit breaker)
- Runs view (recent runs, summary stats)
- Gates view (decision gate activity, gate rate)
- Refresh button, auto-refresh on data change

### Step 7: App.tsx Integration ✅ COMPLETE
- Added `PmTab` type (`think` | `observe`)
- Added PM Workbench tab + Observability tab to tab bar
- Imported and rendered `ThinkSurface` and `ObservabilityDashboard`
- Updated branding from PolySync to PolyVerses throughout

### Steps 8-12: Future Phases (Not Yet Started)

- **Step 8:** Capture & Index layer — ingestion pipeline for PM notes, meeting transcripts, product docs
- **Step 9:** Retrieve & Assemble layer — context retrieval from indexed knowledge
- **Step 10:** Reason & Act layer — multi-agent collaboration loops
- **Step 11:** Human gate workflow — review/approve/reject gated decisions
- **Step 12:** Distillation scheduler — scheduled batch distillation into principles (Level 4 summaries)

---

## 12. File Inventory (PM Workbench)

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| `src/agents/index.ts` | 716 | 46.9KB | 12 agent definitions with system prompts |
| `server.ts` (PM layer) | ~560 | ~24KB | Orchestrator, budget, observability, 4 endpoints |
| `src/components/ThinkSurface.tsx` | 477 | ~17KB | PM query interface |
| `src/components/ObservabilityDashboard.tsx` | 403 | ~14KB | Governance dashboard |
| `src/components/AgentNetworkDiagram.tsx` | 773 | ~32KB | D3 agent topology visualization |
| `src/components/OrchestrationConsole.tsx` | 1942 | ~81KB | Orchestration control panel |
| `src/components/PromptConsole.tsx` | 702 | ~26KB | Prompt editing interface |
| `src/App.tsx` (PM additions) | +5 lines | — | PM tabs + component imports |
| `docs/PRD.md` | 711 | 63KB | Product requirements (PolyVerses PM workbench) |
| `docs/06-second-brain-architecture.md` | 2397 | 127KB | Full architecture reference (this document) |

---

## 13. Relationship to PolySync (Fitness Coach)

**PolyVerses** (this repository's primary product) is the **AI Product Management Workbench**.

**PolySync** is a **separate AI Fitness Coach product** that happens to share the same GitHub repository (`OssamaMokhtar/PolyVerses`) for historical reasons. The fitness layer in `server.ts` (the `/api/fitness/*` endpoints, `FitnessProfile` types, `FitnessOnboarding` component, etc.) is **retained for reference** but is **not part of PolyVerses PM workbench scope**.

The two products are architecturally separate:
- **PolyVerses:** PM agent mesh (F00-F11), `/api/orchestrate`, `/api/observability`, `/api/agents`, `/api/route`, ThinkSurface, ObservabilityDashboard
- **PolySync:** Fitness agent mesh (different F00-F11 semantics), `/api/fitness/*` endpoints (16 endpoints), FitnessOnboarding, workout logging, recovery analysis, coaching chat

This architecture reference document covers **PolyVerses only**. For PolySync architecture, see `docs/ARCHITECTURE.md` (the fitness architecture document).

---

*End of PolyVerses Architecture Reference*
