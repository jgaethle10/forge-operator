# Black Box: 90-second Entire developer showcase

**Stage:** Review-only prototype. One-command synthetic demo, not a released Entire plugin, official integration, production provider readback, or endorsement.

## The failure

An agent says "I created the ticket." The CLI reports success. Did the provider actually commit the side effect? Did a timeout mask a successful write? Did locally supplied logs disagree? An unverified retry can duplicate an external action.

## Reproduce (Go required)

From the `integrations/entire-blackbox` directory:

```sh
go test ./...
bash demo.sh
```

Four synthetic cases: (1) agent success with no provider observations => UNKNOWN, (2) one reported provider commit => UNVERIFIED_COMMITTED_CLAIM, not verified, (3) contradictory provider states => CONFLICT, (4) duplicate JSON `provider_state` keys => input rejected. Every successful assessment has `externally_verified:false`. Nothing is sent to a provider, paid, retried, or deployed.

**Implementation:** [Go source](./main.go), [regressions](./main_test.go), [CI workflow](../../.github/workflows/entire-blackbox-evidence.yml), and [draft PR](https://github.com/jgaethle10/forge-operator/pull/1291).

## Entire compatibility boundary

Entire's documented `entire-<name>` external-command mechanism is a command launcher with pass-through stdio and exit code. It **does not automatically capture transcripts or create checkpoints**. See [Entire external commands](https://github.com/entireio/cli/blob/main/docs/architecture/external-commands.md). This candidate is compiled as `entire-blackbox`. **Update (October 19, 2026):** the previously unverified local installation path was subsequently exercised against a hash-pinned **real Entire CLI v0.11.5** in [successful CI run #39055019209](https://github.com/jgaethle10/forge-operator/actions/runs/39055019209). Install, invoke, negative-input rejection, and uninstall passed in an isolated runner. Cross-platform release-shaped archives and detached source verification also passed in [run #39070140266](https://github.com/jgaethle10/forge-operator/actions/runs/39070140266). These are **local CLI and packaging proofs**, not Entire checkpoint hooks, an official catalog-listed plugin, a public release, third-party installation, provider outcome verification, or a partnership. No official Entire endorsement exists.

## Broader failure-and-recovery evidence

This four-case Go CLI remains the *introductory component*, not the complete incident demonstration. A separately tested **real local-process adversarial drill** exercised a scripted worker, eight locally signed observer events, a restarted sandbox receiver rejecting four persistence requests before and after restart, and two same-host NodeSeed test processes. [Exact-head CI run #39093796275](https://github.com/jgaethle10/forge-operator/actions/runs/39093796275) passed. This does **not** establish production security containment, authenticated external business side effects, independent physical-node identity, or live Entire checkpoint integration.

The source-linked [Entire engineering review brief](../../systemia/agent-continuity/ENTIRE_REVIEW_BRIEF_20261019.md) explains which behaviors were actually tested and how to reproduce the founder-held local challenge. No public invitation is approved by this document.

## Technical question for Entire's community

Would separating "agent reported success" from "authenticated external side effect" be useful as a standalone incident triage command, or should a future implementation be tied into the checkpoint lifecycle through a separate supported integration? What minimal evidence/provenance contract would maintainers actually want? We welcome critical feedback, not a ceremonial thumbs-up.

## Verification and responsible sharing

Only say "CI passing" for the latest commit when its targeted run actually completes successfully. Do not publish real incident logs, secrets, agent prompts, customer identities, tokens, or private Entire chat content. No direct outreach or Discord publication is performed by this file.
