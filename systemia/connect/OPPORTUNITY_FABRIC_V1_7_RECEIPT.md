# Opportunity Fabric v1.7 | Private Recovery routing receipt

Date: 2026-10-07

## Verified source checkpoint

- Base44 app ID: `6ab85d74fe2093703c6247e0`
- Inventory name: `PrintConnect` (existing Opportunity Fabric implementation)
- Runtime source version: `evercraft-opportunity-fabric-runtime-v1.7.0`
- Builder checkpoint: `6ac6efae6bdd9956d7c65501`
- Checkpoint commit: `fc85bf24b5d0afa0709fe6d9073c35e2d364eb91`

The checkpoint was taken after source, authority contract, security smoke, and production build passed. Subsequent unrelated/concurrent source edits are **not automatically covered** by this receipt.

## Private routing source

New `ConnectCase` entity:
- owner-scoped read access and service-authority-only mutation
- external candidate reference and source/evidence state
- private problem, notes, and provenance
- public-safe summary and declared capability gaps
- optional do-not-contact / hold
- explicit consent state
- no public Project automatically created

`ConnectionProposal` now supports `Project` and `ConnectCase` sources with canonical source identifiers.

Trusted runtime actions:
- `upsert_connect_case`
- `archive_connect_case`
- `plan_connect_case_route`

UI:
- `ConnectionDesk.jsx` now contains the private case form, case list, route trigger, and archive action.
- Plans combine enrolled Fabric member capability metadata with owner-private ConnectNodes.
- Planning excludes held, archived, do-not-contact cases and relationship nodes.
- No private problem, protected contact information, private notes, or provenance are used as matching inputs.
- Unknown capabilities remain unfilled instead of being replaced with invented people.
- Matching creates private suggestions and receipts, not introductions or obligations.

## Verified checks

In the Base44 source sandbox:

```text
node tests/opportunity_fabric_authority_contract_test.mjs
OPPORTUNITY_FABRIC_AUTHORITY_CONTRACT_PASS

node scripts/opportunity-fabric-security-smoke.mjs
OPPORTUNITY_SECURITY_PASS
  trusted_runtime_version=v1.7.0
  protected_workflow_entities_runtime_write_only=15
  private_case_owner_private=true
  private_case_route_no_marketplace_publication=true
  private_case_hold_and_do_not_contact_guard=true
  private_problem_excluded_from_matching=true

npm run build
PASS
```

Only a nonblocking stale Browserslist/caniuse-lite warning appeared.

These are source/build/static-contract tests, **not** an independent live browser end-to-end proof.

## Remaining gates

1. Verify published deployment independently. Prior `base44 deploy` / production canary commands timed out; do not infer success.
2. Run authenticated owner and nonowner runtime access tests against the actual hosted backend, including do-not-contact and no-outreach behavior.
3. Confirm trusted introductions still require explicit owner consent and human action.
4. Preserve existing Opportunity Fabric runtime evidence until public deployment and auth tests are verified.
5. Main Forge PR #1126 is subject to global checks; a repeat FAIE MCP fixture failure was independently observed, not a Connect-core failure.

## Additional CI blocker receipt

Forge check was re-run and failed at:
`systemia/faie/mcp.test.mjs`:
"FAIE MCP investigation uses preview path and does not persist the caller question"
Expected `evidence_available`, got `insufficient_evidence`.

An independent diagnostic draft PR was opened to isolate this: #1161.

**No claim of completed production deployment, approved external relationship, outreach, contract, payment, or recovered business is made by this receipt.**

## Verification addendum: later checkpoint with positive-fit regression guard

A subsequent Base44 checkpoint was created after fixing zero-capability-fit candidate ranking in **both** Project and ConnectCase route planners and reducing the private-case route response. This checkpoint supersedes the earlier v1.7 source checkpoint above as the most recent independently checked state:

