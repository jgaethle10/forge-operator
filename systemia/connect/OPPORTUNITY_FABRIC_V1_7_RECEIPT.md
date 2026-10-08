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
