# Evercraft Identity

Evercraft Identity proves who a human is. It does not decide what that human may do.

Authorization stays in Evercraft Passport.

## Current identity slice

- opaque Evercraft subject references
- local owner bootstrap with explicit authority receipt
- salted scrypt password credentials
- no password, recovery secret, or signing key committed to Git
- short-lived HMAC-signed sessions compatible with Evercraft Home
- bounded login rate limiting
- one-time owner bootstrap protection
- receipt-backed identity events
- explicit Passport grant bootstrap for the Home scopes
- keyed session signatures with bounded key overlap during rotation
- per-session and subject-wide server-side revocation

This is a sovereign baseline, not the final authentication UX. Passkeys can be added later without changing subject references or Passport authority.

## Owner bootstrap safety

Bootstrap is intentionally local/offline. The password is read from a file whose permissions must exclude group/other access.

Example shape only:

```bash
chmod 600 /secure/path/owner-password
EVERCRAFT_IDENTITY_STATE_DIR=/var/lib/evercraft/identity \
EVERCRAFT_PASSPORT_STATE_DIR=/var/lib/evercraft/passport \
EVERCRAFT_OWNER_PASSWORD_FILE=/secure/path/owner-password \
EVERCRAFT_OWNER_BOOTSTRAP_AUTHORITY_RECEIPT=manual:<receipt> \
node systemia/identity/bootstrap-owner.mjs
```

Delete the password file after a successful bootstrap.

The bootstrap command does not belong in an unattended public deployment path.

## Separation of duties

Identity authenticates a subject and issues a short-lived signed session. Home verifies the signature, then asks Passport whether the subject has the requested scope. A valid session without a Passport grant is denied.

No external identity provider is required for this baseline.


## Session key rotation

Evercraft Home signs each new session with the current key and records its key ID in the signed payload.

Production configuration uses:

```bash
EVERCRAFT_IDENTITY_KEY_ID=home-2026-09
EVERCRAFT_IDENTITY_SECRET=<current secret>
EVERCRAFT_IDENTITY_PREVIOUS_KEYS_JSON='{"home-2026-08":"<previous secret>"}'
```

During rotation, keep the retiring key in `EVERCRAFT_IDENTITY_PREVIOUS_KEYS_JSON` while new sessions are issued with the new current key. After the overlap window, remove the retiring key. Any still-present session signed by that removed key fails closed with `session_signing_key_unknown`.

Signing keys are never written to Identity state or source control.

## Session revocation

Identity maintains a private session-control ledger.

- Normal Home logout revokes the current session ID server-side before clearing the cookie.
- `POST /api/sessions/revoke-all` advances a subject-wide not-before cutoff and clears the current cookie.
- The revoke-all operation requires the Passport scope `home.identity.sessions.manage`.
- A fresh login after the cutoff produces a new valid session.
- Revocation remains independent of Passport grants. Passport still owns authorization.

This means an old browser cookie, copied cookie, or retired device can be invalidated without changing the user's password or rebuilding Home.
