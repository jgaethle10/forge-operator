# Wheel Lab: merchant discovery gate (2026-10-28)

## Decision: **research, do not sell the renderer alone**

This is **not** an open sales lane. There is one founder-provided Yakima community screenshot with 17 reactions and four comments. Neither the reaction count nor the comment count is a buyer. One screenshot must not be fanned out into 21 independent leads.

The UI proof is real, but the market category is crowded:

- WheelPeek advertises shop kiosks, inventory-scoped QR links, photoreal previews, catalog API, and white-label pilots: https://wheelpeek.com/business/
- Tireweb AutoSync offers a live sample-catalog visualizer for vehicle-based wheel shopping: https://www.tireweb.com/wheels-visualizer-demo/
- WheelSnap markets Shopify wheel previews and separately scoped retailer/API integrations: https://wheelsnap.ai/
- RimFit advertises an in-shop preview, branded share link and itemized installation quotes: https://rimfit.app/

These are **competitor claims as published** and have not been independently performance-tested. No meaningful exclusivity or superior visual fidelity has been demonstrated for Evercraft. Do not claim a 'first of its kind' advantage.

## Potential underserved wedge to investigate

A tiny independent wheel shop may prefer a lean, shop-operated **quote-workflow service** rather than buying and administering a full rendering platform. Research, do not assert, these potential problems:

1. Importing existing shop inventory and price sheets without a separate e-commerce rebuild.
2. Turning a customer's preferred appearance into an *operator-verified* itemized estimate, including mounting, balance, TPMS and installation labor.
3. Returning an accurate quote quickly via the shop's existing permitted channel with explicit human approval.
4. Measuring prospect → merchant-verified quote → accepted invoice without treating clicks or page renders as sales.

**Where competitors already solve these, close the Wheel Lab lane.** FindMyPart already has partner registration, referral tracking and quote-related flows; confirm fit and authority before writing another duplicated CRM or payment system.

## Three gates, in order

### Gate A: consented discovery

Conduct three **independent, permissioned** merchant conversations. Document source and date, current wheel sales workflow, actual problems, current tools, how often the problem happens, and costs of friction. A generic "cool idea" is not demand. Do not scrape the original Facebook post for contact details, auto-message commenters, or assume permission from an online business listing.

**Research candidates only, not contacts or warm leads:** Elite Tire Center (1611 S 1st St, Yakima, WA); Tire Centers Inc. (1710 S 1st St, Yakima, WA); Azteca Tires and Wheels (3007 Main St, Union Gap, WA). Confirm each business's identity and services again before proposing anything.

### Gate B: distinct paid workflow

Identify one objectively underserved shop workflow and one explicit request to pilot. Record a source-backed conversation or written expression of interest, never a hypothetical 'opt-in.' If the problem is already solved with the shop's current tools, stop.

### Gate C: real fitment, contract and money

Every quote must be checked against exact vehicle details and manufacturer wheel specs, with brake clearance, load, bolt pattern, center bore, offset, tire diameter, and applicable restrictions independently verified. Only licensed product photos/catalog data with merchant authority may appear. Operator approves quote and recipient before any send. Checkout creation isn't payment; release depends on Systemia admission, real provider settlement receipts and completed QA.

## Evidence accounting

Use `merchant-pilot-gate.mjs` to triage structured research observations locally. It **does not certify** that submitted evidence is authentic; its greenest outcome is `human_review_candidate`, never 'ready to sell.' The empty register returns `insufficient_permissioned_evidence`.

Use `demand-observation.mjs` to model the Yakima demand clue as an in-memory Worldstate `reported` observation. It is not a production ingest. Keep all personal names and screenshot content out of GitHub. Source is private founder intake, without a publicly dereferenceable permalink.

### Failure conditions

- No opt-in by a genuinely independent merchant
- No unmet workflow distinct from existing market tools
- No authorized real wheel catalog and mechanical fitment data
- No human quote review / opt-in
- Missing signed Systemia admission and release authority

**At this stage: zero documented merchant interviews, zero signed pilots, zero live quotes, zero revenue.**
