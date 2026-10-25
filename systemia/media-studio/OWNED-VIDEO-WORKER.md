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
