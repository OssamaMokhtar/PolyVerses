# Firestore security rules tests

**Status: not written.** This folder holds the test plan only. Earlier reviews counted it as a test suite; it is not one.

`firestore.rules` is default-deny with ownership, email-verification, schema and immutability checks (see `../../security_spec.md`). The tests that would prove it need the Firebase emulator (`@firebase/rules-unit-testing`) and are the next item for this repo.

Planned cases:

- A user cannot read or write another user's documents
- Writes require a verified email
- Create operations validate the schema
- Immutable fields (owner, createdAt) cannot be updated
- Unauthenticated access is denied everywhere
