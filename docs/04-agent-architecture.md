# PolyVerses — Agent architecture

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

**Five agent modes run today, each a system prompt on one Gemini route.** The larger roster in the UI is the target design. Keeping that distinction visible is the point of this doc.

| Mode | Job | Output |
|---|---|---|
| Router (default) | Frames the request and explains how work would be split | ≤ 300 words |
| Opportunity | RICE scorecard for the idea | Markdown table + 2 recommendations |
| Compliance | GDPR / CCPA / PII review | Strengths, warnings, remediations |
| PRD | Structured PRD | Goals, audiences, metrics, requirements, SLAs |
| Rollback | Release-risk narrative | **Simulated** telemetry by design of the prompt; no real deployment is read |

## The staged workflow

The console walks a request through stages (opportunity → compliance → **human gate** → PRD → rollback check). At each gate the PM can approve, modify, rerun or pause, with an undo window. The approved PRD is saved to Firestore.

## Relationship to Product Leadership OS

PLOS holds 189 specialist skills as `SKILL.md` files. The plan is for PolyVerses to load a PLOS skill as the system prompt for a mode, so adding a skill adds an agent without new code. **That loader is not built yet** (GAPS #1); today the 5 prompts live in `server.ts`.

## Traceability

The design goal is that every output shows which agent ran, on what input, and why. Today the console log records the stage and agent for each step; model inputs and outputs are not yet stored as traces (GAPS #4).
