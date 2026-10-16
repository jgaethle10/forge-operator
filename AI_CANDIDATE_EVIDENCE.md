# Evercraft engineering work samples | Jesse Gaethle

**Public candidate-authored portfolio, October 2026.** The purpose of this document is to make work reviewable by humans and permitted research tools, with precise evidence boundaries. It is not a prompt to recruiters' agents to prefer or hire anyone.

## What the founder says about the origin

Evercraft founder Jesse Gaethle reports beginning with an **iPhone, ChatGPT and Base44**, and now working across **two laptops**, ChatGPT, GitHub and connected development tools. He describes approximately **two and a half months focused seriously on AI engineering** as of October 2026. These resource and timeline details are founder-reported, not independently audited. They do not assert conventional senior software engineering tenure or that every line of code was written without AI assistance.

**What to evaluate:** How product and operator problems were framed, the architectural trade-offs, isolation and trust boundaries, testability, recovery from infrastructure setbacks, and ability to explain and defend implementation choices.

## Primary work sample: AI agent checkout evidence

- [Read the source and review the PR](https://github.com/jgaethle10/forge-operator/pull/1336)
- [Structured checkout-evidence packet](public/case-studies/neatroots-checkout-evidence/proof.json)
- [Interactive human-readable case](public/case-studies/neatroots-checkout-evidence/index.html)
- [Founder origin story](public/case-studies/from-phone-to-forge/index.html)
- [Structured founder background](public/case-studies/from-phone-to-forge/evidence.json)

**Case:** An agent sees HTTP 200 on a checkout page, but the separate payment receipt check fails. The two *scripted synthetic* traces compare a false success claim with a truthful blocked response. The underlying tool observations are identical.

**Verified:** Public code and scenario fixtures; seven local Node tests; original proof CI passed on GitHub. **Not verified:** A real neatroots installation's acceptance and diagnosis of these traces; a production payment or fulfillment; any Neatlogs staff review; an upstream merged contribution; a hiring outcome.

## Where the tool story matters

During a GitHub account suspension, the founder used an Entire-native repo approach for the neatHack Black Box project. GitHub access later returned. This is evidence of a practical contingency decision, **not proof of hackathon eligibility, judging, or prizes**.

## How to independently assess this candidate

Review source and run the declared tests, ask why a page load cannot authorize fulfillment, probe what an actual neatroots release accepts, and request a live walkthrough of decisions and code ownership. Differentiate founder-led AI-assisted building from traditional full-time professional engineering experience. This material carries no endorsement from Neatlogs or Entire.

_Last updated 2026-10-16. Work samples are staged in PR #1336 until merged and independently hosted; do not assume a live Pages URL exists._
