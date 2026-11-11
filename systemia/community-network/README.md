# Evercraft Network | Community Connection Layer v0.1

Status: REVIEW ONLY. No deployment, live jobs, member enrollment, payments, points, aid disbursement or partner referrals are claimed.

## Purpose

Connect existing Evercraft product discovery into a simple need-first front door while preserving the separate Evercraft Network Resilience connectivity product. The community layer asks a visitor what they need, returns evidence-labelled routes to existing owned pages, and distinguishes future capabilities that cannot yet accept real people or money.

The public review UI is in public/network/community/. The pure deterministic router is route-core.mjs and is shared with the browser. Its source-of-truth route catalog is routes.json; its tests live under systemia/community-network/.

## Systemia contract

This work is a Systemia mission CANDIDATE, not an accepted or dispatched mission. The public router reads only an allowlisted catalog. It does not call Systemia APIs, read private records, execute external actions or write an Intake Fabric candidate. A future actual request must move through Evercraft Passport authorization, Intake Fabric, a separate Systemia admission decision, and the Execution Gate before any consequential operation.

Relevant existing components:
- Opportunity Fabric: protected partner/team matching, not a public directory or permission to make introductions.
- Intake Fabric: authenticated admission for untrusted inbound content, with no automatic execution rights.
- Circles: human-directed professional relationship introductions, not an automatically endorsed member graph.
- Partners: existing interest page, where an email draft alone is not proof of submission.
- Rewards: discoverability is not a merchant offer, funded points or a redemption entitlement.
- Havenly and EPS: customer quotes are distinct from hiring.
- Contractor Cloud and Evercraft Home: public discovery must not be confused with live transactional access.
- Network Resilience: software transport continuity is a separate product, not the community directory.

## Honest state labels

discovery: existing public information page only, not confirmed runtime operation.
human_intake: existing human-directed page; the routing engine itself does not submit data.
planned: no link, no current application or benefit.

There is deliberately no active Havenly employment application, employer-vetted local job board, guaranteed creator payout or verified community-assistance referral. Those need independent operational evidence and a consent/revocation model before activation.

## Trust, privacy and routing rules

- Only same-origin, path-only links are accepted. External URLs, script links and traversal paths fail closed.
- Inputs stay in browser memory and are neither logged nor sent to a backend by this preview.
- Unknown needs remain unmatched, rather than inventing a provider.
- Emergency phrases do not get matched into a commercial directory.
- No public profile graph, private house address, source contact, earnings or identity is returned.
- Related-product edges are descriptive only. They cannot cause requests or automated cross-product enrollment.
- No sponsored ranking or paid referrals; no commissions or jobs are promised.
- Any future employment route must prove current hiring authority, availability, time validity, jurisdiction, lawful requirements and accurate submission receipt.
- Any future aid route must prove actual organization consent, eligibility and capacity, with privacy review.

## Acceptance steps

1. Node contract tests pass.
2. Human review of wording, destinations, products and consent boundaries.
3. Independently verify live origins and current services, including Havenly/Partners before promoting status.
4. Systemia admission and authorized adapter work for real submissions, with Passport scopes, durable dedupe, consent withdrawal and interaction receipts.
5. Deployment receipt and independent public readback before any public-live claim.

To run the bounded tests:

    node --test systemia/community-network/router.test.mjs

This branch intentionally does not modify the existing /network/ homepage or turn on the review UI in navigation. It must not be merged as a public launch without the listed gates.
