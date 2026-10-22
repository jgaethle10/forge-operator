# Raven Nexus legacy credential custody courier (staging, NOT deployed)

Status: **source-only experimental cryptographic component**. No real credential has been retrieved, transferred, opened or authenticated.

This is a two-party **owner-authorized migration** for the legacy Raven Nexus app. It does **not** add a Base44 HTTP endpoint, read a vendor secret store, expose a public credential export function, or grant agents permission to see raw credentials.

## Team execution gates

1. **Raven security:** Prove that the existing trusted legacy backend can read required configured values **in its server-side runtime**, without ever returning them to a browser, agent, log or GitHub. Require an authenticated founder/admin grant and a verified source-side operation. If backend inspection is unavailable, stop and record a blocker; do not bypass the platform.
2. **Forge / Systemia:** Start a private, in-memory receiver session with `createPrivateReceiverSession()`, retaining its private key inside the receiving process. Bind the exported public challenge to a founder-approved, authenticated migration case through Identity/Passport and a one-time case reference. Reject unapproved source origins, providers, and replays. The one-time in-memory session is lost on restart by design.
3. **Legacy backend, only after approval:** With allowed secret values read inside the authorized function, invoke `sealCustodyForReceiver(challenge, fields)` and deliver **only the ciphertext** through an approved authenticated private transport. The sealed envelope has a five-minute maximum validity. Do not publish it to a public URL, commit to Git, paste into a chat, or retain source-side plaintext. Validate target public key fingerprint out of band. Existing code in this repo does not grant source-side permissions.
4. **Owned receiver:** Open once using `session.consume(envelope)`. Keep the returned values inside the receiving process and immediately map to encrypted owned-vault envelopes. Numerai's legacy `NUMERAI_API_KEY` may have a different shape than the new public-ID + secret-key pair; **do not guess or split its contents blindly**. Kaggle token and Twilio/Lulu credentials also require independent, provider-specific validation.
5. **Independent provider evidence:** Perform minimum read-only authentication using actual provider APIs. Check correct account/permissions/expiry and record sanitized provider receipts. Never mistake source secret presence, successful encryption, or `ok:true` from a held suite for verified access.
6. **Cutover only after successful destination receipts:** Bind least privilege to the approved Evercraft runtime. Preserve original secret custody and service operation until independently verified. Never grant Numerai staking, purchases, outgoing Twilio messaging, publishing, or other side effects in a credential migration.

## Security scope

The library's cryptographic primitive provides RSA-OAEP SHA-256 wrapped AES-256-GCM with a fresh per-envelope key, context binding, bounded expiry and a single-use in-memory receiver. **It does not provide identity authentication, transport authorization, source secret access, trusted public-key distribution, persistent anti-replay, safe logging, or destination deployment.** A production flow MUST implement these before use. Staging tests use only synthetic values.

## User-visible statuses

- `legacy_secret_configured`: the vendor UI shows a masked secret (not provider verification).
- `legacy_backend_use_verified`: an authorized backend operation proved a provider read-only result.
- `owned_vault_sealed`: private receiver sealed the envelope and emitted a metadata-only vault receipt.
- `provider_authenticated`: actual provider authentication succeeded on the owned runtime.
- `cutover_approved`: approved worker has independent verification and human release authorization.
- Otherwise remain `held`, not green.

Tracking: #1462, Numerai #1451. No production cutover or key import is claimed.

## Read-only vault safety (updated 2026-10-22)

The existing `ProviderCredentialVault` constructor historically created a new encryption key and adjusted custody directory permissions whenever a vault path was provided. A provider "read-only" probe must not do either. The staged patch adds an opt-in `readOnly: true` constructor mode; it requires an already-existing legitimate vault key, rejects `put()`, and performs no directory creation or chmod. Raven's Numerai/Kaggle provider secret boundary uses this mode.

The courier now rejects oversized individual fields and encrypted envelopes before decrypting. It clears transient byte buffers where JavaScript permits, while explicitly **not** claiming zeroization of immutable JS strings. Synthetic regression tests check ciphertext tampering, replay, expiry, field allowlisting, oversized values, empty-path nonmutation, and read-only vault write denial.

These safeguards **do not** authorize the legacy source operation or make a credential transfer live. Until source-side founder authorization, receiving runtime isolation, and independently verified provider receipts exist, this remains a **draft, non-production** capability.
