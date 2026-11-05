# Evercraft Partners | Systemia owned-intake release gate
Date: 2026-10-29
Scope: founding applications ONLY, no reseller contract, payments, commission, partner portal, automation of outbound communications, or agency authority.

## Truth contract
The public Pages landing is already HTTPS verified; its original mailto path was usable but not durable. This release adds a first-party Fabric inquiry intake. The page tests `GET https://fabric.systemiacommandcenters.com/api/partners/readiness` before enabling direct POST and falls back to an applicant-controlled email if it is not ready. An email draft does not equal receipt. A `201` or idempotent `200` plus `EVP-...` means encrypted application successfully stored, NOT an approved partner. A private Relay inbox acknowledgment means notification accepted, not opened or answered.

## Owned production requirements
Mount a persistent encrypted-volume directory, writable by the Fabric runtime operator and mode `0700`. Pre-create private `alert-outbox/` directory mode `0700`. Configure in private **host service** environment, NEVER in GitHub, Pages, public JS, stdout, CI production logs or chat:

```
EVERCRAFT_PARTNERS_LEADS_DIR=<absolute-private-persistent-folder>
EVERCRAFT_PARTNERS_INTAKE_KEY_B64=<32 random bytes encoded as base64>
EVERCRAFT_PARTNERS_OWNER_PRINCIPAL=<authorized Relay owner>
EVERCRAFT_NOTIFICATION_BASE_URL=<owned Notification Fabric HTTPS endpoint>
EVERCRAFT_NOTIFICATION_INGEST_TOKEN=<private machine ingest token>
```

Generate/rotate the encryption secret through existing Evercraft sovereign credential management; plan key custody, backup, retention and recovery BEFORE real applicant PII. Never rotate with existing encrypted records unless all previous ciphertext remains decryptable. Separate Partners volume and key from FindMyPart/Studio. Cloud Pages hosting alone cannot supply private encryption or submit an application; owned Fabric must be independently deployed, reachable, and configured. The source branch or main-branch release is not runtime deployment proof.

## Acceptance checklist
1. Build SHA passes `node --test tests/evercraft-partners-launch.test.mjs tests/evercraft-partners-end-to-end.test.mjs` and FindMyPart regression, plus the Saban browser gauntlet.
2. Deploy EXACT tested Fabric runtime on Evercraft-owned hardware using Systemia/Yard deployment receipt and verified service version. Ensure required host service environment and private directory; keep secrets out of GitHub.
3. External canary `GET /api/partners/readiness` with Origin `https://jgaethle10.github.io` must return `schema=evercraft.partners.intake-readiness.v1` and `intake_available=true`. A static file response, 404, 503, or missing CORS is **BLOCKED**.
4. External authenticated-by-allowlisted-Origin *synthetic* POST to `/api/partners/inquiry` using a never-used `example.test` address and a fresh UUID must return `201`, true received, `EVP-...`. This is a test receipt only, not a buyer/partner.
5. Verify operator can decrypt the exact application with `node scripts/partners-owner-inbox.mjs show EVP-REFERENCE --show-pii`, with no PII in stdout/public test logs or Relay alert. Test repeat of same UUID returns same reference without creating another record.
6. Verify private Relay `alert-receipts/EVP-....json` when configured. Missing Relay acceptance leaves a private pending queue. No claim the owner was notified on a pending state.
7. Verify actual iPhone Safari/mobile and desktop from the public Pages page: consent, valid and invalid input, button state, reference, retry/offline fallback. Static screenshots in CI do NOT substitute for a deployed owned backend.
8. Confirm backups, cleanup/deletion process, appropriate retention/privacy notice, WAF/edge anti-abuse beyond the in-process guard, monitoring and incident response before any paid traffic.
9. Only after 1-8 pass: authorized organic partner outreach with real provider-post receipts and measured opt-in applications. Separate future commissions and payouts until terms and attribution approvals.

## Saban stress matrix
- Correct form, correct region/audience, consent yes/no, invalid email and website URL, missing fields
- Spambot honeypot and oversized body
- Cross-site origin and absent/null Origin
- Duplicate clicks, retry after timeout, same application UUID returning same ref
- Independent concurrent applications, per-email and global rate control
- Ciphertext integrity and decryption refusal for wrong key/reference
- Power loss after private record but before outbox, alert replay and idempotent Relay ack
- Relay provider error without silently deleting pending notification
- Live visitor route for responsive 375/390/1440px layouts, mobile overflow, screenshot/console checks
- Fail closed if host not deployed, key unavailable, storage permission unsafe, upstream timeout, public link mismatch
- No email, purchase, payout, contract or social POST initiated by tests

## Distribution separations
Personal Pages optional one-time only. EPS's separate referral program remains distinct. Havenly and R&B Chicken excluded; RIVET/AliEV/EV legal hold preserved. Existing eligible Facebook, Instagram and LinkedIn identities must be individually checked for provider permissions and publication receipts before any planned rollout. Avoid blasts across irrelevant owned Pages. Clip is the canonical publisher.