- Checkpoint: `6ac6f06e3422850b1688e4ac`
- Base44 git commit: `96554cc43bf6742e69f012761144ccc67d9e4a42`
- Source runtime version remains `evercraft-opportunity-fabric-runtime-v1.7.0`.

Changes: ranking now requires positive `matched_terms` overlap with capability evidence; relationship and geography bonuses cannot by themselves trigger suggestions. Private ConnectNode matching uses declared `node.capabilities`, not labels, organization, node type, or public-safe summary. The private route returns `route_state` rather than the full `case:updatedCase` record. `ConnectCase.problem_statement` now has explicit owner/admin field-level read RLS. The security-smoke suite now asserts these anti-false-match and no-private-case-return contracts.

**Reverified against this latest source:** `node tests/opportunity_fabric_authority_contract_test.mjs` PASS; `node scripts/opportunity-fabric-security-smoke.mjs` PASS; `npm run build` PASS (exit 0; stale Browserslist warning only). These remain sandbox/static authority and security checks, not authenticated live-user or production deployment proof.

**Public deployment remains UNVERIFIED; do not update the canonical deployed-runtime record on this basis.**

## Execution-blueprint capability-fit hardening addendum (2026-10-07)

The Base44 source checkpoint has advanced to `6ac703b8c3e4803a619a7b6f`, git commit `b712fdeaa79de2e5bd7bd4ea8f4c8516c4cbcb73`. Source version string remains `evercraft-opportunity-fabric-runtime-v1.7.0`.

- `plan_execution_team` now requires positive `matched_terms` capability overlap. Geography can raise a genuinely qualified candidate's ranking but **cannot** produce a match on its own. An unmatched need stays in `missing_capabilities`.
- The executable mocked-handler harness in `tests/opportunity_fabric_connect_runtime_behavior_test.mjs` gained two cases: (a) local-only member is excluded while its gap remains explicit and private email absent, and (b) a declared capability match remains eligible with stable, receipt-backed blueprint idempotency.
- Base44 sandbox verified: `npm run test:connect` PASS with **18/18** behavioral tests plus `OPPORTUNITY_SECURITY_PASS`; `npm run build` PASS with the authority contract and all 18 behavioral cases (only stale Browserslist warning).
- At PR head `18c15646ddea9d32e7e4bc4a8fc9698e89e6ce73`, GitHub check runs: Evercraft Connect, Forge checks, Systemia Portfolio Sentinel, Base44 Runtime Debt Inventory, Validate Nexus cross-LLM probes, Node 001 field kit, and Evercraft NodeSeed all reported SUCCESS. This verifies CI on *that* prior GitHub head, not this subsequent documentation commit.
- Canonical `systemia/opportunity-fabric/runtime.json` remains at previously verified v1.5.0 `not_claimed_public` state. Do not mutate it without verified public deployment and independent production access proof.

**Evidence scope:** checkpoint and executable local/mocked-runtime tests. No authenticated public runtime deployment, protected disclosure, outreach, member onboarding, or recovery outcome is asserted.

## Governed Connect → protected Fabric handshake addendum (2026-10-07)

**Verified Base44 source checkpoint:** `6ac705fc8903c241c18ca621`  
**Checkpoint commit:** `8b78b94cb078d57721f10cd957c4a86dc3f4cd16`  
**Runtime source string:** `evercraft-opportunity-fabric-runtime-v1.7.0` (unchanged, not proof of publication).

This iteration closes a missing owner-controlled path from an *approved member proposal* into Fabric's existing protected connection workflow. The Connection Desk now presents **Review protected request**, which only opens the existing Creator Covenant modal. The modal still requires a separate deliberate **Send protected request** action; neither route planning nor approval sends outreach. No private case details are automatically populated into the outbound safe note.

For `create_connection` calls referencing `source_proposal_id`, the trusted runtime freshly validates a proposal owned by the requester, Approved status, target member identity, current case/Project ownership and active state, current capability need, current member availability/overlap, and for a private ConnectCase an affirmative `Public-safe routing approved` or stronger consent state. Private case holds, withdrawn capability, booked members and missing consent block sending. The new receipt metadata records `connect_proposal_revalidated` without serializing private problem/source/notes.

