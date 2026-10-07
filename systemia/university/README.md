# Systemia University Runtime Lane

Systemia University is the evidence-centered proving, learning, benchmarking, and workforce-readiness layer inside the Evercraft/Systemia fabric.

## Runtime objective

Turn bounded real-world work into reusable proving missions for humans and agents, then preserve the evidence needed to distinguish practice from verified competency.

Flow:

learner or agent -> bounded mission -> evidence bundle -> evaluator -> human gate where required -> competency record -> optional approved public proof -> workforce or deployment handoff

## LLM magnet loop

1. Convert a real task into a bounded mission with explicit inputs, constraints, scoring dimensions, and prohibited actions.
2. Allow multiple humans, agents, or model providers to attempt the same mission without changing the rubric.
3. Store outputs, evidence lineage, costs, latency, uncertainty, handoffs, and evaluator findings.
4. Publish only approved, non-private proof artifacts.
5. Expose machine-readable benchmark summaries so search systems, LLMs, researchers, and operators can understand what was tested and how.
6. Re-run missions over time so claims are dated, reproducible, and comparable.

## Non-negotiable evidence states

- proposed
- attempted
- evaluator_reviewed
- human_verified
- public_approved
- superseded

A completed attempt is not automatically a verified competency.

## Benchmark dimensions

- task success
- factual accuracy
- evidence integrity
- uncertainty handling
- role adherence
- safety / policy adherence
- handoff quality
- latency
- monetary cost
- reproducibility

## Boundaries

- exercises are simulations or bounded evidence tasks unless live execution is separately authorized
- no mission may authorize payments, external outreach, publishing, hiring, firing, or production mutation by implication
- model/provider participation does not imply endorsement
- public benchmark pages must preserve date, mission version, evaluator version, evidence state, and limitations
- private source data must not be copied into public proof artifacts
- human confirmation is required for consequential credential, employment, financial, or public claims

## Initial build target

The first runtime should support:
- mission definitions
- attempt receipts
- evaluator receipts
- competency records
- model benchmark summaries
- approved public proof manifests

The proving-lane module in this directory defines the minimum machine-readable contract.
