# PolyVerses — API

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/evaluate` | POST | `prompt`, `priority`, `role`, `agentType` (`opportunity` · `compliance` · `prd` · `rollback` · default router), `userContext` | `{ text, sandbox }`: `sandbox: true` means template text, no model call |
| `*` | GET | — | The built SPA (production) |

## Guards on `/api/evaluate` (`server/guard.ts`, tested in `server/guard.test.ts`)

| Guard | Value | On failure |
|---|---|---|
| Rate limit per caller IP (`trust proxy` on) | 20 requests/min, `EVALUATE_RATE_PER_MIN` to change | `429` with `Retry-After` |
| Body size | 64 KB | `413` |
| `prompt` | string, ≤ 4,000 chars | `400` |
| `priority`, `role` | string, ≤ 100 chars | `400` |
| `agentType` | one of `router`, `opportunity`, `compliance`, `prd`, `rollback` | `400` |
| `userContext` | ≤ 8,000 chars serialised | `400` |

Still missing: authentication on this route (GAPS #3). See [08 · Security](08-security.md).
