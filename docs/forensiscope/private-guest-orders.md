# ForensiScope private guest order ledger

Release state: **private, single-node staging only**. This is an identity/order
component, not a deployed public checkout, a live payment receipt, or an
operational customer account-recovery service.

ForensiScope can now issue a **one-time private buyer access token** and
create a price-correct order bound to that authenticated guest, without
human correspondence or sending the video by email.

## Components

- systemia/forensiscope/guest-order-ledger.mjs
- systemia/forensiscope/customer-runtime.mjs (optional guest ledger routes)
- tests/forensiscope-guest-order-ledger.test.mjs

The new API routes are only mounted when a trusted guest ledger is
supplied to the private loopback customer runtime.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /v1/forensiscope/guest/challenge | Send owner-controlled one-time email verification code after privacy consent and anti-abuse approval |
| POST | /v1/forensiscope/guest | Issue a secure guest session only after a matching, unexpired, single-use email verification code |
| GET | /v1/forensiscope/guest | Check session, no access token or private email echoed |
| DELETE | /v1/forensiscope/guest | Revoke session, does not silently delete order/media data |
| POST | /v1/forensiscope/orders | Create a buyer-owned exact-tier quote/order without taking money |
| GET | /v1/forensiscope/orders/:key | Read just this buyer's quote and checkout status |

A client provides a valid email address for a *future* payment receipt
and confirms privacy handling. Entering an email address does not mean
the customer has to contact Evercraft or email media.

Enrollment defaults to **OFF**. An approved deployment must explicitly
set guestEnrollmentEnabled=true and supply checkEnrollment(req), a
trusted anti-abuse and rate-limit check. Do not enable this public route
until TLS, abuse controls, and identity-recovery design are verified.

## Privacy and authority

- Require verified control of the customer's email before issuing any buyer
  bearer token. A valid address and generic anti-abuse check alone are
  no longer sufficient. The challenge uses an eight-digit cryptographic
  code, a 10-minute expiry, a five-attempt cap and replay prevention.
  The code is delivered only through the owner-supplied sendCode callback,
  never included in browser response, logs or persisted plaintext.
  Email-specific cooldowns supplement, but do not replace, deployment
  rate limits, quotas and email-delivery health checks.
- Generate a 256-bit random bearer token. Persist only its SHA-256
  digest. Show the token to the buyer exactly once.
- Private session files contain the email address and are chmod 0600;
  owner-only directories are 0700. No file names or raw customer media
  are collected in the ledger.
- Sessions expire after 7 days by default. Revocation blocks subsequent
  API access immediately. Token loss currently cannot be recovered from
  email alone: an authenticated recovery flow is a release blocker.
- Token cannot be provided via a URL query string, payment redirect,
  client-supplied buyer ID or unauthenticated email.
- The server chooses the canonical duration-based offer and amount,
  checks media rights, maximum file size, and actual readiness from a
  trusted readCapacity callback. The client cannot choose a cheaper
  offer with a fake offer_key or amount_cents.
- Orders use unguessable 128-bit identifiers and stay private to their
  buyer. Cross-buyer order lookups return 404.
- persistCheckout is **unpaid-only** and idempotent; it persists the
  owned capacity reservation and SHA-256 of the handoff URL, not the
  checkout secret URL itself. No browser redirect grants entitlement.
- The existing upload and result services must independently read the
  authoritative Evercraft Payments settlement status before media
  ingest and result release, respectively.

This store is designed for a single local owner-controlled process.
It does not claim multi-process transactional locking, cross-node
replication, account recovery, public abuse protection, refund logic
or general-purpose identity-provider capability.

## Remaining launch blockers

1. Approved customer recovery and abuse/rate-limit protections.
2. Owned deployed HTTPS reverse proxy and authenticated buyer sessions.
3. Durable reservation handling through Evercraft Meter and payment
   reconciliation from the existing Evercraft Payments/Raven Nexus.
4. A verified live ForensiScope-specific checkout, including external
   provider settlement readback. The previously observed payment
   HTTP 402 hold must not be bypassed.
5. Large-media capacity, codec/malware screening, worker supervision,
   customer retention/deletion and true device-to-result proof.

Run local synthetic tests with:

node --test tests/forensiscope-guest-order-ledger.test.mjs

No Stripe charge, payment or live customer account is created by these
tests. The public ForensiScope inquiry page is unchanged.


## Verified email implementation (November 9)

The private guest-order ledger requires an enabled emailVerification
service before enabling guest signup. The private runtime also routes
POST /v1/forensiscope/guest/challenge. A buyer sends an approved email
address and privacy acceptance, receives the code through a separately
configured owned sender, then exchanges the challenge id and eight-digit
code for the one-time private session credential.

The email HMAC secret and transactional mail relay must be configured
server-side. This code does NOT configure any outbound email sender or
live public identity service. Losing a guest token still requires a
future verified recovery design; do not enable production enrollment
without it.

Tests:
node --test tests/forensiscope-email-verification.test.mjs
