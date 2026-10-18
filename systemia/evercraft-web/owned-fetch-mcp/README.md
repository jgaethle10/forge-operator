# Evercraft Web: owned Fetch MCP candidate

This is an owned, **loopback-only, bearer-authenticated** replacement *candidate* for the read-only public-web Fetch slice formerly described through Base44. It does **not** replace the currently published `io.github.jgaethle10/evercraft-web` Registry endpoint; the public Base44 function still requires retirement and independent acceptance.

## Scope

- Stateless Streamable HTTP MCP: `POST /mcp` supports `initialize`, `tools/list`, `tools/call`, `ping`, and `notifications/initialized`.
- Explicit tools: `get_web_capabilities` and `fetch_url`.
- Single-page read-only public HTTP(S) GET, bounded to 256 KiB response and 24,000 characters extracted text. HTTPS uses original-hostname certificate verification plus DNS-pinned connection to a validated public IPv4 address; every redirect is revalidated. Private targets, userinfo, nonstandard ports, HTTPS downgrades, binary types, compressed encodings, unlimited redirects and browser `Origin` calls are denied.
- Bounded local service traffic: at most two simultaneous authenticated MCP requests and 60 requests/minute by default (operator-configurable within hard limits). Over-budget calls return HTTP 429 with no tool execution.
- Text/HTML evidence: source URL with query removed, UTC retrieval time, HTTP status, content SHA-256 and distinct receipt SHA-256. No credentials, cookies, browser execution, JavaScript, Search, autonomous browsing, paying, messaging, or third-party private endpoints.
- This first release holds IPv6 outbound connections until shared policy and IPv4-mapped / NAT64 safety have independent proofs.

## Local candidate only

```bash
EVERCRAFT_WEB_MCP_ACCESS_TOKEN="$(openssl rand -hex 24)" node systemia/evercraft-web/owned-fetch-mcp/server.mjs
node --test systemia/evercraft-web/owned-fetch-mcp/server.test.mjs
```

It binds only to `127.0.0.1` by design, requiring an operator-managed private token. Its `/health` response says `production_ready:false`. Do not place it behind a public reverse proxy or publish a registry manifest as part of this candidate.

## Governed private Compute integration

The candidate is registered as `systemia.evercraft-web-fetch-mcp.v1` on NodeSeed/Evercraft Compute. Yard can admit it under an existing authorized capacity lease, verify `/v1/services/{service_id}/health`, bind its immutable deployment receipt and invoke `YardOperator.invokeWebFetch(deploymentId,{url})`. Compute enforces that invocation's private lease token and forwards it through the MCP worker's **same bearer-protected, rate-limited local transport**. Only content and SHA evidence are returned to the authorized operator. The Compute ledger holds hashes and byte counts, not the worker bearer or response content.

This class is **not included** in the general-purpose public HTTP bridge allowlist. Yard's `verifyRoute` deliberately returns `ok:false, state:'public_route_unbound'` even when the private service health is green, and explicitly flags an accidental public route attachment.

To reproduce the controlled proof on a review environment:

```bash
node --test systemia/evercraft-web/owned-fetch-mcp/server.test.mjs
node systemia/yard/web-fetch-owned-resident.proof.mjs
node --test systemia/evercraft-web/owned-fetch-mcp/live-smoke.test.mjs
```

The [October 18 CI proof](https://github.com/jgaethle10/forge-operator/actions/runs/39091570469) passed eight protocol/security tests, the leased Yard-to-Compute-to-MCP real-HTTPS Fetch and private-target denial, and an independent runner-local MCP public HTTPS smoke. It ran on temporary GitHub compute; **no persistent production Evercraft node, public origin, published Registry update or customer adoption was proven.**

## Release gates

1. Independent code/security review, especially SSRF (DNS, redirects, IPv4-mapped and parser edge cases), TLS, resource limits, origin policy and rate/concurrency controls.
2. Existing Systemia canonical mission admission, owned runtime build, dedicated process identity, trusted secret-file binding and proper Yard lease.
3. External cold-client test via **actual authorized deployed origin**: `initialize` -> `tools/list` -> owned, permissioned `fetch_url`; negative private-target and redirect probes.
4. Compare tool schemas and full v0.3 contract with the historical Evercraft Web MCP. `fetch_urls`, `route_web_request`, Search and Browser are **not implemented here** and must not be claimed live.
5. Observed read-only operator/buyer experience, provenance and uptime, plus safe rollback. Only after these approvals may separately version and modify `mcp/evercraft-web/server.json` / `mcp-registry/evercraft-web.json`, republish Official Registry and request a Glama health retest. No blind redirection to Fabric's unrelated capability router.
6. RIVET/AliEV legal hold remains unaffected; this work grants no multi-product publication, contract, payment or external outreach authority.

This candidate avoids another Base44 spend while preserving the honest distinction between source/tests and deployed service.