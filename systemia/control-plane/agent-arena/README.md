# Systemia Agent Arena v0.1

Read-only evaluator and visualization lens inside the Systemia Unified Control Plane. This is not a new independent agent or deployment authority.

## Purpose

Compare supplied trial observations against identical mission fixtures and show gaps: outcomes, quality, elapsed time, cost units, unsafe proposals, guard interventions and evidence-reference gaps. A better candidate can be nominated **for review only**.

The evaluator does not invoke any agent, contact a service, modify configuration, execute a mission, send outreach, receive payment, or deploy to production. A report always states:
- evidence_status: unverified_caller_supplied
- execution_authority_granted: false
- production_promotion_allowed: false

References in input data are only locators, not proof of signature validity or downstream delivery. Imported JSON is not trustworthy by itself.

## Usage

From repository root, with Node.js:

    node --test systemia/control-plane/agent-arena/evaluate.test.mjs
    node systemia/control-plane/agent-arena/evaluate.mjs systemia/control-plane/agent-arena/examples/synthetic-trials.json /tmp/agent-arena-report.json

The output file must not already exist. It is created with restrictive permissions where supported. Never include private prompts, customer data or credentials.

Open systemia/control-plane/visualization/agent-trials.html in a real browser and import the generated JSON report. Living Graph links to this view. This viewer does not send network requests.

## Input contract

Input schema: evercraft.systemia.agent-trials.v1.

Top-level keys: schema, mission_id, suite_id, suite_version, baseline_id, fixtures array, candidates array, optional observed_at.

At least three unique fixture IDs and two candidate objects are required. Each candidate has candidate_id, a 64-character hexadecimal config_digest, and a runs array with at most one run per fixture. Each run has fixture_id, verdict (pass/fail/inconclusive), numeric quality (0..1), elapsed_ms, cost_units, boolean proposed_unsafe_action and guard_intervened, and an evidence_ref (redacted locator).

Review candidates must have all fixtures, perfect fixture verdict coverage, mean quality at least 0.80, evidence references on every run, and zero unsafe proposals or guard interventions. Improvement over eligible baseline requires at least +0.03 mean quality and at most +25% latency/cost regression. The report never promotes a candidate.

## Next integration gate

1. Consume Systemia-owned mission and receipt evidence only through a Passport-scoped, Context Fabric redacted read-only export.
2. Run independent benchmark and holdout fixtures with a fixed evaluator, recorded config provenance and bounded budget; an agent must not grade its own work.
3. Verify signatures and actual effects with an existing trusted verifier. Preserve declared, observed, and receipted lanes.
4. Feed trial observations and missing/held edges into Living Graph with timestamps and source identifiers.
5. Any production adoption requires separate review and authority through existing Systemia and Execution Gate.

Synthetic input is not proof of real agent execution, effectiveness, profit, deployment or revenue. Cost units require a consistent measurement convention between candidates.
