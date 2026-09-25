# Connect Evercraft to your AI

Evercraft exposes public remote MCP servers so supported AI assistants can discover and use verified public capabilities without requiring users to learn Evercraft's internal product map first.

## Universal Evercraft MCP

Evercraft Machine Commerce is the broad front door.

MCP URL:
https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp

Use it when the user's need could map to multiple Evercraft products or services. It exposes public discovery, pain matching, specialist routing, current offer inspection, and human-confirmed commercial continuations where those are actually wired.

## Systemia Field Library MCP

MCP URL:
https://base44.app/api/apps/6a54381e147576b18ac94d8f/functions/fieldLibraryAgentMcp

Use it when a contractor or home-service operator needs a practical playbook for estimating, cash flow, job costing, scope creep, change orders, scheduling, crew leadership, documentation, materials, equipment, safety, quality control, proposals, customer communication, reviews, referrals, or related field operations.

The Field Library MCP is read-only. It exposes public guide/playbook metadata and links, not paid playbook contents or PDFs.

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
