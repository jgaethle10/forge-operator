# Raven phone -> Systemia Demand Organism, phase 1

Mission: systemia-demand-organism-2026-10-07
Canonical draft PR: #1170; related commercialization issue #1159 and revenue-liveness issue #828.

## Verified source state, not verified provider delivery

Raven Nexus app 6a7adc9666bfd8c5c2fb4069 has existing voice handlers ravenVoiceInbound, ravenVoiceTurn, ravenVoiceStatus, and associated VoiceCall/CallerIdentity records. SMS function secretaryInbound and PhoneMessage are also present. The existing Raven communications bridge signs an exact payload using HMAC-SHA256 over timestamp, dot, raw JSON.

Source URLs point to Raven's Base44 origin. The inspection function references the assigned 509-area-code number. These references do not prove current Twilio provider/webhook health. The live record tables have one test-like voice record and zero SMS records; no actual provider delivery was established here.

Raven's current voice prompt and DispatchOrder are primarily EPS-specific. Its SMS function also routes EPS. The existing written signed bridge is not evidence that a live Systemia phone-to-sales handoff occurred.

## Proposed adapter, not a deployed webhook

New file: systemia/autonomy/raven-phone-demand.mjs

- verifyRavenPhoneBridge validates Raven's existing HMAC envelope before parsing; checks time, size, provenance, inbound-only Twilio channel/source, provider event reference, and idempotency key.
- planRavenPhoneDemand emits a private-data-minimized Systemia admission candidate. Recognizes EPS, Legacy Rescue, AliEV, Recovery, Network, and a partner-controlled RIVET hold, while handling ambiguous requests conservatively.
- Special handling: SMS STOP is compliance-only; sensitive requests require restricted human review; call_started without intent is not a qualified sales lead.
- Event and conversation IDs are HMAC-derived. Durable atomic deduplication must happen downstream, not claimed by the stateless classifier.
- Signed Raven bridge input is not independent proof of provider delivery, caller identity, consent, payment, or fulfillment.
- No calls, SMS, marketing, checkout, payment, or deployments are triggered by this module. Raw phone numbers, transcripts, and secrets must never enter public CI artifacts.

## Production acceptance gates

1. Authenticated read-only inspection of actual Twilio number status, inbound VoiceUrl/SmsUrl, callbacks, registration, and provider event logs.
2. Confirm Raven voice/SMS signing and private Systemia ingest with a verified synthetic signed event; independently test timestamp/replay and rejected signatures.
3. Stage Systemia's owned communications ingress with transactional event deduplication, least-privilege storage, source receipts and no raw-PII logging.
4. Generalize Raven conversation routing from EPS-only to authorized portfolio products. Do not change production phone handlers or disrupt EPS until tested in isolation.
5. Produce an acknowledged owner action through Signal Fabric and Relay with human escalation. Phone caller ID never verifies sensitive identity.
6. Follow approved outreach/callback permissions, AI voice disclosure and applicable SMS consent, opt-out, recording and registration rules.
7. Verify one real customer-initiated phone inquiry through qualified owner response. Separately establish buyer-confirmed checkout, provider-verified settlement and Shipping, never infer money from sent/delivered/closed states.
8. Migrate any legacy Base44 webhook transports only after owned endpoint E2E proof, staged cutover and rollback readiness.

Hard boundaries: no cold AI robocalls or unsolicited SMS, no new phone number purchases, no unapproved RIVET partner offers, no silent phone/webhook mutation, and no new CRM. Raven is the voice surface, Systemia governs decisions, Evercraft Payments governs paid-state truth.

## Added in the same draft: disabled-by-default owned route

Owned Fabric source now registers POST /api/communications/raven-inbound, using systemia/autonomy/raven-phone-ingress.mjs. If either EVERCRAFT_COMMUNICATIONS_BRIDGE_SECRET or EVERCRAFT_RAVEN_PHONE_STATE_DIR is absent, requests return 503. The handler requires the signed Raven request as application/json, validates HMAC and event contract, and writes an opaque review candidate to a mode-0700 private directory with a mode-0600 event file. The source's event identity is used as an exclusive-create filename; duplicate retries return duplicate rather than writing another record.

A 202 reply means only a durable **review candidate** was stored, not Systemia mission admission, owner acknowledgment, Twilio event verification, consent, publication, payment or delivery. Health advertises raven_phone_private_ingress_ready and configured_not_externally_verified separately. This is a single-writer/on-host proof, not a multi-node shared transactional queue. Do not enable a multi-replica route until durability/locking, retention/deletion, and private replay-state ownership are independently verified.

## October 7 continuation: replay and private-store hardening

- Provider replay identity now binds `source_system + provider_type + channel + provider_event_ref + event_type` using HMAC; changing Raven's local `source_record_ref` or `idempotency_key` does **not** create a second inbound event for the same provider SID and phase. Distinct phases for a voice call remain separately auditable. The private conversation identity stays bound to the provider call/message reference.
- The owned ingress now writes and fsyncs a mode-0600 temporary receipt, atomically hard-links it into the final provider-event slot without overwrite, and fsyncs the directory. An existing final file is accepted as a duplicate only after checking privacy permissions, JSON validity, schema and event identity. Invalid previous records return a durable-store failure, not a success receipt.
- Regression tests cover recreated local Raven records with one provider SID, separate voice phases, and corrupt/truncated receipt replay. These are synthetic code proofs, not production delivery.
- Existing Raven `secretaryInbound` still sends EPS-style AgentMessage and DispatchOrder records before any STOP-specific suppression handling, and `ravenVoiceTurn` remains EPS-oriented. Source-only detection is **not** production SMS opt-out enforcement or portfolio-wide voice routing. Do not modify live handlers until a staffed rollout includes STOP suppression, safe owner routing, authorized callback permissions and rollback.
- A Raven `ravenVoiceTwilioInspect` function exists for admin-gated, read-only provider inspection, but no authenticated provider response has been captured in this PR. Source code does not establish that the phone's configured URLs, inbound delivery, status callbacks, A2P eligibility or provider failures are healthy.
- The present handler remains review-candidate-only: no Systemia admission, owner assignment, Relay acknowledgment, provider-verified delivery, authorized return contact or settlement is proved.

**Release gate remains closed:** gather authenticated provider-side number/webhook and event evidence; validate one real customer-initiated voice/SMS call through Raven and the owned ingress; demonstrate safe opt-out, Passport/Interaction Ledger decisions, Systemia ownership and human acknowledgment; then propose a separately approved reversible cutover with rollback receipt.

No production environment settings, DNS, Base44 webhooks, Twilio URLs, secrets, or phone numbers were changed by this pull request.
