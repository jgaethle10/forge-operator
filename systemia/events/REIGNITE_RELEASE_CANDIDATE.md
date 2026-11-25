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

## Owner-only evidence and next-action desk

The existing owner-local, loopback-bound REIGNITE layout service now also exposes two protected organizer routes:

- `GET /api/owner/readiness` returns five prioritized next actions and all **25** canonical event gates. Only a valid owner key can access it. No unauthenticated or invited-editor access; it is never copied into the public static organizer preview.
- `POST /api/owner/evidence` logs a referenced source to `readiness-evidence.json` (private mode 0600) with strict optimistic revision checks. Only a valid owner key with matching same-origin POST may append a report. It does **not** accept files or private source contents.

Owner UI: after connecting with the owner key at the protected `/reignite/layout/` workspace, the first private panel shows the five actual blockers plus a simple `Record a source reference` form. Pick a canonical gate, supply an official HTTPS URL **without query strings, credentials or fragments**, or a reference like `private-ledger:museum/record-001` pointing to an existing, separately controlled artifact, choose what it *reports*, and add a meaningful note. A successful submission returns a receipt and updated owner-only statuses. No source material is automatically fetched, sent, uploaded or exposed to contributors.

**Evidence is NOT authorization.** The original Events assessor marks cited source reports `submitted_unverified`; the user cannot turn any gate to 'approved'. Reports of unsafe/denied/not permitted states create **sticky holds** until an independently authorized qualified review and explicit future resolution mechanism is engineered. Later optimistic notes cannot erase a reported hold. The service never releases event/ticket/charitable/music/venue permission; all remain false.

Legacy owner-local workspaces missing `readiness-evidence.json` safely initialize an empty private desk upon serving; they do not infer old evidence from emails, public news or draft design geometry. Subsequent source submissions are append-only and revisioned, never replacements.

Tests: `node --test tests/reignite-evidence.test.mjs` runs a real local HTTP server and checks 25 initial requirements, only-owner access, cross-origin denial, stale revision refusal, permanent hazard holds, private on-disk permissions, safe reference validation, and immutable history. It is included in the existing native REIGNITE CI workflow. Do not create duplicate checklist storage or an unauthenticated public API.

**Current limitation:** no independent engineer/museum/permit authority review system, signed reports, uploads, or real outside evidence is connected. This private evidence desk is a way to organize documents once properly received, **not a certification pipeline**. Real remote identity, Passport/Interaction Ledger, TLS, storage durability/backup and browser usability must be verified before production release.

## Actual production release holds

- Current museum-authorized venue/airfield access and legally valid event rights absent. No event date, booking, artist visa clearance, contracts, charity beneficiary agreement, parking, noise schedule, ticketing or public announcement authority.
- Current measured as-built, post-storm roof/shoring restrictions, exhibit positions, exits, utility routes, parcel and outdoor boundary required before any real venue-space assignment.
- Remotely connected multi-party editing requires a separately reviewed Evercraft-owned TLS reverse proxy, Identity/Passport and Interaction Ledger integration, secure invitation policy, deployment receipts, accessibility and hands-on mobile/browser QA. Current editor remains owner-local only.
- No public index or publicity of draft organizer/readiness/zone plans. The source snapshot reflects **no imported authenticated evidence**; it does not mean the museum or anyone else has done nothing.

**Merge/deploy rule:** No automatic merge, enabling tickets, sending outreach, booking artists, publishing live event announcements, or switching the site to a public production origin as a side effect of this integration. Request explicit release authorization and supply factual receipts first.

## Contributor one-tap UX integration fix | November 24

**Concrete bug closed in this stacked branch:** the server correctly authenticated one-use invitation cookies, but four browser actions still incorrectly checked only for a manually pasted `state.token`. A one-tap editor could therefore be signed in while the UI refused to submit a quick idea, refused an advanced proposal, or skipped their own statuses.

`public/reignite/layout/app.js` now uses one scoped `hasReviewAccess()` decision for both manual-key and HttpOnly-cookie editors, including:

- New invitation → quick experience idea → POST for owner review
- Returning after cookie-session refresh → `My Ideas and Next Steps` load
- Previously drafted suggestion → direct submit after editor authentication
- Advanced layout proposal submission with the same contributor cookie

`api()` continues sending the correct CSRF header on cookie-authenticated writes. Cookies do **not** grant owner-only evidence or approval access.

