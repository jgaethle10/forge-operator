# Evercraft Fabric: independent developer quickstart

**Status: review-only developer proof, not a launched marketplace or an approved partner integration.**

**Invited developer?** Start with the [10-minute consent-first alpha guide](./ALPHA-README.md). Its two self-check commands print bounded receipts without uploading data or granting permissions.

This example deliberately imports **zero internal Evercraft code** and requires no npm packages, Evercraft account, API key, billing credentials, or access to Systemia. It lets an outside developer reproduce the exact public Fabric discovery flow using Node.js 20+ and the owned remote Streamable HTTP MCP.

## Two separate, existing layers

- **Owned remote Fabric:** `https://fabric.systemiacommandcenters.com/mcp`, documented by [Connect Evercraft Fabric](../../docs/commerce/connect-evercraft-fabric.md). Public read-only discovery uses existing machine-controlled canonical routes.
- **Operator CLI:** [draft #1236](https://github.com/jgaethle10/forge-operator/pull/1236), still unmerged, is an **optional local stdio tool registration and client-config export adapter**. Its review-only candidate validator does *not* add outside tools to the live Fabric catalog. Its security child [#1295](https://github.com/jgaethle10/forge-operator/pull/1295) has not yet been reconciled. Do not confuse local CLI registration with a remote provider relationship or paid listing.

## Try the standalone example

From the repository checkout:

```bash
node --test examples/operator-fabric/test/*.test.mjs
node examples/operator-fabric/independent-tool-client.mjs
node examples/operator-fabric/public-discovery.mjs
```

The first command verifies synthetic JSON/SSE remote MCP response handling and an independent local contributed MCP test server. The second spawns a real, least-authority local **test tool**, performs MCP initialize/tools/list/tools/call, and verifies the SHA-256 receipt returned from a disposable nonce. No remote publishing, customer information, or money is involved. The third command connects to the **real owned public Fabric domain** and tries:

1. MCP `initialize` using the established `2025-03-26` protocol contract.
2. `tools/list`, verifying the three published read-only discovery tool names.
3. `tools/call` with `match_evercraft_capability`, using a fixed, non-sensitive obsolete-part sourcing question.
4. `tools/call` with `get_evercraft_connection_options`, using the *exact* matched public capability ID.

The tool produces a human-readable JSON receipt: protocol, observed time, exact owned origin, matched public capability, whether a human offer URL is present, and explicit **false** flags for payment, checkout, execution authorization, publisher approval, and confirmed outside developer adoption.

This **does not open a buyer form**, initiate a checkout, run specialist execution, transfer files, store credentials, submit a partner listing, enroll a customer, or modify any remote state. It rejects redirects, noncanonical origins, malformed JSON-RPC responses, unexpected matches, and off-domain buyer URLs. Failure exits nonzero. The local synthetic server is a test harness, not proof of production health.

## Saban and boardroom proof boundaries

The PR workflow uses the existing Saban `systemia/saban/discovery-path-probe.mjs`, which is already scheduled hourly elsewhere. It requests real public remote MCP initialization, discovery and exact human offer option readback with two read-only HTTP client profiles. The workflow then runs this standalone outsider client from the same independent GitHub-hosted machine. The receipt artifact records the Saban results and independent outsider response. It creates **no scheduled duplicate**, checkout, payment or actual third-party partner.

The existing Evercraft AI Boardroom can evaluate the resulting **public-safe receipts** once its authenticated advisor-run worker is operational. On October 17 its latest two run requests were still `queued` and `held`; metadata-only gate #1342 is a verification mechanism, **not** evidence that the boardroom actually convened. Do not write synthetic opinions in place of identified model outputs or trigger unapproved model spending. Boardroom approval remains an explicit next gate.

The local contributed test tool is `examples/operator-fabric/local-test-tool.mjs`. It offers only `operator_probe_nonce`, a deterministic test-nonce hash. It has no remote network integration and must **not** be added to the live Fabric catalog without Systemia review and contributor identity/permissions approval.

## Third-party publishing rehearsal: separate signatures, scoped review, real local network transport

The October 17 lab addition models a **future** external publisher-to-operator handoff without placing an untrusted service inside production Fabric:

1. A mock contributor uses an **ephemeral Ed25519 publisher key** to sign a tightly limited capability candidate identifying only `operator_probe_nonce`.
2. A distinct mock reviewer signs the **exact candidate digest**, a one-hour-or-less expiry and `synthetic_loopback_only` scope. Signatures are verified before the test capability appears in inventory. Neither key grants real organizational, passport, hosting, production, or payment privileges.
3. `reviewed-http-bridge.mjs` listens exclusively on `127.0.0.1`, exposes a temporary HTTP MCP test endpoint and only advertises that one safe capability while the simulated review is valid.
4. A separate independent HTTP MCP client enumerates that inventory and remotely invokes the capability. The lab bridge launches the already tested **separate stdio MCP test tool process** and verifies a disposable nonce SHA-256 receipt.
5. Revoking review immediately empties the exposed inventory and rejects further calls. Forged signatures, changed scopes, self-review, expired reviews, extra tool names, public binding, and disallowed origins are negative tests.

Run all scenarios with `node --test examples/operator-fabric/test/*.test.mjs`. The test suite starts and closes its own loopback service. It never contacts a prospective partner, installs a tool from the internet, modifies the actual Fabric catalog, exposes ports publicly, approves production rights, bills anyone or proves a real human reviewer signed anything. The test only proves the feasibility of the governance and MCP *mechanics*.

**Current evidence ladder:** owned Fabric remote read-only discovery live verified by Saban and an independently written Node client; a test-only contributed MCP tool invoked over local stdio; a separately reviewed candidate routed over a *loopback* MCP HTTP bridge. Missing is a real outside publisher and authorized public installation/remote invocation. Keep this branch draft until Systemia admits the broader Operator Exchange mission and release authorization is explicit. Do not attach these lab keys/signatures to Evercraft Passport or use them as proof of human approval.

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
