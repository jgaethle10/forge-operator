# Devpost Draft · CommonGround

## One-line pitch

CommonGround is a Qloo-grounded group-choice agent that asks what each person likes separately, then finds the cultural overlap so couples, families and friend groups can choose places, entertainment and experiences without optimizing for the loudest person.

## Why this only works with Qloo

A generic language model can invent a compromise. CommonGround instead makes independent Taste AI calls for every anonymous profile and domain, preserves Qloo rankings and explainability, and calculates a coverage-aware consensus across the group. Cross-domain cultural affinity is the product substrate, not decorative enrichment.

## Demo story

Two people are planning a date night in Seattle.

- Person 1: Studio Ghibli + Brian Eno
- Person 2: Wes Anderson + Tyler, the Creator
- Objective: a date night everyone actually likes
- Constraints: Seattle, price level <= 3

The agent selects place + movie + artist, queries Qloo for each person in each domain, then returns shared picks with consensus score and group coverage.

## Current build receipt

- Runtime: Node 22, dependency-free
- Qloo key: server-side only
- Tests: mocked provider contract + consensus ranking + privacy boundaries
- Demo: portable HTTP service + browser UI
- License: MIT in the extractable entry package
- External action authority: none
- Payment/reservation authority: none

## Submission checklist

- [x] Working entry runtime implemented
- [x] Qloo Insights API integration implemented
- [x] Agentic multi-profile/multi-domain loop implemented
- [x] Browser demo implemented
- [x] Tests implemented
- [x] Open-source license prepared for standalone repo root
- [ ] Live Qloo API key provisioned through official hackathon access flow
- [ ] Live provider canary recorded
- [ ] Dedicated public competition repository created from this package
- [ ] Externally hosted demo URL verified
- [ ] Demo video recorded
- [ ] Devpost terms accepted by authorized representative
- [ ] Personal eligibility attestation completed by authorized representative
- [ ] Final Devpost submission receipt recorded

## Human gates deliberately deferred

Joining the hackathon, accepting Devpost/Qloo terms, personal eligibility attestation, CAPTCHA/MFA, and any identity step remain human-only. None are required to continue building or testing the entry.
