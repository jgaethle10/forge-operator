# Evercraft OpenAI plugin submission

## Intended listing

- Name: **Evercraft**
- Developer: **Evercraft LLC**
- Category: **Business & Operations**
- Short description: **Inspect public websites**
- Source package: `plugins/evercraft-fabric/`
- Submission type: **With MCP**
- MCP: `https://fabric.systemiacommandcenters.com/mcp/openai`
- Package version: **1.1.0**

Version 1.1.0 is deliberately narrow. The public OpenAI endpoint exposes one independently reviewable operation: `inspect_public_website`.

The broader Evercraft Fabric directory remains available to Evercraft's own systems and web surfaces, but it is not exposed through the submitted OpenAI MCP endpoint. This avoids using a generic discovery or operation-selection mechanism to unlock unreviewed functionality.

## Public tool contract

`inspect_public_website` inspects one public website that the user owns, administers, or has permission to review. The tool requires explicit authorization in its input and returns bounded observed HTTP and on-page signals with explicit limitations.

It is read-only, non-destructive, and open-world. It blocks localhost/private/reserved networks, embedded credentials, nonstandard ports, unsafe redirects, oversized responses, and unsupported content types. DNS is resolved and the outbound request is pinned to the validated public address to reduce DNS-rebinding risk.

The tool does not perform a full crawl, Core Web Vitals lab test, accessibility certification, security audit, penetration test, ranking guarantee, payment, purchase, or website modification.

## Commerce and advertising

The public plugin does not sell, promote, initiate, or facilitate purchases of digital products or services. It does not expose Evercraft pricing or checkout through the submitted MCP endpoint and is not intended as an advertising vehicle.

## Current transport truth

The canonical submission endpoint is `https://fabric.systemiacommandcenters.com/mcp/openai`. The inactive Base44 compatibility transport is not the authority for this package.

The latest independent public-edge canary on October 1, 2026 resolved the Fabric hostname correctly but timed out on public TCP ports 80 and 443. The owned route is therefore **not currently re-verified for submission**.

Before v1.1.0 can be uploaded for review, the ChromeOS/Crostini ingress boundary must be restored and a fresh external canary must prove the purpose-specific OpenAI endpoint exposes exactly the reviewed tool set and successfully executes the authorized inspection canary.

## Remaining publication gates

1. Restore public ingress for `fabric.systemiacommandcenters.com`.
2. Obtain a fresh external canary proving `/mcp/openai` exposes exactly `inspect_public_website` and that an authorized Evercraft-owned site inspection succeeds.
3. Run the OpenAI production MCP Scan Tools check against `/mcp/openai`.
4. Refresh the reviewer walkthrough to demonstrate the v1.1.0 website-inspection flow.
5. Build and upload the canonical v1.1.0 ZIP in OpenAI Platform Plugins.
6. Select the verified **Evercraft LLC** developer identity and confirm the required Apps Management permission.
7. Complete the portal-generated domain-verification challenge.
8. Confirm the five positive and three negative review cases, artwork, release notes, policy URLs, and reviewer recording.
9. Submit for OpenAI review.
10. After approval, explicitly publish and independently verify directory discovery and invocation.

Submission is not publication. Approval is not publication. Private installation is not publication.

## Expansion after approval

The Evercraft brand can expand beyond website inspection by adding real capabilities as explicit, independently reviewable tools. The public plugin should not use a generic dispatcher to expose operations that OpenAI has not scanned and reviewed.
