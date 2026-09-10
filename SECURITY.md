# Security

**Status:** Prototype — not production hardened.

## Architecture Security Model

Firestore security rules (documented in [security_spec.md](docs/security_spec.md)):
- Default-deny catch-all
- Venue/ownership checks on every path
- Email verification required for writes
- Schema validation on create
- Update rules restricted to a whitelist of mutable fields

The Gemini API key is held server-side only. The key is never exposed to the browser.

## Data Classification

| Data Type | Classification | Notes |
|-----------|---------------|-------|
| Agent run traces | Internal | Orchestration history, intermediate output |
| Prompt iterations | Internal | Prompt console history |
| User profiles | Sensitive | Product team accounts |
| Usage analytics / heatmaps | Internal | Aggregated, de-identified where possible |

## Known Security Gaps

| Gap | Severity | Roadmap |
|-----|----------|---------|
| Firestore rules not tested with emulator | Medium | Add rules tests |
| No penetration test | High | Pre-production |
| No dependency vulnerability scanning | Medium | CI (this PR) |
| Production hardening (encryption at rest, full RBAC, SSO) | High | Pre-production |
| Multi-tenant isolation not tested at scale | High | Pre-production |

## Reporting a Vulnerability

Contact the maintainer directly. Do not open a public issue for security vulnerabilities.

---

*See [Improvement Plan — PolyVerses](../../Obsidian/Portfolio-Due-Diligence/05-Improvement-Plan-PolyVerses.md) for the full security hardening roadmap.*
