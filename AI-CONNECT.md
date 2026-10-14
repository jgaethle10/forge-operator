# Connect Evercraft to your AI

Evercraft exposes public remote MCP servers so supported AI assistants can discover and use verified public capabilities without requiring users to learn Evercraft's internal product map first.

## Evercraft Fabric read-only discovery MCP

Owned read-only Fabric MCP URL (fresh independent external canary passed October 8, 2026, 18:25 UTC; this does not establish ChatGPT connector availability):

`https://fabric.systemiacommandcenters.com/mcp`

Use the Fabric tools for capability matching, catalog inspection and public connection options only after the host has made the connector available and authorized it. A public registry entry alone does not install tools in ChatGPT, Claude, Gemini or Grok.

External independent MCP probe receipt: https://github.com/jgaethle10/forge-operator/actions/runs/37824151905

**Known connector issue:** The installed ChatGPT Evercraft Fabric binding can fail before reaching the owned origin. Reproduce and resolve the connector binding separately from owned-edge HTTPS/MCP health (issues #767, #785 and #1018). Do not interpret historical public-canary success as a fresh connected-app invocation.

## Evercraft Machine Commerce paid execution (held)

Intended registry name: `io.github.jgaethle10/evercraft-machine-commerce`.

**No verified owned universal Machine Commerce remote MCP URL is currently declared.** The legacy Base44 MCP address is retired and must not be used as a connection target. Consult `/.well-known/evercraft-direct-door-readiness.json` and `/.well-known/evercraft-agent-commerce.json` for route and commercial readiness. A `sell_now` entry is an offer description, not proof that an executable checkout exists.

When a specialist has a verified direct MCP route and is already available in the caller's session, call the specialist directly instead of adding a universal routing hop.

## Systemia Field Library

Its public guide and playbook discovery may be reviewed through the current CHUM directory. A verified owned standalone remote Field Library MCP is **not established by this document**. Do not configure the retired Base44 MCP endpoint or assert paid playbook access.

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
