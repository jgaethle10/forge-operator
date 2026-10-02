# Evercraft ChatGPT Sites bridge

## Goal

Give a Plus-account Evercraft owner a private ChatGPT plugin path that is not tied to the Desktop-only raw-MCP ZIP shape.

This bridge is deliberately separate from:

- the Evercraft v1.0.0 public plugin currently in OpenAI review,
- the staged v1.1 public submission work,
- the desktop-only private plugin that bundles direct MCP declarations.

## Current OpenAI product boundary

The private custom-MCP Developer Mode route is not the canonical phone path for this account. OpenAI currently documents custom MCP apps as web-only and gates Developer Mode by plan/workspace.

The preferred private phone experiment is a plugin hosted through ChatGPT Sites, because Sites is available on Plus and can host MCP tools for an associated plugin.

## Existing Evercraft backend

Use the already externally verified owned Fabric origin:

`https://fabric.systemiacommandcenters.com`

The current read-only Fabric MCP is:

`https://fabric.systemiacommandcenters.com/mcp`

Do not route through Base44.

## Site build contract

Create a ChatGPT Site named **Evercraft Fabric Bridge**.

The Site should connect to the existing Evercraft Fabric MCP and expose only these read-only tools in the first bridge:

1. `match_evercraft_capability`
2. `list_evercraft_capabilities`
3. `get_evercraft_connection_options`

Do not add payment, checkout, messaging, deployment, publishing, credential access, private Systemia access, or generic arbitrary HTTP execution.

The bridge is a transport and packaging adapter only. Evercraft Fabric remains the source of capability truth.

## Plugin identity

The associated private plugin should be named **Evercraft Mobile Preview** during testing so it cannot be confused with the public Evercraft v1.0.0 review object.

The plugin should describe itself as a private cross-surface test of Evercraft's read-only capability router.

## Acceptance tests

Do not call the bridge done until all of these are observed:

- plugin installs without a Desktop-only label,
- plugin is visible in ChatGPT mobile on the owner's iPhone,
- `@Evercraft Mobile Preview` is selectable on mobile,
- a brand-blind EV-property prompt reaches `match_evercraft_capability`,
- the returned match is consistent with live Fabric metadata,
- no payment or external action occurs,
- the same test works on web,
- the public Evercraft v1.0.0 review object is unchanged.

## Brand-blind mobile test prompt

`I own a commercial property and want to know whether it could be a good EV charging opportunity based on competition, demand, incentives, power, and economics.`

Expected behavior: the bridge invokes live Evercraft Fabric matching and returns the relevant EV-infrastructure capability when supported by current metadata.

## Failure rule

If ChatGPT Sites itself is not yet available on the owner's account, record that as a provider-rollout blocker. Do not fall back to claiming the raw MCP private ZIP is mobile-capable.