**Security fix:** `request_key` replay lookup is now explicitly requester-scoped and target-checked, rather than querying a globally known request key and returning another user's request. Replay is checked only after validation of current caller and, where applicable, proposed handoff authority.

**Sandbox verification:**
- `node tests/opportunity_fabric_authority_contract_test.mjs`: PASS.
- `npm run test:connect`: PASS, **22/22** executable mocked-handler behavioral tests plus security smoke.
- `npm run build`: PASS, including authority and 22 behavior tests (stale caniuse-lite warning only).
- Targeted ESLint on `ConnectionDesk.jsx` and `ConnectionModal.jsx`: PASS.
- Regression fixtures now cover consent withholding, a successful explicitly approved simulated request (no outbound network), holds, changed member capability, idempotent replay and cross-account request-key isolation.

**Truth boundary:** This is source/checkpoint, local executable test, build and lint evidence. No real member was contacted, no production request was sent, no authenticated two-user production test was run, and v1.7 public deployment is not verified. Leave `systemia/opportunity-fabric/runtime.json` at its previously verified production state until independent deployment and access checks are complete.

## Owner-private case review/consent continuation (2026-10-07)

Base44 sandbox checkpoint: `6ac706ba061caa161535b194`  
Sandbox checkpoint git commit: `9ec913e1b1974301fad21eaf3f765152ce99455e`.

`ConnectionDesk.jsx` now supports reopening a non-archived private `ConnectCase` by its original `case_key` and preserving existing private problem/provenance, capability needs, external candidate reference, sensitivity, routing state and consent on edit. A deliberate owner action may change hold/route state or record consent. The save uses the existing trusted `upsert_connect_case` action; the UI does not directly mutate protected entities. The consent selector expressly states that this is an **owner-recorded assertion**, not independent evidence of the affected party's authorization.

An executable handler test covers an originally held/do-not-contact case being intentionally updated by the owner and then routed, reviewed and prepared as a protected member request. Its case record is updated rather than duplicated, no public Project is created, and private problem text is absent from outbound request/receipt evidence.

**Verification on this checkpoint:** `npm run test:connect` PASS (**23/23** executable mocked-handler cases plus security smoke); `npm run build` PASS (authority contract and 23 behavioral tests); targeted ESLint on modified UI PASS. A non-blocking stale Browserslist data warning remains.

**Deployment boundary remains unchanged.** These are sandbox/source and mock-handler proofs. No production publication, actual external connection, independently verified consent, recovery outcome, or production multi-user privacy test was established. Do not advance the canonical deployed-runtime record without separate evidence.

## Private Recovery outbound note anonymization and replay gate (2026-10-07)

Base44 sandbox checkpoint: `6ac7178d44f71058c4fc5402`  
Checkpoint git commit: `1da17a4d54fd45c36dcc6ac88868d2fe43b2f55d`.

**Verified changes:** For approved `ConnectCase` member handoffs, the trusted `create_connection` action now replaces any caller-provided free-text safe note with one deterministic, neutral introduction: “Interested in exploring a possible collaboration. Can we discuss general fit before any third-party details are shared?” This is enforced server-side even if a caller skips the UI or submits private names, financial distress details, or other sensitive content. The UI shows the neutral note as disabled/read-only for private cases. Public Project/member connection requests retain their ordinary editable safe note.

A private-case request can no longer treat an existing generic pending connection as a successful anonymous handoff. Replays with the same key are accepted only if the previous request used the protected neutral note; replays of earlier non-anonymous requests fail closed. New FabricEvent metadata includes only a Boolean anonymization receipt and does not transmit private case identity.

