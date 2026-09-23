# PolyVerses — API

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/evaluate` | POST | `prompt`, `priority`, `role`, `agentType` (`opportunity` · `compliance` · `prd` · `rollback` · default router), `userContext` | `{ text, sandbox }`: `sandbox: true` means template text, no model call |
| `*` | GET | — | The built SPA (production) |

There is no rate limit on `/api/evaluate` yet (GAPS #3).
