# AIW private owned-node staging: execution gate

This document is an **operator deployment plan, not proof of deployment**. The
public national prototype and the owned Pacific Northwest service are different
systems. Keep the prototype intact. Never publish the local API without a
separate authenticated reverse-proxy review.

## Prerequisites verified on target node

- Check available disk and RAM, owned repository checkout, Python >=3.11,
  unprivileged service account, available loopback ports 8786 and 8787.
- Confirm the selected host's current Systemia, Journal, Worlds and router
  services are healthy. Do not reuse or replace their ports, names, units or
  directories.
- Check out an **approved immutable commit**, not a moving development branch,
  and verify the source SHA-256 against the documented pinned atlas checksum.
- Create a private state directory (owner-only permissions) outside the
  repository. No public artifacts, no tokens in shell history, and no secrets
  in GitHub Actions.

## Stage 1: snapshot index (no network and no production changes)

```sh
python3 research/infrastructure-watch/engineering/aiw_index_service.py build \
  --source public/infrastructure-watch/pnw-2026.html \
  --db "$AIW_STATE/bridges2026.sqlite"
python3 research/infrastructure-watch/engineering/aiw_index_service.py audit \
  --db "$AIW_STATE/bridges2026.sqlite"
```

The audit must report 21,590 PNW records, one unclassified Oregon record, 27
Poor in Yakima County, and `national_import_complete=false`. Otherwise stop.

## Stage 2: one-off loopback test

Only after confirming free ports, run the owned API bound to
`127.0.0.1:8786` as a non-root user. Do **not** expose the port via Caddy or
public network rules.

```sh
python3 research/infrastructure-watch/engineering/aiw_index_service.py serve \
  --db "$AIW_STATE/bridges2026.sqlite" \
  --html public/infrastructure-watch/pnw-2026.html \
  --host 127.0.0.1 --port 8786
```

In a separate session run:

```sh
python3 research/infrastructure-watch/engineering/aiw_launch_gate.py \
  --base-url http://127.0.0.1:8786
python3 research/infrastructure-watch/engineering/aiw_heartbeat.py \
  --origin http://127.0.0.1:8786 \
  --receipt "$AIW_STATE/pnw-heartbeat.json"
```

Stop on any failure. The heartbeat only proves current health of a **historical
snapshot**, not a live national feed.

## Stage 3: source-cycle verification

The existing national site's *real collector* needs an approved exact registry
of its source IDs and URLs (including Yakima minutes), not synthetic example
IDs. Feed actual cycle receipts to `aiw_kaidance_receipts.py` and generate an
owner-only redacted report with `aiw_private_status_export.py`. Never set
`scheduler_registration_verified=true` based on a single manual cycle.

Start the viewer on loopback **only**, after receipt verification:

```sh
python3 research/infrastructure-watch/engineering/aiw_private_viewer.py \
  --status "$AIW_STATE/private-status.json" --port 8787
```

View from the host at `http://127.0.0.1:8787`. Never forward this page to the
national public site without authorization and an authentication review.

## Stage 4: unattended monitoring (separate authorization)

Register a 300-second Kaidance/Systemia schedule **only after** the target
host, service account, source registry, restart policy and rollback have been
reviewed. Record three genuine scheduled cycles and forced failure/recovery.
A successful GitHub Actions test does not certify this stage.

## Exit and rollback

- Stop only the newly staged AIW processes and leave all other Evercraft
  services untouched.
- Retain evidence and the previous verified SQLite index; do not overwrite
  source receipts or represent stale data as current.
- Re-run release gate against independently authenticated receipts; absent
  founder publication approval means NO-GO.
- National site publication, Caddy/TLS changes, and public DNS changes are
  **out of scope** for this procedure.

## Evidence to collect before production

Immutable checkout SHA, source checksums, host/port/service collision check,
local audit JSON, launch gate JSON, heartbeat, collector source inventory,
three timestamped scheduled cycle receipts, failure/recovery results, site
mobile/accessibility review, rollback result, and explicit approval.
