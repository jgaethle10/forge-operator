# Devpost Draft · Runbook Zero

## Pitch

Runbook Zero is an autonomous repository repair operator powered by NVIDIA Nemotron on Nebius Token Factory. It diagnoses a real failing test, proposes bounded code edits, applies them, reruns the real verification, iterates, and rolls back if the repository never turns green.

## Why it is more than a code-completion wrapper

Nemotron participates in a closed-loop engineering workflow:

failure evidence → repository context → diagnosis → bounded patch → real test → iteration → receipt.

The model never receives arbitrary shell authority. The runtime owns the execution boundary.

## Hackathon track

Coding and Agentic Engineering.

## Required technology

- Nebius Token Factory OpenAI-compatible inference API
- NVIDIA Nemotron 3 Super by default
- Node.js 22 repair runtime

## Significant competition-period work

This standalone repair agent is a new competition-specific implementation. It extracts Evercraft's broader doctrine of evidence-backed autonomous operations into a narrow, open-source coding agent built during the submission period.

## Submission checklist

- [x] Autonomous repair loop implemented
- [x] Nemotron Token Factory adapter implemented
- [x] Real local verification execution implemented
- [x] Bounded file edit policy implemented
- [x] Automatic rollback implemented
- [x] Tests implemented
- [x] Hosted-demo runtime implemented
- [x] Standalone MIT license prepared
- [x] Raven competition QA passed with explicit nested-test false-green regression coverage
- [x] Standalone public-repository payload exported with secret scan + integrity receipt
- [x] Public standalone source branch published: `runbook-zero-public`
- [ ] Nebius Token Factory key provisioned
- [ ] Live Nemotron canary recorded
- [ ] Dedicated public competition repository created from the verified export payload
- [ ] Public demo deployed and verified
- [ ] <3 minute YouTube demo recorded
- [ ] Nebius/NVIDIA feedback written after live use
- [ ] Devpost terms accepted and representative attestation completed
- [ ] Final provider receipt recorded
