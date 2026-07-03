# Firestore Security Specification

This document details the security specification for the PolyVerses workspace collections. It serves as a comprehensive guide for Attribute-Based Access Control (ABAC) and Zero-Trust validation.

## 1. Data Invariants

1. **User Ownership Boundaries**: No user can read or write any other user's profile (`/users/{userId}`) or nested documents (`/users/{userId}/documents/{docId}`).
2. **Strict Document Schema**: Any document stored must have a valid `id`, match the owning `userId`, have a non-empty `content`, and belong to a valid agent schema structure.
3. **Timestamp Integrity**: All timestamp values (e.g. `createdAt`, `updatedAt`) must rely on real server-generated timestamps (`request.time`) instead of raw, spoofable client payloads.
4. **Verified Users Only**: Read and write access is strictly limited to authenticated users whose emails have been fully verified (`request.auth.token.email_verified == true`).

---

## 2. The "Dirty Dozen" Payloads

Here are 12 malicious payloads designed to test the resilience of our security rules:

### Collection: `users/{userId}`

1. **Self-Elevated Privilege Hack**
   * *Target*: `/users/attackerId`
   * *Attack*: Set `role` or high privileges to bypass onboarding limitations.
   * *Payload*: `{ "uid": "attackerId", "email": "attacker@gmail.com", "productConfig": { "role": "Owner", "isAdmin": true } }`
   * *Expected*: `PERMISSION_DENIED`

2. **Foreign Profile Hijack**
   * *Target*: `/users/victimId`
   * *Attack*: Attacker attempts to overwrite a target user's configuration.
   * *Payload*: `{ "uid": "victimId", "email": "victim@gmail.com", "productConfig": { "productName": "Hijacked Project" } }`
   * *Expected*: `PERMISSION_DENIED`

3. **Email Spoofing (Unverified Email)**
   * *Target*: `/users/victimId`
   * *Attack*: Attacker attempts to register with unverified token email.
   * *Payload*: `{ "uid": "victimId", "email": "victim@gmail.com" }` (with `request.auth.token.email_verified == false`)
   * *Expected*: `PERMISSION_DENIED`

4. **Shadow Value Poisoning**
   * *Target*: `/users/attackerId`
   * *Attack*: Injecting massive arbitrary ghost fields into the profile to bloat the database (Denial of Wallet).
   * *Payload*: `{ "uid": "attackerId", "email": "attacker@gmail.com", "ghostField": "A".repeat(10000) }`
   * *Expected*: `PERMISSION_DENIED` (fails strict key sizing)

5. **Client-Spoofed Creation Time**
   * *Target*: `/users/attackerId`
   * *Attack*: Providing a stale historical timestamp for user creation.
   * *Payload*: `{ "uid": "attackerId", "email": "attacker@gmail.com", "createdAt": "2000-01-01T00:00:00Z" }`
   * *Expected*: `PERMISSION_DENIED`

### Collection: `users/{userId}/documents/{docId}`

6. **Cross-User Content Theft**
   * *Target*: `/users/victimId/documents/doc123`
   * *Attack*: Authenticated attacker attempts to read a victim's generated PRD document.
   * *Expected*: `PERMISSION_DENIED`

7. **Orphaned Document Invariant Break**
   * *Target*: `/users/attackerId/documents/doc123`
   * *Attack*: Attempting to save a document that claims to belong to `victimId`.
   * *Payload*: `{ "id": "doc123", "userId": "victimId", "title": "Evil Spec", "content": "Poison content" }`
   * *Expected*: `PERMISSION_DENIED`

8. **Missing Mandatory Fields**
   * *Target*: `/users/attackerId/documents/doc123`
   * *Attack*: Saving a document with missing `content` or `id`.
   * *Payload*: `{ "userId": "attackerId", "title": "PRD Draft" }`
   * *Expected*: `PERMISSION_DENIED`

9. **Terminal State Tampering**
   * *Target*: `/users/attackerId/documents/doc123`
   * *Attack*: Updating an immutable document's `createdAt` value.
   * *Payload*: `{ "id": "doc123", "userId": "attackerId", "title": "PRD", "content": "Content", "createdAt": "2000-01-01T00:00:00Z" }`
   * *Expected*: `PERMISSION_DENIED`

10. **Resource Poisoning (1MB String ID)**
    * *Target*: `/users/attackerId/documents/PoisonID_` (followed by 50,000 characters)
    * *Attack*: Forcing index allocation failure through incredibly long path IDs.
    * *Expected*: `PERMISSION_DENIED` (ID length fails `isValidId` gate)

11. **Anonymously Authored Spam Write**
    * *Target*: `/users/anonymousUser/documents/doc123`
    * *Attack*: Unauthenticated or anonymous session attempt to inject SRE logs.
    * *Expected*: `PERMISSION_DENIED`

12. **SLA Spec Value Spoofing**
    * *Target*: `/users/attackerId/documents/doc123`
    * *Attack*: Attempting to push a non-string list structure into a single text document field.
    * *Payload*: `{ "id": "doc123", "userId": "attackerId", "content": ["not", "a", "string"] }`
    * *Expected*: `PERMISSION_DENIED`

---

## 3. Test Runner Specification (`firestore.rules.test.ts`)

A simulated test harness is designed to execute against the aforementioned conditions:

```typescript
// firestore.rules.test.ts - Conceptual verification
describe("PolyVerses Rules - Fortress Verification", () => {
  it("rejects non-owner reads on user profile", async () => {
    // Assert victim profile is protected
  });

  it("verifies validation helpers run on create and update", async () => {
    // Assert schema matching and size restrictions
  });

  it("ensures unverified user email sessions are blocked", async () => {
    // Assert email_verified == true flag is enforced
  });
});
```
