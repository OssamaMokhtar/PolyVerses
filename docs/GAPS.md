# PolyVerses — Gaps

| # | Gap | Doc | Damage if unfilled | Effort | Status |
|---|---|---|---|---|---|
| 1 | PLOS skills are not yet loadable as agent prompts | 04 | High: the runtime story isn't real until this exists | Medium | Open |
| 2 | Firestore rules untested (Dirty Dozen not automated) | 02, 07 | High | Medium | Open |
| 3 | `/api/evaluate` is anonymous | 03, 08 | Medium: cost abuse | Low | **Partly fixed 23 Sep 2026:** per-caller rate limit (20/min), 64 KB body cap, input validation, tested. Still open: Firebase ID-token check and a global daily budget |
| 4 | No stored traces of agent inputs and outputs | 04 | Medium: the traceability claim is partial | Medium | Open |
| 5 | Agent output quality unevaluated | 07 | Medium | Medium | Open |
| 6 | `OrchestrationConsole.tsx` is ~2,000 lines | 01 | Low | Medium | Open |
| 7 | User text is interpolated into prompts without delimiting | 08 | Medium: prompt injection can redirect an agent mode | Low | Open |
| 8 | Rate limit is per instance, in memory | 08 | Low at current scale | Medium | Open |
