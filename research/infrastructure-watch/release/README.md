# American Infrastructure Watch | Owned Public Beta Release Lane

**State:** founder-approved UX; private preview verified; **public not deployed**. This lane is isolated from the broader draft PR #1884 and is designed to avoid a public Python/SQLite service. GitHub is the source of truth; Systemia will record release receipts only after a verified public cutover.

## Why a static release

The approved map at `127.0.0.1:8796` is backed by 52 FHWA 2025 state summaries and a separately validated Washington 2026 DB. It is local-only and must not be exposed directly. The static exporter snapshots **only public federal records** and locally hosted Leaflet, producing:

- A clear state-first map with instant hover totals, click/tap selection and a simple second depth level.
- 56 Census-derived state/territory boundaries.
- State data from FHWA 2025 with explicit year labels and Washington 2026 summary (8,619, 403 Poor).
- **8,618** Washington mappable deep records, with the one flagged-coordinate record omitted from the *deep location list* but included in the 8,619 state total.
- Local, hash-verified Leaflet JS/CSS, source attribution, about page, read-only JSON, a release manifest and SHA256SUMS.
- **No** web API process, private SQLite database, accounts, payments, signup, outside runtime or live hazard feed.

## Phase A: Freeze the approved preview on NextGen (no cutover)

Run `research/infrastructure-watch/release/aiw-beta-build-nextgen.sh <reviewed-commit>` on **NextGen**, from the stage repo. The operator script fetches its own matching immutable GitHub source, compares its hover page byte-for-byte against the live local 8796 preview and exports a self-contained tarball in `~/.local/state/evercraft/aiw/national-map-private/public-beta/releases/`.

Every completed archive must pass:
- FHWA 2025 state summary and 56-geometry checks
- independent SHA-pinned Washington 2026 source, 8,619 totals and 403 Poor
- page-through uniqueness for 8,618 public mappable records
- exact approved UI and source years
- local Leaflet 1.9.4 SRI and full license files
- private-output SHA256SUMS verification

The archive is **not a website launch**.

## Phase B: Get the archive onto the owned public edge

Transfer the exact archive through an authorized owner-controlled transfer mechanism to **Node001/Penguin**, which hosts the existing Fabric Caddy edge. Do not assume ssh/scp endpoints, credentials or public ports; never upload the raw private SQLite file to an unrelated host.

**Implemented GitHub courier (preferred):** On NextGen run `aiw-beta-courier-nextgen.sh` from an immutable reviewed release kit commit. It verifies the full public-safe static archive, creates a separate `release/aiw-beta-payload-270291e8a8c3` branch only if absent, and uploads only the historical public-data tarball plus a SHA-256 receipt into GitHub canonical storage. GitHub is only a file courier; it never serves the production site or runs a third-party product runtime. An exact matching branch may be safely reused; no force-push.

On Penguin fetch the immutable reviewed `aiw-beta-receive-penguin.sh` from the same release kit commit and run it with that SHA. It fetches the courier branch, verifies the independent SHA-256 receipt, audits existing Fabric/Caddy status read-only, then invokes the private stage script with `sudo`. **Neither script publishes or reloads Caddy.** Do not claim the transfer completed unless the NextGen output explicitly shows a successful GitHub push and the Penguin output shows SHA match and private staging.

On Node001, run `aiw-beta-edge-preflight.sh` read-only and review the existing `/etc/evercraft/Caddyfile` and `evercraft-public-edge.service`.

After transfer, run `sudo bash aiw-beta-stage-owned-edge.sh /path/to/archive.tar.gz`. This stages a verified content-addressed directory under `/srv/evercraft/infrastructure-watch/releases/`, preserving other services and any existing `current` pointer. It does not change the public edge.

## Phase C: A controlled public path launch (not automated from draft)

Proposed public entry point (only after the real route is verified):

`https://fabric.systemiacommandcenters.com/infrastructure-watch/`

The path avoids a speculative new DNS hostname and continues to use the owned Fabric HTTPS edge. **This URL is a proposed target, not a current-live link.**

`AIW-public-beta.Caddyfile.fragment` is a **proposal only**: insert its narrow `handle_path /infrastructure-watch/*` in the approved Fabric site block after reviewing live route structure. The route must not replace existing catchall Fabric, Journal, Systemia, Home, Worlds or other sites. On a shared edge where other `handle` blocks exist, reconcile the existing routing tree before using the fragment.

Before enabling route:
1. Save read-only backup of live Caddy config and current symlink, and confirm owner authority to modify this host.
2. Verify the release hash and all static file paths.
3. Stage a proposed `/srv/evercraft/infrastructure-watch/current` target only after safe rollback is prepared.
4. Validate a full candidate Caddy config using the actual installed binary and the existing edge environment.
5. Apply a minimal route-scoped change and reload Caddy without restarting Fabric.
6. From outside the home network, verify HTTPS, certificates, index, state polygons, 2025/2026 badges, Washington record details, mobile/touch/hover, errors, and CSP behavior.
7. Record production URL, immutable commit, archive hash, edge Caddy backup location, rollback plan, and external receipt in Systemia/GitHub. **Only then** mark beta live.

**Do not publish** if any gate above fails or if the public server identity/route ownership is ambiguous. A local HTTP PASS is not outside-in proof.

## Rollback

Preserve exact original Caddy config and previous current symlink. Restore only the AIW route/snippet and former current target, validate then gracefully reload Caddy; do not stop unrelated systemd units. Never destructively reset an existing shared Caddyfile.

## Boundaries

No Base44, new external runtime or new hosting provider. No source-data claims beyond documented FHWA years. Do not present condition ratings as live hazards, imminent danger or safe routes. No 2026 nationwide-coverage claim, and no emergency, repair-funding or maintenance-instruction claims until source-proven.
