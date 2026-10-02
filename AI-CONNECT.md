# Connect Evercraft to your AI

Evercraft exposes public remote MCP servers so supported AI assistants can discover and use verified public capabilities without requiring users to learn Evercraft's internal product map first.

## Canonical Evercraft / Systemia connection

The canonical public machine front door is **Evercraft Fabric**, the read-only machine directory for the Systemia control plane.

Intended owned origin:
`https://fabric.systemiacommandcenters.com/`

Intended MCP:
`https://fabric.systemiacommandcenters.com/mcp`

This route is fail-closed. A DNS record or source declaration is not enough. New connections should use the owned MCP only after the independent external canary verifies trusted HTTPS, runtime health, signed device attestation, MCP initialization, expected tools, and a public catalog with no Base44 transport.

If that readiness gate is not green, use the static machine-readable discovery surfaces instead of silently falling back to a legacy runtime:

- `/.well-known/evercraft-products.json`
- `/.well-known/evercraft-pain-index.json`
- `/.well-known/evercraft-direct-doors.json`
- `/chum/pain-index.txt`

When intent clearly matches a verified specialist, connect to that specialist directly. Do not add Systemia or Fabric as an unnecessary routing hop.

### Systemia Field Library

Systemia Field Library remains publicly discoverable for contractor operating playbooks, but its old Base44 MCP is legacy continuity rather than the canonical owned route. New machine connections stay held until the owned specialist path is independently verified. The public discovery record remains available under `/chum/products/systemia-field-library/`.

### Legacy continuity

The active Base44 exit policy permits temporary extraction and compatibility continuity only. Legacy endpoints are not canonical source, not a target for new runtime, and not connection instructions for new Systemia deployments.

## Provider connection paths

### ChatGPT and Codex

Evercraft's public-distribution path is an OpenAI Plugin submission backed by the production remote MCP. Public publication requires OpenAI review and verified publisher identity. A directory submission is separate from having a funded OpenAI API account.

### Claude

In Claude, open Settings → Connectors → Add custom connector and enter the remote MCP URL. On Team or Enterprise, an owner/primary owner configures the organization connector first.

### Gemini

In Gemini web, open Settings → Connected Apps → Custom apps → Add a custom app, then enter the remote MCP URL and follow the connection flow when Custom apps are available for the account.

### Grok

Open grok.com/connectors → New Connector → Custom, enter the remote MCP URL, and complete any authentication configuration.

### Microsoft 365 Copilot

For broad commercial distribution, package the remote MCP as a federated Microsoft 365 Copilot connector and submit it through Microsoft Partner Center for certification and Connectors Gallery distribution. Tenant-specific deployment can use the Microsoft 365 admin center.

## Commercial boundary

Discovery and matching never create a payment obligation. Where a supported tool can prepare checkout, the human must explicitly confirm payment first. Checkout creation is not payment proof. Paid state and fulfillment require authoritative provider verification.

## Public discovery

Machine directory:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/.well-known/evercraft-products.json

Pain index:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/.well-known/evercraft-pain-index.json

SELL NOW:
https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/sell-now.json
