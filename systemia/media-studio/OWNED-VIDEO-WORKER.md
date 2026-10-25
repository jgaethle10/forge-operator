# Fallen owned video worker (engineering slice v1)

**Status: source and local contract tests only. Not a live model or an approved commercial.**

This branch adds a self-hostable **text-to-video** worker behind Fallen's `VisualModelAdapter` interface. It does not move Systemia authority, change Saban queue security, replace Fallen, send paid vendor requests, or enable remote agents/publication. RC35, rejected RC02 and RC03 are not used as inputs.

## Production boundary

- `owned-video-adapter.mjs` binds jobs to `evercraft:owned-video-v1` / `evercraft-local`, one local executable and a pinned SHA256 worker build. It refuses unreviewed model rights/unknown weight digests. No arbitrary shell expansion.
- The external worker receives a bounded `worker-request.v1` and must write a real `shot.mp4` and `worker-receipt.json` to an isolated job directory.
- The adapter independently probes file bytes, H.264 / `yuv420p` codec, aspect ratio, duration, frames, and decoded frame activity. It hashes the delivered MP4, stores the receipt next to it, and marks output only **eligible for Shot Tournament**, never publishable.
- V1 is **text-to-video** only; image-to-video identity binding is not implemented. Do not claim cross-shot character consistency until an I2V continuation worker and identity tests are proven.
- The candidate's provenance records local software/model weights and rights evidence, not that its visuals are documentary evidence.
- The Python worker `workers/wan-local-worker.py` uses **locally stored** Wan2.1 T2V 1.3B Diffusers-format weights. It deliberately refuses network downloads, absent CUDA, less than 10 GiB GPU VRAM, unmanifested/tampered weight files, and missing commercial-rights review. It generates at approximately 480p and upscales for a 720p H.264 review deliverable; this is not native 720p model detail.
- This slice **does not verify** that an Evercraft node has such a CUDA GPU or locally installed weights. It is a runnable path when provisioned, not a claim it already generated cinematic imagery.

## Prepare an owned GPU worker (operator-only; nothing installed automatically)

1. Provision a user-owned CUDA GPU with sufficient VRAM; verify node/GPU inventory, available disk/RAM, CUDA/drivers, and storage before loading weights. This is intentionally **not** automatically deployed to Chromebook/NextGen.
2. Review actual model license/commercial rights, checkpoint origin and dependency licenses. Wan2.1 model's upstream documentation lists Apache 2.0, but each installation still needs its own recorded audit. Use an explicit license evidence ID.
3. Install compatible Python/Torch CUDA, Diffusers, Transformers, Accelerate, imageio, ffmpeg on that owned worker. Cache an audited Wan2.1-T2V-1.3B-Diffusers model directory *before* disabling network access.
4. Create an immutable file inventory. Keep manifest outside model folder:

```bash
python3 systemia/media-studio/workers/make-weights-manifest.py \
  --model-root /owned/models/wan-2.1-t2v-1.3b-diffusers \
  --license-id apache-2.0-reviewed-RECEIPT-ID \
  --out /owned/model-receipts/wan-weights.json
```

5. Set environment `EVERCRAFT_LOCAL_WAN_MODEL` and `EVERCRAFT_LOCAL_WAN_MANIFEST` to these owned absolute paths. Record manifest sha256 and SHA256 of the exact worker script. **Do not commit model checkpoints, tokens or private paths to GitHub.**
6. In the private Saban/Fallen admission path, configure `createOwnedVideoAdapter` with the exact executable (typically Python interpreter), its worker script path, `workerArtifactPath`, both hashes, reviewed license ID, evidence refs, output root, and `verified:true` only after independent local attestation. Saban may dispatch *bounded admitted workloads*; it must not accept arbitrary executable commands over the public Fabric.
7. Route a two-second **test** shot first, then require human aesthetic review and Shot Tournament acceptance. Never equate a passing renderer test with photorealistic commercial quality.

