# Evercraft Black Box | Outside-Reviewer Challenge, Candidate RC01

**Status: FOUNDER REVIEW ONLY. DO NOT SEND, ANNOUNCE, RELEASE, TAG, OR SOLICIT TESTERS UNTIL FOUNDER APPROVES.**
An engineering invitation to inspect and try a **real local sandbox drill**. NOT an Entire-certified integration, not an Entire checkpoint, not a production Spider Society test service, not a remote execution offer, and not permission to access customer data or live Evercraft machines.

## The question
Can you make the rogue worker's unapproved retry, callback, successor or cross-tenant request survive a restart or pass the bounded evidence gate, **without manipulating the test's acceptance assertions, modifying the trusted checker, or replacing its truth inputs?** The goal is a minimal reproducible security finding, not a screenshot of a passing test.

## One-command reproducible local challenge (after source review)
Requirements: Git, Node.js 22 or newer. Run in a throwaway developer checkout, **never with secrets or customer workloads**. No Entire account, Evercraft account, OAuth, GitHub Actions token, cloud payment or external API key is needed.

```bash
git clone --single-branch --branch feature/blackbox-signed-incident-ingest-20261017 https://github.com/jgaethle10/forge-operator.git blackbox-review
cd blackbox-review
node systemia/agent-continuity/outside-reviewer-challenge.mjs
node --test systemia/agent-continuity/outside-reviewer-challenge.test.mjs
```

This executes a scripted rogue child OS process dispatched through Saban's real local scheduler; Black Box locally signs evidence using test-only Ed25519 keys; Spider's dedicated local loopback HTTP test process quarantines and denies replays across an OS restart; two official NodeSeed processes return signed challenge responses using CI/lab-only keys. It does NOT call a live external agent, production provider, actual HP/Chromebook, Entire backend, remote Spider service or broader network. It may write ephemeral fixture files under the local OS temporary directory and create localhost HTTP listeners which it closes. Audit the code and local network use before execution.

Expected top-level result: PASS_REVIEWER_LOCAL_SAFETY_DRILL_ONLY; 8 signed observer events; 4 denied local Spider replay actions before restart and 4 after; zero runnable pending work after restart; 2 actual loopback NodeSeed challenge responses. All claims explicitly label local fixture scope; a green run is not proof of live remote service, canonical Systemia admission, physical node independence or production safety.

## Meaningful adversarial exercises
1. **Evidence substitution:** change the producer event array, manifest, incident, tenant or quarantined snapshot. Can the verifier be made to accept a forgery without editing validation rules? Include original/modified hashes and exact version.
2. **Surviving persistence:** attempt to get a sandbox retry, callback or successor registered after quarantine, then restart the receiver HTTP process. Show an actual runnable entry, not only a proposed request.
3. **Identity confusion:** supply a wrong or duplicated NodeSeed signing key/ID, swap capacity labels or replay an earlier signed challenge. Distinguish self-signed signatures from independently pinned owner identity.
4. **Incident truth:** see whether a synthetic locally generated receipt can be wrongly upgraded into verified provider effects, canonical Systemia admission, Entire integration or cross-physical-device guarantee.
5. **Concurrency:** independently add a bounded adversarial test for a race between quarantine and a valid-looking local attempt. Do not create new external endpoints or make live changes.

## Finding submission once founder opens invitations
Prefer a GitHub issue or PR under jgaethle10/forge-operator with: exact source commit; environment (OS, Node version); command; sanitized test input; expected and observed output; reproduction steps; evidence hashes; scope; minimal patch or test; and what remains unknown. Before invitation approval, do not post an issue, ping maintainers, forward passwords, attempt live attack, scan Evercraft domains, or run probes against third-party services. Private security issues must go through an approved private reporting channel, not a public exploit disclosure.

## Entire and Lux positioning
Entire external commands and agent/checkpoint integrations are distinct protocols. Current integrations/entire-blackbox Go binary is a **read-only external-command candidate**, not an installed/official plugin or integration. The local broader challenge is independent of Entire's service. Maintainers should be invited to comment on fit and evidence integrity, not told we are already partnered. An earlier note to Entire leadership and a prior Fabric-alpha invitation to Lux are already on record: **do not send duplicate messages**. When founder approves, attach one exact updated evidence reference to the existing context rather than launch a broadcast.

## Engineering receipts and hard release boundaries
- Parent PR #1291 and child draft PR #1364 contain the existing history and audit receipts.
- CI already proved real scripted OS processes, two provider-separated GitHub runners through stored artifact handoff, local loopback Spider HTTP denial/restart, and two ephemeral NodeSeed test signatures on one CI host.
- Canonical continuity founder directive remains awaiting admission; ten PipelineEdges unverified.
- 0 externally authenticated provider effects; 0 production permissions; 0 verified cross-owned-device identity operations. No destructive containment authorization.
- Challenge publication, social posting, email/DM invitations, issue creation on Entire, merge/release and public live-host endpoints require separate founder approval.

**Invitation thesis:** The agent stopped. Did its consequences? Bring a failing test, not a promise.
