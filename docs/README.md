# PolyVerses — Architecture docs

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

PolyVerses is the runtime for [Product Leadership OS](https://github.com/OssamaMokhtar/product-leadership-os). These docs describe the code on `main` after the 23 Sep 2026 consolidation. The fitness-era docs moved with that code to [PolySync](https://github.com/OssamaMokhtar/PolySync/tree/main/app/docs).

| # | Doc | What it answers |
|---|---|---|
| 00 | [Status](00-status.md) | What is real, what is simulated, what is design |
| 01 | [System architecture](01-system-architecture.md) | Components and request flow |
| 02 | [Data model and access control](02-data-model.md) | Firestore collections, rules, the "Dirty Dozen" |
| 03 | [API](03-api.md) | The one server route |
| 04 | [Agent architecture](04-agent-architecture.md) | The 5 agent modes, the staged workflow, human gates |
| 07 | [Evaluation](07-evaluation.md) | What is tested and what is not |
| 08 | [Security](08-security.md) | Trust boundaries, controls with their evidence, open risks |
| 10 | [Decision log](10-decision-log.md) | ADRs with reversal triggers |
| — | [Multi-tenancy](multi-tenancy.md) | Design for teams (not built) |
| — | [Gaps](GAPS.md) | Ranked open issues |
| — | [Security spec](../security_spec.md) · [Firestore rules](../firestore.rules) | Access-control model |
