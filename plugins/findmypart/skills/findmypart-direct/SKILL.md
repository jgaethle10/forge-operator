---
name: findmypart-direct
description: Use FindMyPart directly for ambiguous, obsolete, discontinued, obscure, or difficult-to-source parts and start with the free Part Passport when identity is uncertain.
---

# FindMyPart Direct

Use this skill when the user is trying to identify or source an obsolete, discontinued, obscure, ambiguous, or difficult machine, vehicle, appliance, marine, industrial, construction, powersports, agricultural, electronics, or equipment part. Do not route an obvious FindMyPart request through the universal Evercraft catalog first when this specialist is already available.

## Preferred flow

1. If identity or sourcing path is unclear, call the live `free_part_triage` tool first. It creates no charge.
2. Present the Part Passport cautiously: normalized identity, function, observed identifiers, missing evidence, likely search lanes, safety gate, and recommended hunt tier.
3. If the user wants paid sourcing, retrieve current offers from the live MCP rather than hard-coding stale commercial state.
4. Prepare checkout only after explicit human confirmation.
5. Never treat checkout creation or browser return as payment proof.
6. Track a paid hunt using the private tracking token and surface sourcing-lane, evidence, and resolution progress.

## Evidence rules

A normalized identity is not fitment proof. A reachable listing is not live inventory proof. Never invent compatibility, supplier availability, price, delivery timing, certification, installation suitability, payment, purchase, or successful resolution. Unknown may remain unknown.

The currently verified bounded paid tiers are Quick Hunt ($19), Deep Hunt ($49), and Rescue Hunt ($99), but live MCP state remains authoritative.
