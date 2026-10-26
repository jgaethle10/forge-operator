# Evercraft Work Saban: Skills v0.1

A minimal, auditable skill-routing slice built on the existing Saban repository. This is **not** a new agent runtime, a production enrollment, a live MCP tool, or a rendered commercial.

## Pilot command

```bash
node systemia/saban/work-skills/cli.mjs --task 'Create a 30-second narrated commercial for a cleaning company.'
node --test tests/work-saban-skills.test.mjs
```

The `cli.mjs` entrypoint loads `registry.json`, verifies the pinned SHA-256 of `SKILL.md`, recognizes a bounded intent, selects the approved skill, describes the proposed team, and emits a deterministic task / skill evidence receipt. It **does not dispatch agents**. Skill procedures cannot grant capabilities or override Systemia approvals. If a skill is missing, modified, ambiguous, or unmatched, selection fails closed.

## Existing-system boundary

Saban remains the work-formation/execution layer; Systemia remains the admission and publication authority. Once an independently reviewed execution adapter is present, route the skill's `role` packets through the **registered** Saban workload and local/attested NodeSeed execution, not arbitrary remote shell access. The `nexus-work/team-review-contract.json` allows scoped internal analysis / research / QA but does not independently authorize commercial production, publication, or account changes.

## First useful demonstration

A user requesting a narrated cleaning-company video receives a four-role plan: research, creative, production, review. The receipt carries hashed task identity, pinned skill version and hash, proposed outputs, review criteria, missing-input list, and explicit side-effect denials. Progress should only appear in a future visual workroom when backed by real execution-state receipts. Never show a planned role as running.

## To move beyond v0.1

1. Integrate a **read-only** skill discovery endpoint with a separate, authenticated Systemia admission service, without exposing private registry or host topology publicly.
2. Implement one approved `commercial-brief` *execution* adapter using source-provided assets, evidence references, and local draft outputs. Test contract compliance and independently capture execution receipts.
3. Add human review, material QA, and publication gates. Publishing, payment, and customer delivery remain separate authorized activities.
4. Run staging on an explicitly enrolled NodeSeed, verify observed state, and only then consider broader rollout.
