# Firestore Security Rules Tests — PolyVerses

**Status:** Structure defined — test cases to be written.

## Purpose

Test that the Firestore security rules correctly enforce:

- Default-deny (no access without explicit rule)
- Tenant isolation (user can only access their tenant's data)
- Ownership checks (user can only modify their own data, unless they have admin role)
- Email verification (writes require verified email)
- Schema validation (create operations validate schema)
- Field immutability (sensitive fields cannot be updated)

## Test Structure

### Test Cases

#### Tenant Isolation

- [ ] User from Tenant A tries to read Tenant B's agents → denied
- [ ] User from Tenant A tries to write Tenant B's workflows → denied
- [ ] User from Tenant A tries to read Tenant B's prompts → denied
- [ ] User from Tenant A tries to read Tenant B's run traces → denied

#### Ownership Checks

- [ ] User tries to modify another user's profile → denied
- [ ] User tries to delete another user's agent → denied (unless admin)
- [ ] User tries to modify a workflow they don't own → denied (unless admin)

#### Email Verification

- [ ] Unverified user tries to create an agent → denied
- [ ] Unverified user tries to create a workflow → denied
- [ ] Verified user creates an agent → allowed

#### Schema Validation

- [ ] Create agent with missing required fields → denied
- [ ] Create agent with invalid field types → denied
- [ ] Create agent with valid fields → allowed

#### Field Immutability

- [ ] User tries to update a sensitive field (e.g., agent's created-by field) → denied
- [ ] User updates a mutable field (e.g., agent's description) → allowed

#### Default Deny

- [ ] User tries to access a path with no explicit rule → denied

## Test Execution

```bash
# Using Firestore emulator
npm run test:firestore   # Run Firestore rules tests
npm run test:firestore -- --watch  # Watch mode

# Using security rules test framework (e.g., firebase-rules-unit-testing)
npx firebase-rules-unit-testing --config firestore.rules --tests tests/firestore-rules/
```

## CI Integration

Firestore rules tests run in CI on every push and pull request.

## Relationship to Improvement Plan

These tests are Phase 2 of the PolyVerses improvement plan. See [[05-Improvement-Plan-PolyVerses]].
