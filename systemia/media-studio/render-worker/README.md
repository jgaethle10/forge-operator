# Fallen Render Worker

This is Fallen's private exact-frame Chromium renderer.

It is intentionally separate from Evercraft's public browser worker. The public browser worker can browse public HTTP(S) pages under a read-only network policy. The Fallen Render Worker does the opposite: it accepts a bounded Evercraft Visual Stage and **has no external network authority**.

## Contract

`POST /v1/render`

Authorization:

`Bearer $FALLEN_RENDER_WORKER_TOKEN`

Input schema:

`evercraft.fallen.render-job.v1`

The worker accepts:

- one validated `evercraft.fallen.visual-stage.v1`
- a lease/job-scoped asset manifest
- an exact frame start and bounded frame count

Media layers must reference `asset://<id>`. Arbitrary `http://`, `https://`, `file://`, absolute paths and arbitrary HTML are rejected.

Every manifested asset is loaded only from:

`$FALLEN_RENDER_ASSET_ROOT/<job_id>/<filename>`

The file is SHA-256 verified before Chromium receives it. Chromium only receives asset bytes through the internal `https://fallen.local/assets/<id>` route. Every other browser request is aborted.

## Output

Frames are written under:

`$FALLEN_RENDER_OUTPUT_ROOT/<job_id>/frame-XXXXXXXX.png`

The response and `receipt.json` include:

- stage digest
- verified asset identities
- exact frame numbers and timestamps
- PNG byte counts and SHA-256 identities
- console errors
- worker boundary declaration
- overall receipt SHA-256

A frame receipt is not publication authority. Downstream Fallen gates still decide whether the artifact can enter an edit or ship.

## Local proof

```bash
cd systemia/media-studio/render-worker
npm install
npm test
docker build -t evercraft/fallen-render-worker:local .
```