**Sandbox results:** `node tests/opportunity_fabric_authority_contract_test.mjs` PASS; `npm run test:connect` PASS with **28/28** executable mocked-handler behavioral cases and security smoke; `npm run build` PASS; targeted UI ESLint PASS. The regression suite now covers malicious attempted note disclosure, legacy request-key replay, generic pending-request conflict, and normal public-request behavior. Only the known stale Browserslist warning appeared.

**No production release claim:** This checkpoint was saved in the Base44 sandbox, not independently deployed and authenticated against a public host. No real outreach or monetary/recovery outcome is claimed. Canonical `systemia/opportunity-fabric/runtime.json` stays unchanged pending deployment proof and owner/non-owner runtime verification.

## Safe read-only production authentication canary (2026-10-07)

**Base44 checkpoint:** `6ac718507b63eb4591f03ec9`  
**Source commit:** `719e21a35b76a4ec88475ba826cee7bebd47c676`.

Added `scripts/connect-production-auth-canary.mjs` and `tests/connect-production-auth-canary.test.mjs` to the Base44 source. The script is an explicit release-verification fixture, **not a claim that production is deployed**.

The canary requires four operator-provided environment variables:
- `CONNECT_CANARY_ENDPOINT`: HTTPS URL of the published trusted function
- `CONNECT_CANARY_OWNER_BEARER`: synthetic-case owner authentication bearer
- `CONNECT_CANARY_NONOWNER_BEARER`: independent non-owner authentication bearer
- `CONNECT_CANARY_SYNTHETIC_CASE_ID`: an owner-private **synthetic test case**, not a customer's sensitive case

The script issues only fail-closed `plan_connect_case_route` denial probes:
1. Anonymous request must return `401 authentication_required`.
2. Authenticated owner requesting a random absent case must return `404 connect_case_not_found`.
3. Non-owner requesting the owned synthetic case must return `403 connect_case_owner_required`.

The script does **not** authenticate against real accounts yet, mutate entities, create cases/proposals, send outreach, publish cases or print raw response bodies/secrets. Redirects are rejected; credentials are environment-only. It fails on missing configuration or ambiguous responses and cannot independently prove entity-level RLS or public deployment.

`npm run test:connect` and `npm run build` now include the canary's four offline unit tests. Checkpoint verification: **32/32 tests PASS**, authority contract PASS, security smoke PASS, build PASS, Node syntax check PASS; stale Browserslist warning is non-blocking.

**Release gate still open:** authenticated production deployment of v1.7 is unverified. Do not advance `systemia/opportunity-fabric/runtime.json` from its evidence-backed published state or claim actual contact, consent verification or recovered value before dedicated live tests.

## Dedicated non-mutating production access probe (2026-10-07)

The canary is now strengthened with a dedicated trusted-runtime action `probe_connect_case_access`, rather than reusing the route planner. This probes actual authenticated ownership without creating a plan, matching members, generating proposals, changing the case or writing receipts. Its positive response contains only `ok`, `owner_access`, `private_content_returned:false` and `mutation_created:false`. A non-owner receives 403 even if the acting account has admin role, so elevated test identities cannot accidentally turn the canary into a planner mutation.

The operator canary now exclusively invokes `probe_connect_case_access` for anonymous 401, owner-authenticated nonexistent-record 404, and synthetic-case non-owner 403 assertions. The 4 canary offline unit tests were updated, and an actual trusted-handler behavioral test covers owner 200, stranger 403, nonexistent 404, unauthenticated 401, no private fields and zero write operations.

**Source checkpoint:** `6ac718e8d4bf9f33fbeb1d6e`, Base44 git commit `f3a0917a8222687089fdeab83635ae03e68d3517`.  
**Verified sandbox results:** `npm run test:connect` PASS (**33/33** executable tests and security smoke); `npm run build` PASS (authority contract plus 33 tests and Vite build).

This source verification does not assert authenticated production deployment or a live canary run. No real private business case was probed or created; no external contact occurred. Preserve canonical deployment state until an actual published endpoint, owner/non-owner synthetic accounts and recorded live results exist.
