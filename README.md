# PolyVerses — Agentic Product Management Workbench

> A multi-agent workbench for product leaders: orchestrate specialist AI agents, watch them work, and inspect what they actually did.

`TypeScript` · `React` · `Vite` · `Firebase` · `Gemini`

---

## What it is

Most "AI for PM" tools are a chat box with a product-manager system prompt. PolyVerses is the opposite bet: a **network of specialist agents** with an orchestration layer, an observability dashboard, and a prompt console — so the interesting question isn't *what did the model say*, it's *which agent ran, on what input, and why*.

## Core surfaces

| Component | What it does |
|---|---|
| **Orchestration Console** | Compose and run multi-agent workflows |
| **Agent Network Diagram** | Visualise how agents hand off to each other |
| **Observability Dashboard** | Trace runs, inspect intermediate output |
| **Prompt Console** | Iterate on agent prompts against live state |
| **Heatmaps** (D3 / Recharts) | Usage and performance density views |

## Architecture

The Gemini key is held **server-side** (`server.ts`) and the client calls the app's own endpoints — the key is never shipped to the browser.

Firestore access is governed by [`firestore.rules`](firestore.rules): default-deny, ownership checks, email verification, per-field validation, and immutability constraints on sensitive fields. See [`security_spec.md`](security_spec.md) for the model.

## Run locally

**Prerequisites:** Node.js 18+

```bash
npm install
cp .env.example .env.local     # add your GEMINI_API_KEY
npm run dev
```

## Status

Working prototype — ~7,000 lines. The agent roster and orchestration logic are real; this has not been run as a hosted multi-tenant service.

**Known refactor:** `OrchestrationConsole.tsx` is ~2,000 lines and should be decomposed.

## License

MIT
