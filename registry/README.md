# Evercraft Agent Registry

Evercraft publishes discoverable AI capabilities. **Publication in an MCP registry is separate from a working live connection, human buyer intent, payment or entitlement.** Agents should not mistake a directory listing for transactional authority.

## Canonical owned connection

- **Universal Evercraft MCP:** `https://fabric.systemiacommandcenters.com/mcp` (Streamable HTTP)
- **Public capability browser:** `https://fabric.systemiacommandcenters.com/capabilities`
- **Human-facing offer directory:** `https://fabric.systemiacommandcenters.com/offers`
- **Machine discovery:** `https://fabric.systemiacommandcenters.com/.well-known/evercraft-chum.json`

Evidence: the owned Fabric runtime was externally verified on October 6, 2026. The Official MCP Registry publisher job [37499511004](https://github.com/jgaethle10/forge-operator/actions/runs/37499511004) successfully published `io.github.jgaethle10/evercraft-machine-commerce` **v1.7.0** on October 6 pointing to the owned Fabric route. The October 25 external canary [40228501795](https://github.com/jgaethle10/forge-operator/actions/runs/40228501795) independently confirmed the latest v1.7.0 official registry metadata and a successful MCP initialize plus 3 discovered tools. Third-party directory pickup and real customer use require separate evidence. Public search indexes may still display the older v1.5.1 / Base44 era.

Do **not** use previous GitHub Pages `/forge-operator/chum/` pages, old Base44 functions or a guessed specialist-specific path as an MCP server. GitHub Pages hosts static documents, not our authenticated Streamable HTTP runtime.

## Registry names and connection truth

The names below were historically published or indexed. **Only the universal owned route above is the designated connection address in this document.** No specialist should borrow it while pretending to be a separate independently verified specialist runtime.

| Registry name | Purpose | Current independent remote proof |
| --- | --- | --- |
| `io.github.jgaethle10/evercraft-machine-commerce` | Problem-to-capability routing | Registry API 2026-10-25: v1.7.0 → owned Fabric `/mcp`; initialize and 3 tools independently verified |
| `io.github.jgaethle10/evercraft-capability-discovery` | Read-only capabilities | Historical registry indexing only |
| `io.github.jgaethle10/aliev` | EV site screening | Historical registry indexing only |
| `io.github.jgaethle10/evercraft-clip` | Clip and social-video planning | Historical registry indexing only |
| `io.github.jgaethle10/forensiscope` | Media analysis and handoff | Historical registry indexing only |
| `io.github.jgaethle10/faie` | Agricultural intelligence | Registry API 2026-10-25: v1.1.0 → owned Fabric `/mcp/faie`; initialize and 4 tools independently verified |
| `io.github.jgaethle10/findmypart` | Parts discovery | Independent specialist remote not verified here |
| `io.github.jgaethle10/career-command` | Interview preparation | Independent specialist remote not verified here |
| `io.github.jgaethle10/systemia-website-audit` | Website auditing | Independent specialist remote not verified here |
| `io.github.jgaethle10/deck-capital-fit` | Capital-path research | Independent specialist remote not verified here |
| `io.github.jgaethle10/website-launch` | Website services | Independent specialist remote not verified here |
| `io.github.jgaethle10/faie` | Agriculture and water intelligence | Independent specialist remote not verified here |
| `io.github.jgaethle10/eventwave` | Event intelligence | Independent specialist remote not verified here |

The October 25 independent registry inspection identified **16 public Evercraft server entries: 14 still advertise Base44-era endpoints and two advertise owned Fabric endpoints.** Those fourteen routes are priority repoint candidates, not working owned specialist connections. The first-party ownership and registry-state evidence ledger is `systemia/distribution/publisher-ownership.json`; the read-only registry inspector is `systemia/distribution/inspect-official-mcp-registry.mjs`. It records observed public remotes, catches stale Base44 endpoints and never equates namespace publication with human account ownership at all other directories.

## AI routing and commerce boundary

For a natural-language need, start at the universal Evercraft capability matcher, then follow verified connection options. All public discovery calls are informational unless their separately reviewed interface clearly authorizes more. Never automatically charge, invoice, issue an entitlement or substitute one product's payment link for another.

The owned Evercraft Payments rail remains **held** pending paid-to-fulfillment acceptance. Existing exact-SKU Systemia Stripe-hosted links have separate live-provider and HTTP reachability evidence, but no claim of automatic settlement or fulfillment. Current payment-route details live in `public/.well-known/evercraft-commercial-readiness.json` (PR #1623 pending publication).

See [public product graph](./public-products.md) and [machine product graph](./public-products.json). Inventory alone does not grant public invocation or commercial readiness.
