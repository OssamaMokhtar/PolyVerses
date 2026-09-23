# PolyVerses — Data model and access control

> Status: AUTHORED · Updated 2026-09-23 · Owner: Ossama Mokhtar

| Path | Holds | Who can access |
|---|---|---|
| `users/{userId}` | Profile and product configuration from onboarding | The owner only, with a verified email |
| `users/{userId}/documents/{docId}` | Generated deliverables (PRDs): id, userId, title, prompt, agentType, content, createdAt | The owner only; schema-validated; server timestamps |
| Everything else | — | Denied (default-deny `match /{document=**}`) |

## Invariants (from [security_spec.md](../security_spec.md))

1. No user can read or write another user's profile or documents.
2. Every stored document has a valid id, matches the owner's `userId`, and has non-empty content.
3. Timestamps come from `request.time`, not the client.
4. Only verified-email users can read or write.

The spec lists 12 attack payloads (the "Dirty Dozen"), such as privilege escalation, profile hijack, unverified email and ghost-field bloat, each with the expected `PERMISSION_DENIED`. **They are not yet automated as tests** (GAPS #2).
