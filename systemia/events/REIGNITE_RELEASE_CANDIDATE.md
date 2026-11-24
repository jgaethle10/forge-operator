# REIGNITE | Unified, owned-only release candidate

**This branch is an integration review of existing work, not a production deployment.** It is stacked on website/layout PR #2553 and stages the exact canonical Events feasibility and readiness artifacts from separate draft PR #2548. It adds one deterministic cross-module test. No additional permanent CRM, status database, account system, host, or outside runtime has been created.

## One simple experience

1. `/reignite/`: independent public-facing concept only, no public launch or applications.
2. `/reignite/organizer/`: two next steps, review legitimate blockers and open the existing zone editor.
3. `/reignite/readiness/`: generated, read-only and unindexed snapshot of 25 canonical Events requirements with five highest-priority gates. **Not a live permit or museum-approval dashboard.**
4. `/reignite/layout/`: proposed, unsurveyed map; offline idea drafting; invited editor proposals; scoped privacy; owner planning review when connected to the private, owned service.

On a site-only branch, `/reignite/organizer/` disables its readiness link until the approved page is present and self-identifies as the unindexed source-only preview. In this integrated release candidate, the readiness route exists and can be enabled. Both behaviors are covered by tests.

## Explicit dependencies and provenance

- Website/layout source comes from PR #2553 (site feature branch at integration-branch creation: `cc0839b450a89bcfa8330f816adbab6de600cfb0`).
- Events review engine, readiness generator, generated HTML, docs and feasibility workflow came from PR #2548 (snapshot: `cf1a0713b370831b2a49e52684a0d0963241a020`). This branch has **one canonical working copy** of each path; they are not modified into competing implementations.
- This is a temporary **stacked integration** for verification. Coordinate original PR merge/rebase order; do not merge both sources blindly into main and create duplicate event code. Regenerate readiness HTML from the canonical generator after any upstream Events changes.

## Validation

    node --test systemia/opportunity-fabric/event-coordination.test.mjs
    node --test tests/reignite-site.test.mjs tests/reignite-layout.test.mjs tests/reignite-organizer.test.mjs tests/reignite-unified.test.mjs
    node systemia/opportunity-fabric/reignite-readiness-build.mjs --check

The unified test starts a local static HTTP server and checks real same-origin routes and the organizer's transition from disabled to valid readiness action. It checks byte identity against canonical safety rules and all authorization-denied flags. Existing layout HTTP integration tests cover invited editor proposal, privacy, CSRF, consent, rejection, owner review, and logout. CI runs on GitHub's native Node runner, without provisioning any new paid infrastructure.

## Actual production release holds

- Current museum-authorized venue/airfield access and legally valid event rights absent. No event date, booking, artist visa clearance, contracts, charity beneficiary agreement, parking, noise schedule, ticketing or public announcement authority.
- Current measured as-built, post-storm roof/shoring restrictions, exhibit positions, exits, utility routes, parcel and outdoor boundary required before any real venue-space assignment.
- Remotely connected multi-party editing requires a separately reviewed Evercraft-owned TLS reverse proxy, Identity/Passport and Interaction Ledger integration, secure invitation policy, deployment receipts, accessibility and hands-on mobile/browser QA. Current editor remains owner-local only.
- No public index or publicity of draft organizer/readiness/zone plans. The source snapshot reflects **no imported authenticated evidence**; it does not mean the museum or anyone else has done nothing.

**Merge/deploy rule:** No automatic merge, enabling tickets, sending outreach, booking artists, publishing live event announcements, or switching the site to a public production origin as a side effect of this integration. Request explicit release authorization and supply factual receipts first.