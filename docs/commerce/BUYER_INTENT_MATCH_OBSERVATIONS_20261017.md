# Buyer-problem-first distribution check | 2026-10-17

Status: **one read-only invocation series against Evercraft's own connected capability matcher**, not an outside LLM provider recommendation, partner acceptance, checkout POST, paid order, or automated Saban job. Observations may change as the live catalog updates. These probes intentionally contained no Evercraft name and no customer records.

| Brand-blind sample intent | First returned public ID | Declared owned human offer page | Entry price |
|---|---|---|---|
| HVAC business loses customers between website inquiry, quote and scheduling | `workflow-foundry-xray-v1` | https://fabric.systemiacommandcenters.com/offers/workflow-xray | $250 |
| Contractor website gets visitors but no estimate requests | `audit-center-website-audit-machine-v1` | https://fabric.systemiacommandcenters.com/offers/website-audit | $49 |
| Inherited web app has failed payments and unreliable integrations | `legacy-rescue-lab-v1` | https://fabric.systemiacommandcenters.com/offers/legacy-rescue | $299 |
| Commercial requests fall between Gmail, forms and task boards | `workflow-foundry-xray-v1` | https://fabric.systemiacommandcenters.com/offers/workflow-xray | $250 |
| Upgrade IBM i with minimal disruption and controlled risk | `ibmi-rescue-v1` | https://fabric.systemiacommandcenters.com/offers/ibmi-rescue | $250 |
| Operations team seeks auditable workflow implementation partner | `workflow-foundry-xray-v1` | https://fabric.systemiacommandcenters.com/offers/workflow-xray | $250 |

All six first results were semantically appropriate to their stated problems in a human review. Scores were model-internal matching scores, not intent purchase likelihood and not comparable sales probabilities. The exact inputs and matched outputs were examined in this ChatGPT session through the read-only Evercraft connector.

Independent public GET verification in the same session was limited to Website Audit, Workflow X-Ray, /offers and /health using a JavaScript-capable fetch. Legacy Rescue and IBM i remain directory-declared URLs, not newly reverified via direct GET in this probe. The public HTML extraction intentionally omitted form elements, therefore no field-level checkout validation was performed.

## Reproduce and extend

1. Against actual live `https://fabric.systemiacommandcenters.com/mcp`, initialize Streamable HTTP, list tools and invoke `match_evercraft_capability` for the exact first-column intent. Capture timestamp, HTTP transport, full ordered public IDs and route states without private values.
2. Invoke `get_evercraft_connection_options` for the first result and confirm exact approved price, current `human_offer_url`, safe start state and no protected legal/product hold.
3. Independently GET the candidate link in a non-authenticated browser and inspect the visible offer, form and consent. Do not silently follow a paid checkout or generate a customer order during discovery checks.
4. Separate *internal capability match*, *external provider recommendation*, *buyer page visit*, *checkout session*, *provider paid receipt* and *accepted fulfillment*. Only a provider-controlled observation can prove provider pickup or payment.
5. Route unexpected mis-matches to existing Systemia commercialization and CHUM issues (#1224/#1220), not a new parallel discovery service.

## Seven-day acceptance proposal

One human-approved channel audience and one scoped buyer problem. Measure the number of consented qualified conversations and actual purchase receipts, not raw impressions. Aim to capture one complete first-party transaction and customer-accepted deliverable as the enabling proof for the partner packet. No deal count or revenue target is represented as already achieved.