# Evercraft Fabric: independent developer quickstart

**Status: review-only developer proof, not a launched marketplace or an approved partner integration.**

This example deliberately imports **zero internal Evercraft code** and requires no npm packages, Evercraft account, API key, billing credentials, or access to Systemia. It lets an outside developer reproduce the exact public Fabric discovery flow using Node.js 20+ and the owned remote Streamable HTTP MCP.

## Two separate, existing layers

- **Owned remote Fabric:** `https://fabric.systemiacommandcenters.com/mcp`, documented by [Connect Evercraft Fabric](../../docs/commerce/connect-evercraft-fabric.md). Public read-only discovery uses existing machine-controlled canonical routes.
- **Operator CLI:** [draft #1236](https://github.com/jgaethle10/forge-operator/pull/1236), still unmerged, is an **optional local stdio tool registration and client-config export adapter**. Its review-only candidate validator does *not* add outside tools to the live Fabric catalog. Its security child [#1295](https://github.com/jgaethle10/forge-operator/pull/1295) has not yet been reconciled. Do not confuse local CLI registration with a remote provider relationship or paid listing.

## Try the standalone example

From the repository checkout:

```bash
node --test examples/operator-fabric/test/public-discovery.test.mjs
node examples/operator-fabric/public-discovery.mjs
```

The first command verifies behavior against a synthetic loopback-only MCP server (JSON and SSE response shapes plus fail-closed negatives). The second connects to the **real owned public Fabric domain** and tries:

1. MCP `initialize` using the established `2025-03-26` protocol contract.
2. `tools/list`, verifying the three published read-only discovery tool names.
3. `tools/call` with `match_evercraft_capability`, using a fixed, non-sensitive obsolete-part sourcing question.
4. `tools/call` with `get_evercraft_connection_options`, using the *exact* matched public capability ID.

The tool produces a human-readable JSON receipt: protocol, observed time, exact owned origin, matched public capability, whether a human offer URL is present, and explicit **false** flags for payment, checkout, execution authorization, publisher approval, and confirmed outside developer adoption.

This **does not open a buyer form**, initiate a checkout, run specialist execution, transfer files, store credentials, submit a partner listing, enroll a customer, or modify any remote state. It rejects redirects, noncanonical origins, malformed JSON-RPC responses, unexpected matches, and off-domain buyer URLs. Failure exits nonzero. The local synthetic server is a test harness, not proof of production health.

## If live access fails

Separate the failure by **origin and authority**:

- If `node --test` fails, inspect the standalone code and Node.js version first.
- If the public script fails, capture its status and timestamps, then compare with [the existing hourly Saban remote client probe](../../systemia/saban/discovery-path-probe.mjs) and [Fabric external canary](../../scripts/fabric-edge-external-canary.mjs). Do not build a second universal MCP or assume a page-200 implies verified deployment.
- If GitHub external probes pass but the *ChatGPT installed app* fails at `openai.org` with 404 or 429, treat the ChatGPT connector route separately under [existing issue #1018](https://github.com/jgaethle10/forge-operator/issues/1018). It is not evidence to move the owned canonical MCP to Base44.
- If a user elects an offer, the existing Evercraft Payments order, consent and provider-receipt path owns the payment. Developer discovery is never a payment record.

## Evidence ladder

| Stage | What proves it |
| --- | --- |
| Unit compatibility | Local simulated MCP server tests pass |
| Independent remote discovery | Real outside process reads the owned MCP, matches and gets options |
| Client adoption | A real unrelated developer installs/runs an approved configuration and confirms receipt |
| Third-party capability publishing | Publisher ownership, provenance, rights, permissions and Systemia/Fabric review |
| Commercial relationship | Mutually approved terms and customer purchase consent |
| Revenue | Provider-verifiable settled funds and fulfilled outcome |
| Revenue share | Simple pre-agreed baseline and demonstrable incremental attribution |

**This feature branch is a narrow developer proving ground.** It adds no recurring canary because the existing Saban job already checks the remote route hourly. Human approval, Systemia admission, CLI security integration and truthful external receipts remain required before anyone announces a marketplace, external SDK release, partner program or revenue.