### Minimal local integration sketch (not production config)

```js
import {createOwnedVideoAdapter, ownedVideoEndpoint} from './systemia/media-studio/owned-video-adapter.mjs';
import {executeVisualModelPlan} from './systemia/media-studio/model-fabric-runtime.js';

const adapter=createOwnedVideoAdapter({
  verified:false, // keep false until operator attestations and receipts are verified
  runnerCommand:'/usr/bin/python3',
  runnerArgs:['/owned/forge-operator/systemia/media-studio/workers/wan-local-worker.py'],
  workerArtifactPath:'/owned/forge-operator/systemia/media-studio/workers/wan-local-worker.py',
  outputDir:'/owned/film-candidates',inputRoots:[],
  weightsSha256:'<64 hex digest of weight manifest>',
  workerBuildDigest:'<64 hex digest of pinned worker file>',
  modelLicenseId:'<reviewed-license-receipt-id>',
  licenseEvidenceRefs:['<owned-audit-receipt-ref>'],rightsApproved:false,
});
const endpoint=ownedVideoEndpoint(adapter.verified);
// Only when endpoint.executionState==='verified' may routeVisualModels select it.
// const result=await executeVisualModelPlan(routedPlan,[adapter]);
```

## Proof commands

```bash
node --test systemia/media-studio/owned-video-adapter.test.mjs
python3 -m py_compile systemia/media-studio/workers/wan-local-worker.py
python3 -m py_compile systemia/media-studio/workers/make-weights-manifest.py
```

The deterministic test worker emits FFmpeg test footage (not AI footage) solely to prove binary, motion, and rights-admission mechanics. It is embedded in the `.test.mjs` and must never be passed off as commercial creative.

## Next Saban missions (not dispatched by this source change)

- **Compute:** inspect Node002/other candidates for CUDA GPU, VRAM, disk and memory; admit a genuinely suitable privately owned GPU node.
- **Model Operations:** install an audited open checkpoint and dependencies on that node, create a digest-bound model manifest, verify output reproducibility/quality and right to use it commercially.
- **Fallen Director:** upgrade from text-to-video to image-to-video continuity with fixed wardrobe, bakery environment and identity references, then real shot tournament scoring.
- **Kaidance / Voice Foundry:** independently produce original music, Foley and expressive voice; do not silently recycle RC35 or use an unapproved voice.
- **ForensiScope / Rights:** record complete media lineage, including each newly generated candidate; reject all external media without rights evidence.
- **Shipping / Clip:** master iPhone-safe final MP4, independently audit audio and every cut, hold until owner approval and publish permissions.

Systemia retains command authority; Saban is bounded execution; Fallen retains project graph, model routing, decisions, and edit/export; Clip is a separate distribution boundary.

## V2 GPU admission and Saban placement

These files extend v1 without changing the production authority boundary:

- `owned-video-gpu-preflight.mjs` is an **observational probe**, not an installer, enroller, or authorization path. It checks local NVIDIA CUDA GPU memory, RAM, free output space, model presence, and FFmpeg/FFprobe, then returns a machine-readable block/readiness receipt without exposing private host paths. `node systemia/media-studio/owned-video-gpu-preflight.mjs --observe` always reports node authorization and rights as unverified. The trusted fields must be produced independently by the existing NodeSeed/Systemia private admission path.
- `owned-video-saban-placement.mjs` emits a bounded Saban *placement intent* only when the read-only hardware receipt is fresh and its trusted attestation binds the **same device, observation digest, and Saban offer ID**. The Saban offer must be attested, eligible for workload `evercraft.fallen.owned-video.v1`, explicitly conformance-verified (not generic container-capable), and carry adequate real GPU, RAM and local storage. Saban's existing heterogeneous planner makes the final resource placement decision. The resulting plan is **not a worker lease** and cannot execute commands, spend money, start video generation, expose a filesystem, or publish anything.
- For a genuine canary, run `node --test systemia/media-studio/owned-video-gpu-preflight.test.mjs systemia/media-studio/owned-video-saban-placement.test.mjs` locally or wait for CI. Every test uses fictional attestation/test offers and must not be interpreted as a real GPU having passed preflight.

