# Evercraft × AI Evaluation Lab: first independent workflow candidate

**Status:** Research-only, synthetic, deterministic. This is an Evercraft-owned candidate speaking the Lab's [EO-WORKFLOW/0.1.0](https://github.com/kaulastudies/ai-evaluation-lab/blob/research/eo001-receipt-audit-20261029/research/eo001_receipt_audit/durable/adapter_contract.json) stdin/stdout decision contract. It is **not a live Systemia agent**, production payment integration, or an accepted joint result. No real provider calls, customer records, authorizations, payment credentials, or external actions are used.

## Why this bridge exists

Chandra's [AI Evaluation Lab PR #30](https://github.com/kaulastudies/ai-evaluation-lab/pull/30) contains a separate lab-controlled synthetic provider with durable SQLite effects, Ed25519 receipts, process-kill tests, concurrent retries, and a bounded decision runner. The candidate here is an **original Evercraft policy implementation**, not a copy of the Lab provider. It demonstrates the *decision-side* safety rule while leaving provider dispatch, signed evidence, faults and scoring to the external evaluator.

The source-side seam in owned Systemia is already present:

- [goal-cli.mjs](../../systemia/organism/goal-cli.mjs): recovery-scan, recovery-hold, recovery-observe operator commands.
- [goal-provider-observation.mjs](../../systemia/organism/goal-provider-observation.mjs): signed observer attestation tied to a predeclared provider and specific attempt. Valid signatures never automatically authorize replay or completion.
- [goal-provider-observation.test.mjs](../../systemia/organism/goal-provider-observation.test.mjs): tampering, scope and attempt fencing, stale evidence, persisted recovery holds.
- [previous synthetic effect simulator](../neatroots/ambiguous-external-effect.mjs): exercises three acknowledgment-loss cases but is in-memory and scripted.

**These two recovery contracts are not wire-compatible.** The new candidate is the minimal compatibility experiment; it does not invoke Systemia's goal store, run Saban, or claim integrated mission execution.

## Run

Requires Node 22+; no package install or secrets.

```bash
node --test integrations/ai-evaluation-lab/eo001-lab-candidate.test.mjs
```

The candidate reads one bounded JSON request from stdin and writes one JSON action to stdout. To invoke it through the Lab's runner, the Lab maintainers can review the code and pass the absolute path to the candidate to its existing `--command-json` argument:

```bash
# Run from AI Evaluation Lab repository on a trusted synthetic Linux test host.
python -m research.eo001_receipt_audit.durable.runner \
  --command-json '["node","/ABSOLUTE/PATH/TO/forge-operator/integrations/ai-evaluation-lab/eo001-lab-candidate.mjs"]' \
  --fault ack_loss --output /tmp/evercraft-eo001-session.json
```

The Lab evaluator owns the fixed synthetic operation, dispatch and signer. The candidate checks that the signed observation binds the configured issuer/store, exact request, current query challenge, method and nested settlement receipt. It asks for a **lookup** after an acknowledgment loss. On invalid, missing, conflicting or unavailable evidence, it finishes with `unknown/false/null` rather than retrying or claiming settlement. Positive authorization is only a *synthetic provider status decision*, not observed fulfillment.

The Lab's public fixture replay and fresh-process CI remain independently owned by the Lab. Our Node tests are an independent **local wire-shape and decision-policy check**, not a substituted evaluation report. Cross-repository runner validation is a remaining task.

## Trust boundaries and open problems

- The `trust` public key is supplied by the evaluator; a malicious host can substitute it. The candidate only authenticates receipts relative to that configured key and its store. No guarantee of complete history or independently trustworthy host.
- The candidate is deterministic policy code, **not an autonomous model**. No claim about Systemia model behavior or safe production retries follows from it.
- A valid prior receipt can be reused for the same durable operation when it is delivered within a *fresh signed observation*. An old observation cannot answer a new query challenge.
- The Lab's single-host SQLite effect is not an actual remote payment. Its successful authorization is not a real sale or delivery.
- The lab runner is not a hostile-code sandbox. Do **not** run arbitrary agent commands, pass secrets, mount production state, or provide signing keys to the candidate.
- Next: have Chandra independently run the candidate against PR #30 in an isolated host, compare output/evidence verdicts, then agree on an actual Systemia/Saban decision entry point and authorized model/token budget. No unrestricted access or paid scope is assumed.

Related tracking: [Evercraft issue #1705](https://github.com/jgaethle10/forge-operator/issues/1705).
