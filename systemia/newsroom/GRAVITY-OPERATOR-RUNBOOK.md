# Journal Gravity: operator-controlled Clip continuity

Purpose: Publish an independently approved, source-cited Journal story through Evercraft Clip when the Journal URL is unavailable. Current native provider: Facebook Page.

## Authority boundaries

- A private editorial draft, distribution packet, Base44 row, CI pass, or accessible archive is NOT publishing authority.
- The actual Systemia release, 10/10 editorial review, claims receipt, separate distribution permission, and (for public safety) a qualified human review must exist before approval.
- Operator Ed25519 signature binds the entire exact release, story identity, copy, destination, and authorization. Never use test fixtures as production approvals.
- Signing does not post. Provider firing is manual-only and must return a confirmed remote ID and URL. Ambiguous provider failures require reconciliation, not retries.
- Keys, tokens and private credentials must stay off GitHub. The trusted public key must be installed independently of the untrusted story JSON.

## Privileged resident preparation

Provision a dedicated protected Ed25519 operator key pair outside GitHub, with a private key mode 0600. Example commands, only when authorized:

    umask 077
    openssl genpkey -algorithm Ed25519 -out /secure/private/journal-clip-operator.pem
    openssl pkey -in /secure/private/journal-clip-operator.pem -pubout -out /secure/public/journal-clip-operator.pub.pem
    chmod 600 /secure/private/journal-clip-operator.pem

Paths are illustrative, not proof the folders or credentials exist. Do not upload the private key to a repository, chat, or CI.

## Explicit offline operator signing

Review the source timestamps, rights, current official orders, copy, editorial gate, genuine Systemia release and qualified public-safety review. Prepare a release following evercraft.journal.clip-gravity-release.v1. From the protected node:

    node systemia/newsroom/journal-clip-gravity-sign.mjs \
      --input /secure/editorial/story-unsigned.json \
      --output /secure/editorial/story-signed.json \
      --story-id 'EXACT_STORY_ID' \
      --operator-id 'ACTUAL_OPERATOR_ID' \
      --key-id 'REGISTERED_KEY_ID' \
      --private-key-file /secure/private/journal-clip-operator.pem \
      --i-have-reviewed-evidence-and-copy

The command validates freshness and authority before writing the signed release and refuses to overwrite any existing signed file. Do not claim a signature exists until the command succeeds.

## Resident preflight and manual fire

    export EVERCRAFT_CLIP_GRAVITY_TRUSTED_PUBLIC_KEY_FILE=/secure/public/journal-clip-operator.pub.pem
    export EVERCRAFT_CLIP_GRAVITY_STATE_DIR=/persistent/evercraft/journal-clip-gravity
    export EVERCRAFT_CREDENTIAL_STATE_DIR=/persistent/evercraft/provider-credentials
    node systemia/newsroom/journal-clip-gravity.mjs /secure/editorial/story-signed.json

Run the independent **read-only resident readiness preflight** before a provider fire. It checks the trusted signed release, durable attempt ledger and the configured Page access token by making only a GET request for the Page identity. It does not attempt to create a post, and a successful identity read does **not** prove the Page token has `pages_manage_posts` permission:

    node systemia/newsroom/journal-clip-gravity-readiness.mjs \\
      --signed-release /secure/editorial/story-signed.json \\
      --trusted-public-key-file /secure/public/journal-clip-operator.pub.pem \\
      --state-root /persistent/evercraft/journal-clip-gravity \\
      --credential-state-dir /persistent/evercraft/provider-credentials \\
      --check-page-identity

This preflight emits a safe JSON receipt with no Page token, no private key, no provider mutation, and the next unblocked operator action. If the durable ledger records any previous attempt, it remains blocked for reconciliation. The state root must exist and be writable; it is not silently created by this check. The operator must separately confirm `pages_manage_posts` and authorized Page tasks before posting.

Only after confirming no prior remote publication and ensuring credentials resolve:

    node systemia/newsroom/journal-clip-gravity.mjs /secure/editorial/story-signed.json --fire

An attempt claim is durable before the Facebook provider call. Prior attempts block duplicate sends. An exclusive resident or shared authoritative claim store is still needed for multi-node safety.

## Current Toledo hold (October 21, 2026)

WTOL reported Toledo Fire & Rescue reduced the evacuation radius to one-half mile and lifted the shelter-in-place order at 5 p.m. Eastern. The older one-mile/three-mile social copy was paused. Obtain a fresh direct official map/order confirmation and qualified human review before any public-safety release. The signed-release gate must not be bypassed.

Journal owned-archive availability and Journal current-publication health are separate. Archive-only is degraded, not a healthy live newsroom.
