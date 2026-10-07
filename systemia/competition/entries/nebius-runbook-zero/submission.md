# Devpost Draft · Runbook Zero

## One-line pitch

Runbook Zero is a bounded autonomous repository repair operator that lets NVIDIA Nemotron diagnose and patch a real failing repository through Nebius Token Factory while the runtime, not the model, controls file authority, verification, rollback, and receipts.

## Problem

Autonomous coding agents are useful until they can quietly broaden their own authority or mistake a broken verification harness for success. Runbook Zero is built around the opposite assumption: a repair is not complete because a model says it is complete. It is complete only when an operator-supplied verification command actually executes and returns green.

The project was hardened against a real false-green discovered during competition development. Nested `node --test` verification inherited Node test-runner control variables and could exit successfully without running the intended tests. Runbook Zero now strips those variables before child verification and carries an explicit regression proving one intentionally failing nested test really executes and stays red.

## What it does

1. The operator supplies a repository, an argv verification command, an objective, and an explicit editable-file allowlist.
2. Runbook Zero executes the real verification first.
3. On failure, NVIDIA Nemotron is called through Nebius Token Factory with bounded repository context.
4. Nemotron returns machine-readable exact-text edits only.
5. The runtime rejects path traversal, files outside the allowlist, non-unique replacements, oversized edits, and any attempt to obtain shell authority.
6. The runtime applies the bounded patch and reruns the exact same verification command.
7. If the repository turns green, Runbook Zero emits a receipt with verification state and file hashes.
8. If it remains red or the model crosses the authority boundary, Runbook Zero restores the original files and emits a held/rollback receipt.

## Audience and impact

Runbook Zero is aimed at engineering teams that want autonomous repair without handing a model unconstrained repository or shell authority. The useful unit is not "AI wrote a patch." It is "AI proposed a bounded change, the real system verified it, and the machine can prove exactly what happened."

That makes the design relevant to CI repair, dependency-upgrade remediation, repetitive regression repair, and other repository maintenance where automation is valuable but false-green results are expensive.

## Hackathon track

Coding and Agentic Engineering.

## Nebius + NVIDIA

- Nebius Token Factory provides the inference runtime.
- NVIDIA Nemotron 3 Super is the default reasoning model: `nvidia/nemotron-3-super-120b-a12b`.
- The Token Factory key stays server-side and is never included in public receipts.
- Calling Nemotron through Token Factory is the required Nebius runtime path for the project.
- The live provider canary remains intentionally unclaimed until legitimate Token Factory credentials are present.

## Why it is more than code completion

```text
real failing verification
→ bounded repository context
→ Nemotron diagnosis
→ exact-text repair plan
→ runtime authority checks
→ patch
→ same real verification rerun
→ verified receipt OR rollback
```

Nemotron reasons. The runtime controls what Nemotron is allowed to touch.

## Competition-period work

Runbook Zero is a new competition-specific implementation created during the submission period. It packages Evercraft's broader evidence-first autonomy doctrine into a standalone open-source coding agent with a new Nebius/Nemotron repair loop, bounded edit runtime, rollback semantics, browser demo, standalone HTTP server, public-demo abuse guardrails, competition packaging, and regression tests.

## Current evidence

- Raven Competition Provider Runtime: 92 tests passed, 0 failed on the public-demo hardening generation.
- Standalone package: 12 tests passed, 0 failed.
- Explicit nested-test false-green regression is included.
- Public demo requires both a server-side Nebius credential and `RUNBOOK_ZERO_DEMO_ENABLED=1`.
- Public demo inference runs are bounded and cooldown-protected.
- Standalone source export passed secret scanning and MIT-license checks.
- Public standalone source branch: `runbook-zero-public`.
- No live Nebius canary, public deployment, Devpost submission, terms acceptance, or eligibility attestation is claimed yet.

## Judging alignment

**Technological Implementation:** closed-loop Nemotron repair with real verification, bounded file authority, path and replacement validation, rollback, receipts, and a regression against a real false-green failure mode.

**Design:** a focused browser experience shows the broken repository, resulting repair, verification state, and receipt rather than exposing raw agent internals.

**Potential Impact:** repository maintenance is a recurring engineering cost, while unconstrained autonomous repair can create correctness and security risk. Runbook Zero narrows the agent's authority without reducing the usefulness of the repair loop.

**Quality of the Idea:** the model is deliberately not the final authority. The novel center of the product is the separation of reasoning authority from execution and verification authority.

## Required submission package status

- [x] Autonomous repair loop implemented
- [x] Nemotron Token Factory adapter implemented
- [x] Real local verification execution implemented
- [x] Bounded file-edit policy implemented
- [x] Automatic rollback implemented
- [x] False-green regression implemented
- [x] Hosted-demo runtime implemented
- [x] Public-demo abuse guardrails implemented
- [x] Standalone MIT license prepared
- [x] Raven competition QA passed
- [x] Standalone export passed secret scan + integrity receipt
- [x] Public standalone source branch published: `runbook-zero-public`
- [x] <3 minute demo-video shot plan prepared
- [x] Provider-feedback capture template prepared
- [ ] Legitimate Nebius Token Factory credential present
- [ ] Live Nemotron canary recorded
- [ ] Dedicated public competition repository created from verified export
- [ ] Public demo deployed and externally verified
- [ ] Public YouTube demo recorded and uploaded
- [ ] Live-use Nebius/NVIDIA feedback completed
- [ ] Devpost terms accepted and representative eligibility attestation completed by the entrant
- [ ] Final Devpost/provider receipt recorded
