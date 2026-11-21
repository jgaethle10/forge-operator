# Evercraft Build | First customer door (alpha)

Date: 2026-11-15
Owner: Evercraft LLC
Canonical repository: jgaethle10/forge-operator
System of record: GitHub source + eventual Systemia admission and delivery receipts
Status: source-committed alpha on review branch, NOT an autonomous app builder or public commercial launch

## Product thesis

A customer should be able to tell Evercraft what they want, see a real result, request a change, approve a clearly scoped project, pay only through a verified provider-backed rail, and receive usable owned work with receipts. No operational vocabulary is required of the customer.

First wedge: small-business websites and landing pages. Later: authenticated business apps, integrations, automations, and game/world builds. Do not suggest that one website-template preview proves the latter.

## Shipped on this branch

- \`public/build/index.html\`: mobile-friendly front door with plain-language prompt, project category, optional brand and examples.
- \`public/build/engine.mjs\`: deterministic, local-only keyword routing and safe HTML template rendering.
- \`public/build/app.mjs\`: generates a sandboxed iframe concept and exports a static HTML file or JSON build brief, with no network transmission.
- \`public/build/style.css\`: white-first Evercraft design.
- \`tests/evercraft-build-alpha.test.mjs\`: input validation, feature interpretation, HTML escaping and no-false-execution tests.

The alpha is a client-side rule/template engine, **not generative AI**. The exported HTML is a static concept, not a tested customer production website. Apps and automations produce scoping briefs only. No API, account, database, source upload, payment, checkout, preview host, job queue, customer email, deployment, or backend feature is invoked.

## Customer states and evidence

1. \`idea_local\`: customer enters a prompt on-device. No customer account, upload or service-side record.
2. \`concept_local\`: local website concept and transparent feature list available.
3. \`brief_exported\`: downloadable JSON can be given by the customer to a future approved intake, with explicit disclosure and consent.
4. \`intake_verified\` [future]: authenticated/consented source of request, idempotent project ID, consent receipt and retention contract.
5. \`preview_verified\` [future]: real scoped job, isolated build runtime, dependency audit, smoke tests, live preview receipt, spend cap, content safety and tenant boundary tests.
6. \`quote_authorized\` [future]: customer-visible scope/version, price, limitations, acceptance conditions and revision policy.
7. \`paid_verified\` [future]: checkout is gated by exact signed scope, payment provider verified event and durable ledger reconciliation. Payment attempts or thank-you pages are not proof of settlement.
8. \`delivery_accepted\` [future]: authorized publish, asset ownership and export, accessibility/security checks, post-release canary, handover and support path.

Never skip a state or treat model output, local artifacts, GitHub source, a checkout link, or a self-reported receipt as independent proof of downstream execution.

## Reuse the owned stack

- **Systemia**: orchestration and task admission, bounded authority and receipts.
- **Saban**: specialized planning/build/review stages once execution is genuinely exposed and scoped.
- **Fabric**: intent-to-capability discovery; its public Evercraft plugin is currently read-only and is NOT a general build execution endpoint.
- **Yard / owned compute**: customer-isolated build jobs with resource limits and cleanup; no customer arbitrary shell on owner nodes.
- **GitHub**: canonical versioned source and tested release artifacts.
- **Evercraft Payments / Stripe**: only actual verified commercial service rails after scope and settlement gating.
- No Base44 dependency, runtime, API, data export or external execution path.

## Production prerequisites (not currently satisfied by alpha)

- Tenant accounts, verified permissions and data-retention/deletion policy.
- Prompt-to-spec model inference with bounded cost, reviewable outputs and prompt injection protections.
- Per-project isolated sandbox; secrets injected only through authorized service contracts.
- Artifact storage, generated source diff/history, preview host with TTL and no ability to reach internal networks.
- Separate design preview from production launch approval.
- GitHub/release and secure deployment authority fenced from the customer prompt.
- Consent-based analytics for prompt -> preview -> quote -> verified payment -> accepted delivery.
- Payment reconciliation and customer support/refunds.
- Distinct acceptance suites for websites, apps, automations, and games.

## Acceptance and immediate next milestone

Alpha acceptance:
- \`node --test tests/evercraft-build-alpha.test.mjs\`
- \`node --check public/build/engine.mjs\`
- \`node --check public/build/app.mjs\`
- Open \`public/build/index.html\` on a mobile viewport through an HTTP static server; create a landscaping preview, edit/rebuild, export HTML and brief, confirm offline operation.
- Run XSS/markup payload through brand field; no script executes in sandbox.
- Confirm there are zero outgoing API calls and no checkout or external publish action.
- Check Pages artifact and public HTTPS route separately after approved merge and deployment.

Next paid-learning milestone: **one customer-approved, human-scoped website pilot**, not instant generic app creation. Do not advertise a public instant fixed price before time/cost/acceptance and actual settlement are recorded. Track one real visitor-to-inquiry-to-accepted-delivery sequence, then make repeatable parts machine-driven.

## Launch evidence and hard boundaries

- Source commit != public deploy.
- Static local preview != remote, autonomous code generation.
- JSON brief download != Evercraft receiving a customer inquiry.
- App/automation feature name != working feature.
- A button without provider-backed confirmed payment != a paid order.
- Do not claim public availability or revenue before exact HTTPS canary and provider/customer receipts.
