# American Infrastructure Watch: Kaidance source-cycle receipts (draft)

**Purpose:** Preserve per-source outcomes from the **existing** private national-site collector. This module validates and stores submitted receipts. It does not fetch agencies, register a timer, run Kaidance, make the site public, or convert the separate v0.15 PNW index into the nationwide site.

**Status:** Only offline tests have run. There is no verified live Kaidance schedule, live registry or site-side status endpoint from this work.

## Integration boundary

On an Evercraft-owned node, the existing collector must perform its real source fetches. It must provide a UTC timestamp, an actual content SHA-256 for a successful response, or a machine-readable error for failure. A 200 response without checking the expected content is not sufficient. Do not reuse hashes from older cycles. The 300-second schedule belongs to Kaidance/Systemia, not GitHub Actions.

The validator checks structure and preserves source outcomes. It does **not** authenticate the collector or independently fetch the claimed remote bytes. Never include API keys, private tokens, cookies, credentials, or personal records in source URLs or receipts. Protect the approved registry and receipt directory on the owned host.

## Real source registry

Discover the exact nine approved national-site source IDs and HTTPS URLs from the private hosted collector. They are not available in the PNW GitHub index. Do not guess IDs or claim that synthetic examples are live checks.

Test-only sample registry:

    {"sources":[{"id":"example_bridge","url":"https://agency.example/bridge"},{"id":"example_minutes","url":"https://agency.example/minutes"}]}

A collector cycle must contain cycle_id, collector_id, UTC started_at, UTC finished_at, and a sources array. Each source observation must have id, url, result, checked_at, content_sha256, and error_code. Allowed results are ok, failed, unavailable, skipped. A successful fetch requires a reported 64-character lowercase content SHA-256; other outcomes require a sanitized error_code and no content hash.

Missing sources are shown explicitly as not_checked. Only all-source reported success counts as a healthy cycle. Failed, missing, future-dated, stale, duplicated or malformed evidence must never be converted to success.

## Commands, only after deployment approval

    python3 research/infrastructure-watch/engineering/aiw_kaidance_receipts.py record \
      --registry /path/to/approved/source-registry.json \
      --input /path/to/real/collector-cycle.json \
      --receipts /path/to/private/aiw/receipts

    python3 research/infrastructure-watch/engineering/aiw_kaidance_receipts.py status \
      --registry /path/to/approved/source-registry.json \
      --receipts /path/to/private/aiw/receipts \
      --freshness-seconds 600

Receipts are write-once per cycle ID; a duplicate ID will not overwrite evidence. The four display states are awaiting_first_cycle, healthy, degraded, and stale. Even a healthy per-source receipt has scheduler_registration_verified=false: one completed cycle is **not** evidence that an unattended timer is installed and reliable. The ten-minute freshness threshold is not proof of the intended five-minute cadence.

## Release proof required

1. Reconcile the nine real source IDs/URLs with the private national site's actual collector, including the Yakima meeting-minutes source.
2. Register the collector with Kaidance at a 300-second cadence on owned infrastructure, with Systemia orchestration and audited permissions.
3. Verify three consecutive real scheduled cycles including all source dispositions, timestamps and content receipts.
4. Force a source failure, missed cycle, and recovery; prove degraded and stale states display correctly and survive host restart.
5. Review mobile accessibility, private access, logging, evidence retention, rollback, and source update semantics. Do not confuse HTTP liveness with successful fresh data collection.
6. Obtain explicit founder approval before any public publication.

**Safety invariant:** Poor bridge condition is not evidence of imminent danger. Neither a heartbeat success nor an FHWA historical rating is a live route-clearance, bridge-safety, closure, or emergency declaration.
