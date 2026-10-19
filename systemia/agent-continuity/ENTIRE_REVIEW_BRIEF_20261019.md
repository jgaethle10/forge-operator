# Evercraft Black Box | Evidence-first engineering briefing

**Founder review · October 19, 2026 · Not an Entire integration release or sales claim**

> **The agent stopped. The consequences might not have.**

An AI worker can stop between attempting an external action and receiving a final acknowledgment. A successful agent message, missing callback, or completed checkpoint cannot independently establish whether the provider committed an effect or whether another worker may still retry. Black Box is Evercraft's developing incident-evidence boundary. Spider Society explores potential surviving work; Saban orchestrates bounded workers; NodeSeed supplies testable worker identity signals.

## What has actually been demonstrated

The following are *separate*, exact-head, completed GitHub Actions experiments. Nothing here implies an endorsement or deployed customer integration:

| Engineering result | Exact proof | Limit |
| --- | --- | --- |
| Go Black Box input and uncertainty classification, adversarial JSON handling, synthetic shared-incident contract | [Successful evidence CI](https://github.com/jgaethle10/forge-operator/actions/runs/39003834687) on `aaa5f8acc8f1` | No external business-provider readback; every assessment has `externally_verified=false` |
| Install, invoke, reject bad input, and uninstall the binary via **real Entire CLI v0.11.5** in an isolated CI runner | [Successful local Entire CLI compatibility CI](https://github.com/jgaethle10/forge-operator/actions/runs/39055019209) on `5bf7e17c6d8f` | Entire external commands do **not** imply checkpoint hooks, plugin-index listing, or official support |
| Six release-shaped archives, deterministic checksums, detached consumer validating the release candidate and local Entire invocation | [Successful packaging CI](https://github.com/jgaethle10/forge-operator/actions/runs/39069508623) on `f6ca7827ab0b` | No public release, installed third-party binary, or commercially supported artifact |
| Allowlisted source export, standalone module, GoReleaser snapshot, separate-runner source verification | [Successful snapshot CI](https://github.com/jgaethle10/forge-operator/actions/runs/39070140266) on `05710434bb53` | Snapshot only, not a standalone public repository release |
| **Contained rogue-worker field drill** involving real local OS processes, test-only source signing, restarted HTTP persistence sandbox, two GitHub-runner artifact custody, and two NodeSeed *same-host* nonce challenges | [Successful adversarial test CI](https://github.com/jgaethle10/forge-operator/actions/runs/39093796275) on `2e8e21f4eb2e` | Local scripted test worker and sandbox only; no live cross-device enforcement, Entire checkpoint integration, production keys, or provider-side effect verified |

## The 75-second engineering story

**0–12s · The incident.** A scripted test worker runs as a real child OS process under Saban's scheduler. It tries unauthorized cross-tenant access, successor creation, retry registration, and callback registration. **These are local exercises**, not live production attacks.

**12–27s · The evidence.** Black Box records **eight** locally signed observer events using ephemeral CI keys and binds them to test identities. The source evidence can say *what the local test observed*, but not that an external payment or ticket truly completed.

**27–45s · Persistence.** The local Spider sandbox holds or denies the pending retry, callback, successor, and lease paths. The worker process is terminated. This is a **quarantined test snapshot**, not generalized containment of other people's agents.

**45–60s · Crash/restart boundary.** A different GitHub runner receives a stored artifact, authenticates the expected source hashes, and launches a loopback HTTP receiver. The receiver denies a forged input and duplicate import, then restarts as an OS process. **Four** replay requests are denied before restart and **four** after. The receiver snapshot has zero runnable pending work. This **does not prove global no-regeneration**.

**60–75s · Identity and limit.** Two genuine NodeSeed HTTP server processes on **one CI machine** answer fresh nonce challenges with separate temporary test keys. They are **not** two independently enrolled Evercraft physical machines. All external-provider side effects remain unknown.

The strongest claim is not “we control autonomous agents.” It is **we can conduct reproducible, bounded adversarial process tests while preserving an explicit distinction between source observation and verified external action**.

## Reviewer-safe reproduction (after reading the code)

Use a **disposable checkout** with **Node 22+** and no credentials or customer workloads. The code launches local child processes and loopback HTTP listeners, then tears them down. It has not been approved for external invitations; this recipe is for founder review.

```bash
git clone --single-branch --branch feature/blackbox-signed-incident-ingest-20261017 \
  https://github.com/jgaethle10/forge-operator.git blackbox-review
cd blackbox-review
node systemia/agent-continuity/outside-reviewer-challenge.mjs
node --test systemia/agent-continuity/outside-reviewer-challenge.test.mjs
```

Expected top-level status from the exact tested candidate: `PASS_REVIEWER_LOCAL_SAFETY_DRILL_ONLY`. This is an **expected** result grounded in prior CI, not a claim that this README invocation was rerun on a separate customer system.

The original standalone Go demo remains available under [`integrations/entire-blackbox/`](../../integrations/entire-blackbox/), and its [one-command four-fixture script](../../integrations/entire-blackbox/demo.sh) is useful for code review. The deeper [external reviewer challenge](./EXTERNAL_REVIEW_CHALLENGE_RC01.md) remains **FOUNDER_REVIEW_ONLY**.

## Work required before calling it a product or a partner integration

1. Obtain authenticated, independently trusted provider readback for one explicitly authorized sandbox external action; retain unknown as unknown.
2. Identify an officially supported Entire checkpoint or agent event hook. The local CLI external-command proof is **not** this hook.
3. Bring source identity into real enrolled Systemia/Passport and audit exact producer → transport → consumer → detached verifier receipts with tenant isolation.
4. Publish a dedicated, licensed, checksum-backed plugin repository and independently test its public installer **only after** Systemia/release authorization.
5. Confirm a real user problem, acceptance criteria, contractual rights, and buyer budget. No payment or customer success is implied by internal CI.

## Decision requested from an experienced developer-platform team

**Where would evidence of uncertain external effects and surviving retries belong in a checkpoint-centric workflow, if at all?** We welcome a concrete critique of the trust boundary and an independently reproducible failure case, not a ceremonial partnership endorsement.

**Engineering scope:** exact CI tests and isolated local runnable code. **Commercial status:** no confirmed paid commission, no customer deployment. **Governance:** canonical Systemia continuity mission is not yet admitted, and its ten pipeline edges remain unverified. No production permissions or destructive actions granted.

**Do not send externally, open security invitations, merge, or publish a release until founder approval.**
