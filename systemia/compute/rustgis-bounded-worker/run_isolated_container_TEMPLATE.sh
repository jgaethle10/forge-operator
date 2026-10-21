#!/usr/bin/env bash
set -euo pipefail
# TEMPLATE ONLY. NOT deployed or tested on HP, Chromebook, Docker or other worker.
# REQUIRED: externally issued authenticated local job and detached Ed25519 permit.
# Review ownership/perms/mounts; no host secrets, SSH credentials, socket or network.
: "${WORKER_IMAGE:?Pin a locally verified image with Node 22+ and RustGIS shared library dependencies}"
: "${WORKER_ROOT:?Absolute host path of worker package and CONFIG/JOB/PERMIT}"
: "${DATA_ROOT:?Absolute host path of synthetic-only read-only inputs}"
: "${TRUST_ROOT:?Absolute host path containing issuer-public.pem (NO private keys)}"
: "${BINARY_ROOT:?Absolute host path containing pinned rustgis-cli}"
: "${OUTPUT_ROOT:?Absolute host path owned/writable by sandbox UID}"
: "${LEDGER_ROOT:?Absolute host path owned/writable by sandbox UID}"
exec docker run --rm --network none --read-only --cap-drop=ALL \
  --security-opt no-new-privileges --pids-limit 64 --memory 768m --cpus=1 \
  --user 65532:65532 --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --mount type=bind,src="$WORKER_ROOT",dst=/app,readonly \
  --mount type=bind,src="$DATA_ROOT",dst=/work/inputs,readonly \
  --mount type=bind,src="$TRUST_ROOT",dst=/work/trust,readonly \
  --mount type=bind,src="$BINARY_ROOT",dst=/opt/evercraft/rustgis,readonly \
  --mount type=bind,src="$OUTPUT_ROOT",dst=/work/outputs \
  --mount type=bind,src="$LEDGER_ROOT",dst=/work/ledger \
  --mount type=tmpfs,dst=/tmp,tmpfs-size=16777216 \
  "$WORKER_IMAGE" node /app/src/worker.mjs execute /app/config.json /app/job.json /app/permit.json