New `tests/reignite-contributor-flow.test.mjs` executes the actual browser script inside a dependency-free Node VM with mocked DOM/fetch and the real quick-idea module. It tests invite redemption, saved private status rendering, CSRF-bearing submission, session restoration, pending-preview submission, no-login local-only fallback, and owner controls remaining hidden. It runs in the existing source-check workflow alongside the real local HTTP server tests.

**Validation receipt:** GitHub-native REIGNITE site/layout/evidence/contributor flow proof completed SUCCESS at commit `9ab2ed302578a0ff36aca443aaf80d1f1d2d1111` (run `45497463271`). Events feasibility proof SUCCESS (run `45497463354`), Public mobile publishing audit SUCCESS (run `45497463250`). Generic Forge checks were running at verification. This proves executable browser-state and server integration paths, **not** a real Safari/Chrome interaction or live deployment.

**Release remains held:** no owner-approved live origin, vetted reverse proxy, actual museum evidence, guest invitations, artist contracts, event announcement, ticketing or fundraising. Real-device touch and accessibility QA are required before exposing outside access.

## Genuine mobile Chrome + touch verification | November 24, 2026

Native GitHub runner installs no browser application code into the Evercraft product. The new `tests/reignite-mobile-chrome.test.mjs` requires Chrome/Chromium already on the Ubuntu runner (and fails rather than silently skipping if missing). It uses Chrome DevTools and Node 22 built-ins to open a real rendered page against the ephemeral owner-local REIGNITE service with synthetic collaborator and owner credentials.

At an iPhone-like 390 × 844 viewport with touch emulation, the test checks readable page width/no horizontal overflow, a submit button at least 44 px tall, editor-only access, owner panels hidden, removal of the single-use fragment and absence of HttpOnly session tokens from JavaScript. It types a short idea into the actual form and **dispatches Chrome touchscreen events to its visible submit button**, verifies the genuine POST, owner's private review, contributor status update, session restoration after reload and that event authorization remains false.

**Verified:** native REIGNITE workflow `mobile-chrome-proof` run `45517444948` completed SUCCESS on commit `8b209364f4ca42e2743f787b9957bc9c0cb6657e`, alongside the independent Node-source tests. Earlier Chrome smoke on commit `dddf2dec82e8d791527c641836397b65fd793e76` also completed SUCCESS. All tests use a private temporary localhost dataset, not actual museum documents or public invitations.

**Limit:** Emulated Chrome touch is stronger than Node DOM mocks, but is **not** physical iPhone testing or Safari/WebKit QA; nor does it establish screen-reader usability, load under production TLS, real participant comprehension, or permission to publish an event. Required release restrictions remain in force.

## Community pilot fly-in as conditional program | November 25, 2026

Community feedback prompted the optional **Pilots for Hangar B** concept. The production website adds a ninth concept card visibly marked *not scheduled*; no arrivals, tickets or airshow are advertised. It is not included in the festival's canonical 25-gate source-only readiness snapshot, which must remain reproducible and byte-stable.

`systemia/opportunity-fabric/event-coordination.mjs` adds five flight-specific conditional gates and `assessReigniteFlyIn()`: the current airport/museum authorization chain; verified aircraft parking and movement capacity; public/airside separation and accessible emergency pathways; weather and pilot-notice responsibility; and correct FAA event classification (ordinary flying visit versus organized fly-in, ground closure or airshow). The FAA's current guidance explicitly distinguishes these types of activity. Reported permissions remain `submitted_unverified` and can never self-authorize.

`systemia/events/reignite-evidence.mjs` integrates these five gates into the existing owner-only evidence ledger, surfaced under `optional_programs`, separate from the 25 festival requirements. Owner UI displays their status and lets the operator reference an official public source or existing private document without exposing it to contributors. Unsafe reports remain sticky holds. No separate app, contact database, pilots' personal details, booking engine or external runtime was created.

**Important Port source:** On August 20, 2026, the Port of Tillamook Bay publicly announced an approved term sheet for a future Hangar B lease/sale and museum operations transition to Vintage Aviation Museum. That is not proof the transfer completed, and event authority must be confirmed with the current operator/land owner and airport. See `systemia/events/REIGNITE_AVIATION_FLYIN.md` for the sourced five-step program and the precise release boundaries.

**Status:** This is an optional feasibility program, not a pilot invitation, announced date, FAA waiver, airport parking guarantee, sponsored event, fundraiser or permission to use Hangar B. No new external message was sent. Release remains HELD on venue, current operating rights, airport coordination, engineering and owned HTTPS/Passport security.
