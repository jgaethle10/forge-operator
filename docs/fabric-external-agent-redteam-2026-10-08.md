# Evercraft Fabric: independent external-agent red-team handoff

**Date:** 2026-10-08  
**Status:** REQUEST FOR INDEPENDENT TEST, NOT AN EXTERNAL VERIFICATION RECEIPT  
**Routing:** Systemia intake/coordination first. Canonical issues: #767 (owned MCP / ChatGPT transport), #785 and #1018 (installed ChatGPT binding), #971 (checkout transport), #1162 (IBM i first paid offer).

## Purpose

Find the *first broken boundary* in the sequence:
**discovery → availability → selection → execution → authorized payment**.

Evercraft's publication/readiness records must not self-certify an independent client. Results from an outside machine and from a hosted assistant's connected-tool session must be recorded separately. Directory publication and historical canaries do not count as a fresh invocation.

## Scope for an independent tester (Lux or another authorized collaborator)

**Safe test target:** read-only owned Fabric MCP, previously independently verified on 2026-10-06:

`https://fabric.systemiacommandcenters.com/mcp`

Current production availability is **unverified by this document**. Public checks may be performed without requesting credentials. Keep volumes minimal. No load testing, scanning of private ports, fuzzing, customer records, secrets, account creation, checkout, purchase, billing or production mutation without separately scoped permission.

### Test A: public-network truth (outside Evercraft)

1. Record UTC time, independent tester-controlled environment and egress provider at coarse granularity. Save DNS resolution, valid HTTPS certificate, and HTTP result for `/health`. Never publish private IPs, device identifiers or tokens.
2. POST standard JSON-RPC MCP `initialize` to `/mcp`, with `protocolVersion: "2025-03-26"`, `capabilities: {}`, and a harmless clientInfo. Capture status, content type and redacted JSON response. A successful GET of a marketing page is **not** an MCP initialization.
3. POST `tools/list` and capture the returned names and read-only safety annotations. Expected Fabric discovery tools include `list_evercraft_capabilities`, `match_evercraft_capability`, and `get_evercraft_connection_options`.
4. POST read-only `tools/call` with `match_evercraft_capability`, using a realistic brand-blind issue, for example: "We have IBM i 7.4 workloads and need to understand the support-transition risks before an upgrade." Confirm a structured result, evidence/state boundary and no order, payment or private access.
5. Where the matching `public_id` is valid, call `get_evercraft_connection_options`. Verify advertised URLs are consistent with current readiness. Do not treat `start_url: null` or a static directory as an executable checkout.

A failure must retain its stage, endpoint path, HTTP status, redacted error, timestamp and independent environment description. Never substitute a synthetic green result.

### Test B: connected-host boundary (separate from A)

1. In ChatGPT or another authorized assistant with Evercraft configured, record *which Evercraft tools actually appear in the session's tool inventory*.
2. Prompt with a **brand-blind** problem. Record whether the agent attempted a tool, which one it selected, and the exact sanitized host-level failure or success.
3. If the host reports an SSE error from `openai.org`, label it **host/connector transport unresolved**, not Fabric-origin down. Compare with Test A's owned endpoint result and current plugin configuration.
4. Do not ask the model to reveal private chain of thought. Use observable tool inventories, invocation traces and public results.

### Test C: commerce boundary (not authorized by this handoff)

Do **not** create a real order or spend funds as part of A/B. The IBM i offer remains gated by #1162 and Evercraft Payments/Raven Nexus issue #971. A later, separately authorized buyer transaction must show explicit buyer consent, canonical PaymentOrder, settlement-provider confirmation, entitlement, fulfillment and immutable correlation. Simulated/test-mode orders are not first-dollar proof.

## Receipt template

Record one receipt per independent environment and probe:

```json
{
  "schema": "evercraft.fabric.external-agent-redteam.v1",
  "observed_at_utc": null,
  "tester_affiliation": "external_independent_or_internal",
  "environment": "coarse description only",
  "target": "https://fabric.systemiacommandcenters.com/mcp",
  "stage": "dns_tls|mcp_initialize|tools_list|tools_call|connected_host|payment",
  "http_status": null,
  "passed": false,
  "host_tool_available": null,
  "tool_selected": null,
  "redacted_evidence_ref": null,
  "failure_reason": null,
  "purchase_or_mutation_performed": false
}
```

**Evidence quality:** independent measured result > internally executed canary > generated manifest > planned route. Independent result may disagree with old receipts without proving an entire service is down.

## Completion decision

- Test A green and B red: fix installed-client configuration/authorization, not owned-edge runtime.
- Test A red: triage owned public ingress, transport, release, or endpoint behavior before directory expansion.
- A and B green but no qualified outside buyer: distribution/selection and procurement remain open.
- Payment success requires provider reconciliation and delivered work, not checkout creation.

No external outreach has been performed by creating this handoff. The collaborator must be asked separately before testing.