### Owner node probe (read-only)

Run on an authorized candidate GPU host (not the Chromebook or NextGen unless its actual hardware qualifies):

```bash
node systemia/media-studio/owned-video-gpu-preflight.mjs --observe
```

The output deliberately reports `state: blocked` until an independently verified NodeSeed attestation, model runtime, commercial rights, immutable worker digest and weights manifest are supplied to the **private** admission process. Do not paste secrets, model paths, or allocator credentials into public logs.

### Status after V2 source implementation

- Owned video software and a bounded scheduler placement contract exist.
- A suitable authorized Evercraft GPU host and actual Wan checkpoint have **not** been observed through this chat.
- No live Saban GPU lease has been issued, no real video generation run has been observed, and no new commercial is approved or published.

## First artistic target: Before the Doors, shot 01

`campaigns/before-the-doors-canary-01.json` and `campaigns/before-the-doors-canary-bible.json` are the first original two-second, vertical, model-neutral **live-action-style cinematic moving shot request**. It depicts real-looking hands folding dough in a bakery. All creative input is newly authored. These files do not contain or reuse any frames or soundtrack from Relay RC35 or rejected studio commercials. Rights/provenance receipts and truthful cinematic motion remain mandatory before an artifact may advance to a human-reviewed Shot Tournament.

The deliberately simple close-up shot avoids character-face identity claims before our I2V continuity system is proven. The first real success condition is a **model-generated moving sequence** that survives frame inspection, not a poster, FFmpeg color bars, or simulated worker footage. No model inference result exists merely because this request is committed.


## Bounded execution after placement (2026-10-25)

The Saban placement intent is **not** permission to run the GPU model. The new
\`owned-video-execution-gate.mjs\` introduces a separate local-only authority
boundary for registered NodeSeeds. The execution process reruns Saban's
placement and GPU-readiness checks before invoking the already-pinned owned
adapter.

A lease contains only the exact job ID/hash, placement and readiness hashes,
NodeSeed and Saban offer IDs, pinned worker and model-manifest SHA-256 values,
license receipt, a random 128-bit lease ID, and issue/expiry times. It is
valid for at most 180 seconds and exactly one execution. It cannot contain
shell commands, executable paths, URLs, payment or publication instructions.

Both the **owner authorization identity** and the **Systemia authorization
identity** sign the stable canonical lease JSON with separate Ed25519 keys.
The NodeSeed loads public keys from local trust configuration, never from the
incoming job. No private signing keys belong in GitHub, a video worker or an
untrusted payload. No actual signer, signing service or live job is activated
by committing this module.

On execution, the gate:

1. Rejects altered local hardware observations and recomputes placement at
   issuance time (because Saban's plan hash includes its generation time).
2. Rechecks *current* GPU/attestation/workload eligibility, then verifies both
   signatures, scope, expiry and model evidence bindings.
3. Accepts only the preconfigured, attested local adapter
   \`evercraft-local-owned-video-v1\`.
4. Reserves the lease ID atomically in a local restricted ledger; a failure
   still burns the lease to prevent paid or GPU-heavy duplicate execution.
5. Re-hashes the resulting media file and checks the returned job,
   provenance, rights, worker and weight-manifest evidence before writing a
   durable receipt.
6. Releases only a **candidate for Fallen's Shot Tournament**. The module
   never grants publication, client delivery or payment authority.

The local tests use a **mocked** adapter/file to exercise authorization
mechanics. Neither a mocked adapter nor passing GitHub CI is evidence of
real AI video generation or production-grade cinematography. Real GPU
deployment, audited Wan weights, signing identities and operator approval
must be established separately.
