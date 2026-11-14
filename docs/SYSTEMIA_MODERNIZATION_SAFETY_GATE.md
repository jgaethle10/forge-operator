# Systemia Modernization Safety Gate v1

**2026-11-14 | Source proposal, not a production rollout**

## Why

Modernization can increase failure risk when new AI services, queues, dependencies,
or workloads are introduced into fragile systems without tested isolation and
rollback. Age alone does not prove a system is unsafe, and AI is not necessarily
the cause of an outage. The engineering question is whether an upgrade creates
an unmeasured failure mode or an uncontained blast radius.

This contract extends, rather than replaces:

- [Systemia Architecture Intelligence](SYSTEMIA_ARCHITECTURE_INTELLIGENCE.md):
  source relationships versus observed executions versus downstream receipts.
- [Blackout Resilience Standard](../systemia/network/BLACKOUT-RESILIENCE.md):
  local continuity and failure/partition behavior.
- [Chromebook Edge Resilience](../systemia/compute/CHROMEBOOK_EDGE_RESILIENCE.md):
  external public health differs from a local green port.
- [Evercraft OS coordination issue #1546](https://github.com/jgaethle10/forge-operator/issues/1546):
  shared dependency ordering and existing reliability owners.

## Change policy

Systemia must admit work first. This source checker **does not** contact
Systemia, admit a mission, grant execution permission, or deploy. A GitHub PR
is not an admission or runtime receipt.

For every product modernization:

1. **Named ownership**: real maintainer, runbook, escalation and handoff.
2. **Dependency inventory**: exact upstream/downstream versions, protocol
   contract and product boundaries; identify paid/external services.
3. **Compatibility**: old and new versions verified against contract tests;
   do not reinterpret previously stored data silently.
4. **Isolation**: test changes in shadow mode or bounded canary before
   full adoption; require measurable rollback criteria.
5. **Failure exercises**: simulate broken upstream, timeouts, resource
   exhaustion and restart; capture durable, identifiable evidence.
6. **Real operating cost**: measure CPU, RAM, token/API spending, storage,
   network and support time; impose budget/usage ceilings.
7. **Restorable state**: critical services need encrypted backups and a
   witnessed restoration drill, with explicit RTO and RPO.
8. **Truthful health**: local heartbeat != external route; source != live
   runtime; paid intent != settled revenue.
9. **AI safe boundary**: timeout/cost limits, quarantine, safe offline or
   non-AI fallback, and no newly invented payment/legal/safety authority.
10. **Release authority**: operator/Passport/Execution Gate/Yard deployment
    approval remains separate from this read-only technical review.

### Extra proof for customer money and records

Commerce requires payment-idempotency and replay tests, provider-verified
receipts and duplicate-delivery prevention. Identity/customer-data changes
require migration reconciliation, privacy and access-control review. No
test authorizes moving customer data, billing someone, or editing DNS.

## Read-only manifest review

Provide an operator-controlled JSON file with these fields:

```json
{
  "schema": "evercraft.modernization-change.v1",
  "change_id": "EXAMPLE-HELD",
  "service": "illustrative-service",
  "criticality": "critical",
  "service_class": "commerce",
  "ai_integration": true,
  "evidence": {}
}
```

```bash
python tools/systemia_modernization_gate.py --manifest /path/to/change.json
python -m unittest discover -s tests -p 'test_systemia_modernization_gate.py' -v
```

The first command exits 1 for **held**, 0 for
**ready_for_independent_review**, and 2 for malformed input. Each required
`evidence` entry must have `status: "passed"` and a traceable
`evidence_ref`. Self-reported evidence references are **claims**, not
independently verified runtime receipts. Even a complete manifest only
returns `ready_for_independent_review`: **never approved/deployed**.

Keep customer data, keys, private node topology and payment details out of
the public repo and CI logs. Review synthetic/public-safe manifests in CI;
real receipts belong in a protected Systemia store.

## Immediate ownership and acceptance

Existing Systemia reliability/OS issue #1546 is the program coordination
anchor. Do not create a rival runtime or duplicate the already implemented
blackout and architecture-health tools.

- **P0**: audit live Payments/entitlements and public origin for missing
  dependencies, unsafe fallback and irreversible replays.
- **P0**: select one critical service; document its dependency and expense
  map, rollback and restoration proof, and independently verify its public
  route. Unknown stays held.
- **P1**: wire this checker into an existing Systemia admission/release
  proposal workflow with protected receipts and operator review, not merely
  a repository checklist.
- **P1**: exercise Chromebook/HP node loss against a real independent edge,
  using explicit node authorization. Current local simulations alone do not
  establish physical failover.
- **P1**: assign every product an accountable owner, lifecycle tier
  (sell/maintain/experimental/retire), recurring costs and rollback path.
  Reduce the long tail of unmaintained services without abandoning user data.
- **P2**: show a single source-grounded Control Room view with evidence age,
  current incident, RTO/RPO, actual monthly run cost and status. Unknown is
  never silently converted to green.

**Acceptance to say implemented in production:** Systemia admission,
source review, real integration test, externally observed canary, separately
tested restore, release receipt, signed ownership, controlled rollback,
and measured operating cost, each linked to its own evidence.
