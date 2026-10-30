# Evercraft Clip: owned campaign-state migration

**Status: source implementation and tests; not a production cutover.**

Base44 remains a **legacy extraction source only**. The migration deliberately **does not** move provider credentials, infer publication receipts, reactivate historical publication schedules, or claim private data has reached production.

## What this slice does

- Accepts a private export under `evercraft.clip.legacy-export.v1` with **all five** tables: `SocialPage`, `DistributionCampaign`, `ContentPackage`, `CampaignReleaseSlot`, and `MediaDistributionEnvelope`.
- Builds stable local IDs, resolves release-slot foreign keys, and proves counts plus a deterministic SHA-256 digest.
- Whitelists data fields. Passwords, OAuth tokens, provider session cookies, legacy record IDs and unsupported metadata are not copied into the snapshot.
- **All records import in held/draft form**. Historical `published` flags are informational; they never grant authority. Past `not_before` values are evidence only, not active scheduled jobs.
- Keeps Havenly Cleaning, Evercraft Property Services, and R&B Chicken & Soul explicitly excluded.
- Preserves only source-video location *for private migration evidence*. Signed query strings are stripped. `media_url` remains `null` until a separately verified owned-object-storage transfer.
- Stages one private, immutable, idempotent JSON snapshot on an authorized Evercraft host. No API tokens or private campaign rows should be committed to GitHub.

## Usage on an authorized Evercraft operator host

1. Privately extract and reconcile all five legacy table exports. Do not paste customer data, secrets, or provider tokens into GitHub. Source is a JSON object:
   ```json
   {
     "schema": "evercraft.clip.legacy-export.v1",
     "records": {
       "SocialPage": [],
       "DistributionCampaign": [],
       "ContentPackage": [],
       "CampaignReleaseSlot": [],
       "MediaDistributionEnvelope": []
     }
   }
   ```
   Each record can include the legacy `id` to resolve release-slot references; the imported snapshot replaces it with an opaque local ID.
2. Dry run:
   ```sh
   node systemia/clip/owned-campaign-migrate-cli.mjs --export /private/clip-legacy-export.json
   ```
3. When a private, persistent `EVERCRAFT_CLIP_STATE_DIR` is mounted outside web roots and source checkouts:
   ```sh
   node systemia/clip/owned-campaign-migrate-cli.mjs --export /private/clip-legacy-export.json --state-dir /var/lib/evercraft/clip --commit
   ```
4. Compare source counts and record fingerprints against the legacy table export before proceeding. A changed source snapshot requires a new migration version; existing staging files are immutable and conflict rather than overwrite.

**No public publishing is performed by these commands.** A migrated draft is not a public social post.

## Cutover gates

The contract in `systemia/migrations/base44-exit/slices/evercraft-clip-owned-cutover.json` remains authoritative. Pending gates: complete source export and delta reconciliation; owned media copy and SHA verification; direct OAuth reauthorization to Evercraft's secure vault; owned persistent runtime deployment; exact provider account selection; Facebook first-comment workflow; real provider post IDs and permalinks; rollback and observation window.

The existing video-publishing adapter work is tracked separately in [PR #1593](https://github.com/jgaethle10/forge-operator/pull/1593). That PR has not been wired to production credentials or merged. Do not transfer an old brand-scoped publication authorization to Relay.

## Other Evercraft products

The estate-wide migration plan is already under `systemia/migrations/base44-exit/`, with at least 100 legacy applications observed on 2026-10-17. This importer is a **Clip slice**, not proof of enterprise-wide migration. Repeat evidence-backed extraction, integrity checks and owned cutovers for Systemia, EPS/Havenly, FindMyPart, Raven/Guardian, media products and the remainder. Legacy app deletion is last, never the first step.
