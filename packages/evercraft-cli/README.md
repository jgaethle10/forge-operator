# Evercraft Operator CLI

**Developer preview v0.1.0-dev.** This package is part of a draft pull request, is **private/unpublished**, and is **not a live marketplace**. This is an entry point for operators to inspect and explicitly test locally installed Model Context Protocol (MCP) tools.

## Requirements and 90-second local demonstration

- Node.js 20 or newer
- A local working copy of the [Forge Operator repository](https://github.com/jgaethle10/forge-operator), including the proposed CLI branch
- No Evercraft credentials, cloud account, package installation, checkout, or token required for the fixture

From the repository root:

```bash
cd packages/evercraft-cli
node cli.mjs doctor
node cli.mjs capability validate examples/capability-candidate.json
node cli.mjs tool add examples/local-demo-tool.json
node cli.mjs tool list
node cli.mjs tool inspect example.math
node cli.mjs tool probe example.math --run
node cli.mjs tool call example.math sum --input '{"a":2,"b":5}' --approve
npm test
```

Expected fixture result: the MCP tool \`sum\` returns text \`7\`. The fixture deliberately does not contact any remote service. If the package has been approved, reviewed and published in a later release, the bin name is intended to be \`evercraft\`. **At present use \`node cli.mjs\`**, not \`npm install -g\` from an untrusted source.

## A third-party operator can register a tool

Create a JSON file describing an executable that the operator **already installed and trusts**:

```json
{
  "id": "builder.tools",
  "name": "Builder's Tools",
  "description": "Tools I maintain for my own workstation",
  "transport": "mcp-stdio",
  "command": "node",
  "args": [
    "/absolute/path/to/my-server.mjs"
  ]
}
```

Then run \`node cli.mjs tool add ./my-tool.json\` to store metadata. That does not execute or validate the server. \`tool inspect builder.tools\` shows the exact program and arguments before the operator intentionally starts it. \`tool probe builder.tools --run\` starts the process to enumerate advertised MCP tools. \`tool call builder.tools TOOL_NAME --input '{"key":"value"}' --approve\` explicitly asks for a specific MCP tool call and prints the input being sent.

The CLI uses a per-user JSON store at \`$XDG_CONFIG_HOME/evercraft/operator-tools.json\`, or \`~/.config/evercraft/operator-tools.json\`. It passes a minimal environment instead of inheriting every API key. This is **not a sandbox**: the subprocess can access resources available to the operating-system user, including local files and network. Only run tools you trust, ideally in a separate least-privilege OS/container environment. Do not add downloaded manifests blindly.

## Proposing an outside capability (offline, review-only)

Contributors can prepare a versioned public-safe candidate manifest using `examples/capability-candidate.json`. Run `node cli.mjs capability validate ./my-candidate.json`. It checks the allowlisted shape, HTTPS public references, declared transport, authorization mode, side-effect category, and proposed commercial model. It prints a SHA-256 manifest fingerprint and **candidate_unverified** readiness with `execution_granted`, `publication_granted`, and `commerce_granted` all false.

The example is **fictional**. Passing validation does not verify the publisher, URLs, functionality, identity, security, price, consent, use rights, or actual revenue. Do not include access tokens, private endpoints, client data, live checkout claims or other secrets. Submit a proposed manifest for human review via the existing GitHub pull-request process, not directly into the public Fabric directory. The optional commercial model `paid_proposed` is documentation of intent only, never payment authority.

## What is implemented

| Ability | Preview state |
| --- | --- |
| Local manifest registration and inspection | Implemented |
| Explicit subprocess start + stdio MCP initialize/tools/list | Implemented |
| Explicit named tools/call with user-supplied JSON | Implemented |
| No-shell spawning, bounded output and timeout | Implemented, not a security sandbox |
| Offline external capability candidate manifest validation | Implemented, never grants trust or commerce |
| Third-party remote HTTP MCP/OAuth | Not implemented |
| Global/public tool publication, discovery ranking | Not implemented |
| Signed supply chain, per-tool policy, revocation | Not implemented |
| Workspaces, versioned API conformance and multi-agent auth | Not implemented |
| Evercraft Payments, order verification, license contracts, payouts | Not implemented |
| Discord, Facebook, Skool automatic posting or account linking | Not implemented |

## Operator Exchange architecture

The community must have genuine noncommercial value. Discord can host builders and technical support, Facebook can reach operational businesses, and Skool can be considered later for structured learning. Those channels can invite users to an owned Operator Exchange without creating fake participation or scraping members. **Fabric** is proposed as a public-safe discovery and interoperability layer, not proof of a working commercial tool. Capability listings need trusted authorship, source and version, clear claims, connection health, API permissions, documented pricing where applicable, and verifiable human URLs.

**Evercraft Payments** must be a distinct, opt-in commercial workflow with exact price and terms, authenticated buyer consent, provider-verified settled payment and fulfillment, and a transparent fee schedule. Revenue share requires a mutually agreed, easily understood baseline and evidence of incrementally attributable value. No claim of payouts or monetized tools exists at this stage.

## Before publishing or merging

- Systemia canonical admission/deduplication for \`evercraft-operator-exchange-001-20261014\`.
- Independent peer review of security, path handling, manifest semantics, trust and abuse controls.
- Test from a fresh outsider machine, with no Evercraft private credentials.
- Verify Fabric production health, public discovery URLs and read-only catalog before advertising a connector.
- Define distribution governance, moderator roles, member consent, referrals and privacy policy.
- License and package audit, CI, reproducible artifacts and version provenance.
- Commercial checkout, payout and attribution review only after separate written approval.

**No code here authorizes automatic purchases, third-party tool execution, remote publishing, member invitations or outbound messaging.**
