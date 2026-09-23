# PolyVerses — Evaluation

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

**Nothing evaluates agent output today.** CI checks that the app typechecks and builds, that the client bundle carries no Gemini client or key, and that no high or critical advisories exist.

| Question | Plan | Pass bar |
|---|---|---|
| Do PMs use the output? | 5 PMs × 3 workflows (PRD, RICE, compliance) | ≥ 50% of outputs used with light edits |
| Is the RICE maths right? | 30 cases with known inputs | Scores within rounding of a hand calculation |
| Does compliance review catch real issues? | 20 briefs seeded with known PII risks | ≥ 80% flagged |
| Do Firestore rules hold? | Emulator tests for the 12 Dirty Dozen payloads | 12/12 denied |
