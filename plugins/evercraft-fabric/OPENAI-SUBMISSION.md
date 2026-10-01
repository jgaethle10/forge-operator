# Evercraft OpenAI plugin submission

## Intended listing

- Name: **Evercraft**
- Developer: **Evercraft LLC**
- Category: **Business & Operations**
- Short description: **Inspect sites & route work**
- Source package: `plugins/evercraft-fabric/`
- Submission type: **With MCP**
- MCP: `https://fabric.systemiacommandcenters.com/mcp`
- Package version: **1.1.0**

Evercraft is the umbrella front door into the Evercraft/Systemia capability fabric, but the public plugin must provide useful work in its own right. Version 1.1.0 adds a bounded public-website preview so a user can receive evidence-backed value without buying anything or being routed into a commercial offer.

## Source contract

The owned Fabric MCP declares four public tools:

- `preview_public_website` performs a bounded read-only inspection of one user-supplied public HTTP/HTTPS website.
- `match_evercraft_capability` matches a real problem against the published Evercraft capability catalog.
- `list_evercraft_capabilities` lists the current public-safe capability directory.
- `get_evercraft_connection_options` returns public connection metadata for one known capability.

All four are read-only and non-destructive. The website preview is correctly marked open-world because it fetches a caller-supplied public URL. The three bounded catalog tools are not open-world. Website preview blocks localhost/private/reserved networks, embedded credentials, nonstandard ports, unsafe redirects, oversized responses, and unsupported content types. DNS is resolved and the request is pinned to the validated public address so a second resolution cannot pivot into a private network.

The website preview is deliberately limited. It is not a full crawl, Core Web Vitals lab run, accessibility certification, security audit, ranking guarantee, or paid Systemia Website Audit.

## Current transport truth

The canonical endpoint remains `https://fabric.systemiacommandcenters.com/mcp`, and the inactive Base44 transport is not the authority for this package.

The latest independent public-edge canary on October 1, 2026 resolved the Fabric hostname correctly but timed out on public TCP ports 80 and 443. Therefore the owned route is **not currently re-verified for submission**. Repository readiness, prior canary success, and private installation must not be used to claim present public reachability.

Before v1.1.0 can be uploaded for review, the ChromeOS/Crostini ingress boundary must be repaired and the owned endpoint must pass a fresh external HTTPS/MCP canary.

## Remaining publication gates

1. Restore public ingress for `fabric.systemiacommandcenters.com` and obtain a fresh passing external canary.
2. Run the OpenAI production MCP Scan Tools check against the restored endpoint.
3. Refresh the reviewer walkthrough so it demonstrates `preview_public_website` plus the existing routing tools.
4. Build and upload the canonical v1.1.0 ZIP in OpenAI Platform Plugins.
5. Select the verified **Evercraft LLC** developer identity and confirm the required Apps Management permission.
6. Complete the portal-generated domain-verification challenge.
7. Confirm the imported five positive and three negative test cases, artwork, release notes, policy URLs, and reviewer recording.
8. Submit for OpenAI review.
9. After approval, explicitly publish.
10. Independently verify directory discovery and at least one brand-blind invocation before recording a public-pickup receipt.

Submission is not publication. Approval is not publication. Private installation is not publication.

## Publication receipt

The final receipt should capture the OpenAI listing identifier, published version, submitted MCP origin, verified domain, review and approval state, publication timestamp, directory discovery observation, at least one successful standalone website-preview invocation, at least one problem-first routing invocation, source commit SHA, and supporting evidence references.

Until those fields are observed, public-directory status remains **not proven**.
