# Security Specification: Forge Operator Firestore Security Rules

## Phase 0: Data Invariants & Security Boundaries

### Core Invariants:
1. **Zero Unauthenticated Access**: Unauthenticated requests are rejected on all collections.
2. **User Isolation (Zero-Trust Multi-Tenancy)**: All user data and saved diagnostic reports are strictly partitioned under `/users/{userId}`. A user with UID `X` can NEVER read, create, update, or delete records under `/users/{Y}`.
3. **No Impersonation**: During document creation and update, `uid` or `userId` must strictly match `request.auth.uid`.
4. **Id Sanitization**: Document path identifiers `{userId}` and `{reportId}` must conform to safe regex `^[a-zA-Z0-9_\-]+$` and size limits (<= 128 chars).
5. **No Shadow Fields**: Keys on creation must strictly match expected fields; updates must restrict affected keys to authorized editable fields.
6. **Immutable Fields**: `uid` / `userId` and `createdAt` cannot be modified after creation.
7. **Safe Limits**: String and payload sizes are capped to prevent Denial of Wallet.

---

## The "Dirty Dozen" Threat Vectors (Rejected Payloads)

1. **Payload 1 (Unauthenticated Read)**: `GET /users/user_abc` without auth token -> Result: `PERMISSION_DENIED`
2. **Payload 2 (Cross-User Profile Hijack)**: User `attacker_123` tries `GET /users/victim_456` -> Result: `PERMISSION_DENIED`
3. **Payload 3 (Cross-User Report Steal)**: User `attacker_123` tries `GET /users/victim_456/reports/rep_1` -> Result: `PERMISSION_DENIED`
4. **Payload 4 (Cross-User Report Injection)**: User `attacker_123` tries `CREATE /users/victim_456/reports/rep_1` with `userId: "victim_456"` -> Result: `PERMISSION_DENIED`
5. **Payload 5 (Owner Spoofing in Own Path)**: User `attacker_123` tries `CREATE /users/attacker_123/reports/rep_1` with `userId: "victim_456"` -> Result: `PERMISSION_DENIED`
6. **Payload 6 (Oversized ID Poisoning)**: User `attacker_123` creates doc with ID containing 2,000 characters -> Result: `PERMISSION_DENIED`
7. **Payload 7 (Path Injection / Regex Escape)**: User attempts document ID with `../` or special characters -> Result: `PERMISSION_DENIED`
8. **Payload 8 (Oversized Field Denial-of-Wallet)**: User attempts to write `businessProblem` of size > 500,000 characters -> Result: `PERMISSION_DENIED`
9. **Payload 9 (Shadow Admin Field Injection)**: User tries to write `{ uid: "...", isAdmin: true }` in profile -> Result: `PERMISSION_DENIED`
10. **Payload 10 (Immutable Field Modification)**: User attempts `UPDATE /users/u1/reports/r1` modifying `createdAt` or changing `userId` -> Result: `PERMISSION_DENIED`
11. **Payload 11 (Blanket Collection Scraping)**: User queries `/users` collection without user scoping -> Result: `PERMISSION_DENIED`
12. **Payload 12 (Blanket Subcollection Query)**: User queries collectionGroup `reports` across all users -> Result: `PERMISSION_DENIED`
