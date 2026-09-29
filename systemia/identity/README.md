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
