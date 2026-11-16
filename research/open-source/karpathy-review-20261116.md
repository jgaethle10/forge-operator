# Karpathy open-source screen: Evercraft, 2026-11-16
Research intake from the user-supplied 25.8-second video. **No upstream repository installed, real inference run, public product released or buyer payment evidenced.** Source references independently checked against upstream README/gist and the existing Evercraft architecture.

| Reference | Technical truth | Evercraft decision |
|---|---|---|
| [autoresearch](https://github.com/karpathy/autoresearch) | Bounded AI training experiments, five-minute budget, NVIDIA GPU required/tested H100 | Borrow **method**; do not run full training on Penguin/NextGen or authorize external compute spending |
| [nanoGPT](https://github.com/karpathy/nanoGPT) | Upstream README explicitly says deprecated in favor of nanochat | Historical education only |
| [nanochat](https://github.com/karpathy/nanochat) | Compact LLM stack including CPU setup but serious published workloads use high GPU capacity | Research candidate; compare with existing sovereign inference, do not duplicate |
| [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | **Idea file**, not a ready-made app | Adopt source-linked updating of derived knowledge via existing Context Fabric |
| [llm.c](https://github.com/karpathy/llm.c) | C/CUDA training plus a CPU reference | Educational sovereign-compute reference |
| [micrograd](https://github.com/karpathy/micrograd) | Tiny autograd educational engine | Optional Infinite Classroom teaching exercise |

**Licenses:** nanoGPT, nanochat, llm.c and micrograd contain upstream MIT LICENSE files; review transitive dependencies and model/data rights independently. Autoresearch's README states MIT, but the root LICENSE file could not be retrieved during this screen; clear exact legal reuse terms before copying code. No external code is proposed from the LLM Wiki idea file.

**Source-video caution:** the animation labeled “Repo Swarm” has unverified code, origin and licensing; its appearance does not mean that any of these six projects implements that interface.

## Revenue-first experiments
1. Reuse **ForensiScope PR #2190** and **open-source sprint #2191**. Apply autoresearch's compare/keep/revert method to **existing** ASR paths on one consented sample, with fixed machine limits, transcript accuracy/timestamp rubric, human QA minutes and measured CPU/API cost. No autoresearch GPU run; no automatic release.
2. Add a **derived, evidence-cited synthesis** to existing Context Fabric and Evercraft Research using one authorized public source. After a second source arrives, reconcile contradictions and measure time to reviewer-approved brief. Do not create another knowledge authority; preserve raw evidence and trust labels.
3. Only pursue nanochat training after owned hardware fit and an actual downstream customer use case are evidenced.

## Review and test
Run `node --test systemia/capability-mesh/upstream-research-screen.test.mjs`. The catalog and its read-only screen are discovery aids, **not Systemia admission**. Every actual integration still needs version pinning/SBOM, source/weight rights, guarded test, owned compute, capability contract, rollback, runtime receipt, and separately verified real checkout/fulfillment.

Source inspection: upstream GitHub README and licenses, Karpathy original Wiki gist, `systemia/context-fabric/README.md`, `systemia/capability-mesh/README.md`. No test in this branch simulates real paid customer success.
