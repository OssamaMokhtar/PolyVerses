# PolyVerses — Decision log

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

## ADR-001 — One product per problem: PolyVerses is the PLOS runtime

**Decision:** return PolyVerses to the PM workbench; move the fitness code (11–22 Sep 2026) to PolySync; remove the 184-file skill copy and treat Product Leadership OS as the single source.
**Rejected:** keeping PolyVerses as a fitness platform with a PM name, or as a second PM tool beside PLOS.
**Why:** three overlapping products read as unallocated effort; a visible merge is a decision a reviewer can follow.
**Reversal trigger:** evidence that PMs want the workbench without the skill library, or the reverse.

## ADR-002 — Sandbox output must be labelled

**Decision:** when no model is configured, the console says the output is template text.
**Rejected:** "high-fidelity simulated outputs so the app remains pristine" (the original comment).
**Reversal trigger:** none.

## ADR-003 — Simulated surfaces are labelled as simulated

**Decision:** the observability metrics and the reference code browser carry visible labels.
**Why:** a demo that looks like live telemetry invites a question the product can't answer.
**Reversal trigger:** real telemetry from real runs replaces the simulation.

## ADR-004 — Gemini key server-side only, checked in CI

**Decision:** the client calls `/api/evaluate`; CI fails if the bundle references the Gemini API.
**Reversal trigger:** none.
