# Evercraft OpenAI approval launch gate

Date: 2026-09-30  
Owner: Evercraft / Systemia  
Status: active launch doctrine while Evercraft v1.0.0 is under OpenAI review.

## Two lanes must remain separate

### Lane A: OpenAI-reviewed candidate

OpenAI is reviewing Evercraft **v1.0.0**.

The reviewed package uses the compatibility MCP origin:

`https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp`

That exact version may be published after approval only when the reviewed-candidate checks below pass.

### Lane B: owned Fabric promotion

Current engineering is ahead of the reviewed candidate. Evercraft v1.0.3 points at the owned Fabric origin:

`https://fabric.systemiacommandcenters.com/mcp`

This lane is **not** a substitute for v1.0.0 during the active review. As of 2026-09-30 the truthful external canary resolves the owned origin but times out from a clean GitHub runner before completing public HTTPS/MCP verification. Keep v1.0.3 held until the owned edge produces a verified external receipt.

An MCP origin change must never be smuggled into the already-reviewed launch.

## Approval trigger

When OpenAI reports that v1.0.0 is approved:

1. Confirm the approval applies to Evercraft v1.0.0.
2. Do not cancel the approval merely because a newer internal package exists.
3. Re-run the exact reviewed-candidate checks below before telling the founder to publish.
4. If any reviewed-candidate check fails, hold publication and repair or roll back the live server while preserving the reviewed contract.
5. If all checks pass, surface the OpenAI portal **Publish** action as the remaining launch gate.

## Reviewed-candidate pre-publish checks

Require all of the following:

- MCP initialize succeeds using the reviewed MCP URL.
- MCP `tools/list` succeeds.
- `match_offer` remains read-only and reports `payment_created: false` and `external_action_taken: false`.
- The five submitted positive cases still route sensibly:
  - oversized video/transcript/timestamps -> ForensiScope
  - obsolete machine part -> FindMyPart
  - commercial EV charging site -> AliEV/RIVET
  - local-business website conversion audit -> Systemia Website Audit
  - ambiguous online-business problem -> bounded match or ambiguity result
- The submitted generic-weather negative case returns no forced Evercraft commercial recommendation.
- Payment-pressure and private-Systemia negative cases create no payment and take no consequential action.
- Homepage/website, support, privacy and terms URLs from v1.0.0 remain publicly reachable without private repository authentication.
- The reviewer walkthrough remains accessible to anyone with its review link and does not require a reviewer login.

## Publish

Approval does not equal publication. Once the reviewed-candidate checks are green, publish the approved v1.0.0 from the OpenAI plugin submission portal.

Do not announce directory availability until publication itself is verified.

## Immediate post-publish verification

After Publish:

1. Confirm the plugin appears through its direct directory URL or exact-name search as **Evercraft**.
2. Install/use the public listing from a normal user path rather than developer/private mode.
3. Run MCP initialize and `tools/list` through the public plugin path.
4. Run at least:
   - one submitted positive `match_offer` case,
   - the generic-weather no-fit case,
   - a payment-pressure case confirming no charge or payment claim,
   - a private-Systemia/consequential-action case confirming no secret exposure or side effect.
5. Confirm all public listing links resolve.
6. Record the listing URL, published version, publication timestamp, first successful tool receipt and any observed distribution state.

## Rollback / hold conditions

Do not publish, or remove the published version if necessary, when:

- the reviewed MCP endpoint is unavailable;
- tool metadata materially disagrees with the reviewed contract;
- a read-only discovery tool creates a checkout, payment, external message, deployment or other consequential action;
- support/privacy/terms surfaces are inaccessible;
- the public listing misrepresents the version or provider;
- OpenAI supplies a blocking condition or asks for changes.

## v1.0.3 owned-Fabric promotion gate

v1.0.3 is a separate promotion project. Require a clean external receipt for `fabric.systemiacommandcenters.com` with:

- trusted public HTTPS;
- public homepage/support/privacy/terms availability;
- MCP initialize;
- MCP `tools/list`;
- bounded `tools/call`;
- no compatibility or local-host fallback;
- truthful `verified: true` canary state.

Until that exists, v1.0.3 remains staged and must not block publication of an independently healthy, approved v1.0.0.

## Standing monitoring

The existing hourly AI Distribution Push condition watch owns OpenAI review-status checks. On approval it must validate the exact v1.0.0 reviewed-candidate lane above and report owned v1.0.3 status separately.
