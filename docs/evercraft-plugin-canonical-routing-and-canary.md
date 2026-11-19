# Evercraft plugin: canonical routing and live public MCP proof

The OpenAI plugin is already connected and answering the three existing
read-only actions: list published capabilities, match a customer problem,
and get an owned connection URL. Successful MCP responses are real plugin
operations. They do **not** prove checkout, payment or fulfillment.

## Canonical product routing

The public catalog legitimately contains two ForensiScope records:
- `forensiscope-evidence-review-v1`: the canonical specialist capability
  with the verified product-specific website link and universal MCP route
- `product:forensiscope`: older source-discovery product record, whose
  website is not independently verified as a live customer service

When both are relevant, `match_evercraft_capability` now returns the
canonical specialist **once**. If the canonical specialist is absent or
not relevant in a custom catalog, the legacy discovery record remains
discoverable as a fallback. The full catalog and exact-id lookup still
retain both source records. No product is deleted or promoted to paid.

Tests: `node --test tests/evercraft-plugin-canonical-routing.test.mjs`

## Real published plugin canary

`scripts/probe-evercraft-plugin-live.mjs` sends only three read-only
MCP tool calls to `https://fabric.systemiacommandcenters.com/mcp`:
1. list capabilities;
2. match a natural large-video need to the canonical ForensiScope ID;
3. read that specialist's owned MCP and product-site connections.

No customer identity, access token, card, file, order, checkout action
or private Systemia control is passed. The canary reports observed
success, matched rank, whether the older duplicate remains visible,
and whether the deployed endpoint contains the new explicit
plugin-operation status. An older deployed revision may still show
the duplicate until its owned runtime is updated; the canary reports
that drift without inventing rollout success.

The workflow `Evercraft Plugin Live Read-only Canary` runs on
GitHub Actions twice daily and on main when the canary files change;
it can also run through workflow_dispatch. A green action establishes
that those public operations responded during that check, not a
permanent uptime guarantee or proof of commercial availability.

Local command: `node scripts/probe-evercraft-plugin-live.mjs`

## Commercial isolation

Keep `buyer_checkout_available=false` unless separately validated
Evercraft Payments / Raven Nexus settlement plus canonical fulfillment
has a current production receipt. The last historically observed
provider HTTP 402 is dated October 17, 2026, not a newly diagnosed
provider outage. Neither a successful plugin call nor a static
catalog URL clears that commercial boundary.

Avoid Base44, third-party app-builder hosts, and fallback paid SKUs
unrelated to the exact customer's request.
