# mcprush Machine Commerce: isolated marketplace connection

**Status:** Source-only preparation. A GitHub branch, unmerged PR, or green test does not mean this route is deployed, verified, priced, approved, or monetized.

## What the code changes

The existing public and ChatGPT endpoint stays at `https://fabric.systemiacommandcenters.com/mcp` with no new token requirement.

A separate route is reserved at `https://fabric.systemiacommandcenters.com/mcprush/mcp`. This URL does **not** become live until the change is reviewed, merged, deployed to the resident Fabric service, and independently probed.

- The route is disabled by default and returns HTTP 503 if `MCPRUSH_MACHINE_COMMERCE_TOKEN` is absent.
- With a token configured, requests missing the exact `x-mcprush-token` value receive HTTP 401. Bearer credentials are deliberately not accepted.
- Authorized calls use Fabric's existing Streamable HTTP JSON-RPC `initialize`, `tools/list` and read-only capability-discovery tools. No purchase, entitlement, private-data, write action, or Machine Commerce specialist execution is implemented by this change.
- The secret is never returned in health output, logs added by this change, or MCP responses.
- The code does not switch DNS, Caddy, routers, OpenAI plugin endpoints, payment rails, provider listings or credentials.

## Owner + operator activation, after merge and a trusted deployment receipt

1. In mcprush, finish ownership claim for **Evercraft Machine Commerce** and select **Yes** for the gateway, only if its agreements and monetization terms are acceptable. Do not replace the current shared `/mcp` URL.
2. Use `https://fabric.systemiacommandcenters.com/mcprush/mcp` as **Your endpoint**. In "How your endpoint reads the token", keep `x-mcprush-token`.
3. Use **Get the token**. mcprush's docs say the gateway credential is `mgw_…` and is shown once; securely store it as `MCPRUSH_MACHINE_COMMERCE_TOKEN` in the resident Fabric service environment, not in Git, chat, screenshots, CI stdout, shell history, or command arguments. Restart through the existing controlled updater. Never put the token on the public website.
4. Confirm the resident service actually picked up the changed code and secret. `/health` must show `mcprush_machine_commerce_token_configured: true`, with a valid deployment receipt. Health doesn't prove a gateway handshake.
5. Independently test rejection without a token (401), rejection with an incorrect token (401), successful authorized `initialize` and `tools/list`, and unchanged direct `/mcp` behavior.
6. Use mcprush **Check the endpoint**, which requires the token and five successful probes within its time limit. Treat its published verification state as external evidence, not as automatically inferred by this repository.
7. Before enabling a **paid** plan, reconcile the actual listed tools and customer deliverables. At this point, the protected route still only exposes **free-to-browse read-only discovery**. Do not market it as paid Machine Commerce order placement, payment processing, automatic transactions, access to a specialist, or fulfilled services.
8. Only after merchant terms, support/privacy/terms, buyer deliverables, payout onboarding, security, independent verification, and pricing review pass should the owner choose a paid plan and submit it for review. Stripe Connect payout setup and approval happen in mcprush under the owner's authenticated account.

## Rollback

If the marketplace verification or specialist implementation fails, remove the marketplace token from the service environment and restart with the controlled updater; the marketplace route returns 503 while the direct `/mcp` route continues normally. Do not change the canonical OpenAI endpoint or payment rails to work around a failed mcprush check.

## Tests

```sh
node --test tests/fabric-mcprush-gateway.test.mjs
node --test tests/fabric-local-runtime.test.mjs
```

The first suite checks disabled state, missing/wrong token, forced rejection of Bearer authentication, five authenticated discovery calls, absence of secret exposure, and preserved direct MCP access. These are source-level checks and not proof of production release or customer payment.
