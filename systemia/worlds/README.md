# Evercraft Worlds / owned vault

**Status: source integration and local/CI end-to-end proof, not a verified public deployment.**

The vault is a separate native Node process. Never turn the read-only CHUM public-origin server into a generic writable service. Point a trusted owned TLS edge route at the private upstream only after the isolated process and durable volume are ready.

## Run locally on Node 22+

```bash
node systemia/worlds/worlds-vault-runtime.mjs \
  --host 127.0.0.1 --port 8788 \
  --public-root "$PWD/public" \
  --data-root "$HOME/.local/state/evercraft/worlds-vault"
curl -fsS http://127.0.0.1:8788/worlds/api/health
```

The vault serves `/worlds/` and `/worlds/api/` on the same origin. On a static-only host, the **Save online** button is hidden; existing local saves and fragment-link sharing continue to work. Never expose the private data directory under `public/`.

## Small, unlisted world contract

- `GET /worlds/api/health` identifies a running, writable vault, not public TLS reachability.
- `POST /worlds/api/worlds`: JSON `{"scene_token":"<canonical, allowlisted token>"}`; creates a random 128-bit unlisted world ID, rev 1 and a 256-bit edit capability issued **once**.
- `GET /worlds/api/worlds/:id`: public read for anyone possessing the unlisted ID; no indexing, no user account, no secret returned.
- `PUT /worlds/api/worlds/:id`: same token schema plus `Authorization: Bearer <edit capability>` and `If-Match: "<revision>"`; conflicts fail (HTTP 409), not last-writer-wins.
- Store only world sky and up to 40 allowable scene objects. No player coordinates, account identity, character memories, conversations or custom scripts.
- Creator edit tokens are stored only on their device in localStorage, **never in the shared URL**. Browser storage loss means edits cannot be recovered without a copy of the token. This is a capability system, not login/account recovery.
- Guest visits use `#world=<id>` with an explicit opt-in preview. `Save copy` has a confirmation before replacing a local save.
- The file store is finite: at most 2,000 worlds by default, 10 creations per network address per ten minutes, max 12KB request body. These are small-scale anti-abuse measures, not enterprise multi-tenant protections.
- Writes use temp files, atomic rename and a per-world in-process serial queue. Restart durability is covered by tests. Cross-process locking, backups, audit logging, quotas, moderation, retention/deletion tools and distributed scaling are **not** implemented.

## Deployment gate (not completed)

1. Start the vault as a user service with a private persistent volume and filesystem owner-only permissions.
2. Route `/worlds/` including `/worlds/api/` to its 127.0.0.1 listener through an already-controlled HTTPS edge, preserving the exact host.
3. Check external TLS, GET health and actual POST/GET/PUT from a fresh device, and record a deploy receipt.
4. Confirm restarts retain scene files and that the public site cannot read vault storage.
5. Introduce durable backup and operational abuse/recovery controls before offering paid storage.

No GitHub Actions test here asserts that production ingress, DNS, TLS, device-specific Safari performance or real customers are live.


## Owned hardware release operations

**Merging this code does NOT activate public online saves.** The existing Evercraft public-edge runtime uses hostname leases. Give Worlds a dedicated, owned HTTPS hostname. Do not replace the Fabric, Journal or Saban routes, change shared Caddy settings, or expose port 8788 on the WAN.

### Resident service preflight and activation

On the intended owned Linux machine after updating its repository checkout:

~~~bash
# Dry-run: no filesystem/service changes
node scripts/install-evercraft-worlds-vault-user.mjs --public-origin https://YOUR-OWNED-WORLDS-HOST

# Opt in only after owned DNS, TLS and edge hostname routing are prepared
node scripts/install-evercraft-worlds-vault-user.mjs --public-origin https://YOUR-OWNED-WORLDS-HOST --activate
systemctl --user status evercraft-worlds-vault.service --no-pager
~~~

The Node 22+ user service binds only 127.0.0.1, uses private per-user state, and never edits DNS or shared ingress. The pinned HTTPS public origin fixes browser write-origin checks behind the edge's internal rewritten Host. Use the exact customer-facing hostname.

### Private backup and restore drill

~~~bash
node systemia/worlds/worlds-vault-backup.mjs backup \
  "$HOME/.local/state/evercraft/worlds-vault" \
  "$HOME/.local/state/evercraft/worlds-private-backups"

node systemia/worlds/worlds-vault-backup.mjs verify \
  "$HOME/.local/state/evercraft/worlds-private-backups/<backup-folder>"

# Offline only, to a NEW directory that must not exist
node systemia/worlds/worlds-vault-backup.mjs restore \
  "$HOME/.local/state/evercraft/worlds-private-backups/<backup-folder>" \
  "$HOME/.local/state/evercraft/worlds-vault-restored"
~~~

Backups include **hashed private editing capabilities** and unlisted IDs. Never share them in public files, web routes or GitHub artifacts. SHA-256 manifest checks help detect accidental corruption but are **not** signatures, authentication or encryption. Off-device encrypted backups, retention and key handling remain separate operational requirements. Restore refuses to overwrite an existing vault.

### External canary and deployment receipt

After activating a controlled HTTPS hostname lease:

~~~bash
node scripts/probe-worlds-public.mjs https://YOUR-OWNED-WORLDS-HOST
~~~

The external probe is read-only. It proves the public TLS URL serves the expected vault health, customer page, and client module. A GitHub Actions manual gate also accepts the repository variable EVERCRAFT_WORLDS_PUBLIC_ORIGIN. This is **not** sufficient for release: perform an authenticated create/update, a restart, and a separate physical-device read, then retain an operational deployment receipt.

### Explicit blockers before broad/paid public storage

- The current creation limiter keys on the TCP peer. Visitors behind the same edge proxy share a 10-per-ten-minute quota; implement a trusted, spoof-resistant gateway identity/rate design for general release.
- The initial store is limited to 2,000 scenes of 40 objects; no account recovery, automated backup rotation, customer deletion, moderation, distributed locking, or multi-node persistence exists yet.
- Passing source tests or a read-only canary does not establish paid customers, reachable DNS, working write permissions on the public edge, or real iOS Safari performance.

## Unpublishing a shared world

A creator can now select **Unpublish online** in World Builder after publishing. The vault requires the creator's capability and current revision, then removes the active world record. Public visit links return 404, and the local browser world remains unchanged. A creator must confirm the action. This action does **not** purge previously made private offline backups, screenshots, exported JSON or copies saved by guests. Operator backup-retention and customer data-deletion policies are still necessary for public launch.

World creation is serialized within one process so parallel requests cannot bypass the 2,000-record capacity setting. This does **not** provide distributed multi-process coordination, customer identity, or full public abuse/rate governance.

## Dedicated owned edge route and renewable Worlds lease

The existing Evercraft public edge is the only intended public ingress for Worlds. The new route client and user timer only manage a Worlds-specific route. Neither changes the shared Fabric routes, DNS, router configuration, Caddy, or certificates. No public service is activated by a merge.

On the owned Linux node, start the private vault with its correct HTTPS public origin first. Then, after the existing edge controller is running, use these commands from the repository checkout:

~~~bash
# Read-only inspection. No lease is created.
node scripts/route-worlds-owned-edge.mjs --edge-control http://127.0.0.1:YOUR_EDGE_CONTROL_PORT --vault http://127.0.0.1:8788 --public-origin https://worlds.YOUR_OWNED_BASE_DOMAIN

# An explicitly operator-authorized lease with REAL deployment identity/receipt.
node scripts/route-worlds-owned-edge.mjs --reconcile --edge-control http://127.0.0.1:YOUR_EDGE_CONTROL_PORT --vault http://127.0.0.1:8788 --public-origin https://worlds.YOUR_OWNED_BASE_DOMAIN --deployment-instance YOUR_ACTUAL_DEPLOYMENT_INSTANCE --deployment-receipt-hash YOUR_ACTUAL_DEPLOYMENT_RECEIPT_HASH
~~~

The route TTL is one hour. If the edge control requires authorization, provide EVERCRAFT_EDGE_CONTROL_TOKEN as a private environment variable, never a CLI argument or public log. The lease receipt is stored under the user's private state directory and is explicitly marked external_https_verified=false.

A renewable user-systemd timer can be prepared using scripts/install-worlds-edge-keeper.mjs with the same flags. Without --activate the installer is dry-run and changes nothing. With explicit --activate it installs only a Worlds lease-keeper service and a 15-minute timer; it may write a 0600 private environment file for the edge token. Check file permissions and the operator's approval first.

Fail-closed checks require: loopback-only vault and edge control, correct vault-pinned public origin, TLS-admitted wildcard HTTPS edge, a dedicated worlds subdomain of the owned base domain, and real deployment receipt identity. The reconciler renews its own lease, and can recreate it after an edge restart without changing route targets.

These source and local-proxy tests do not prove public DNS, TLS end-to-end, external POST or Safari. An independent external read-only probe using scripts/probe-worlds-public.mjs and an owner-approved authenticated create/update/unpublish drill on a real iPhone remain the next launch gates. Shared reverse-proxy client rate limits, backups, deletion retention, accounts, and recovery remain separate readiness requirements.

## Gateway client attribution (source hardening)

The Worlds-only edge lease now **overwrites**, rather than trusts, incoming `x-worlds-client-ip` and `x-forwarded-for` headers with the TCP peer address. Only when the vault is configured with its exact HTTPS public origin and receives the edge-stamped address over loopback does it use that address for its per-client creation quota. Browser-supplied forwarded headers cannot select a different bucket through the owned proxy. Other Evercraft leases keep their previous header behavior. The limiter remains 10 creations per client per ten minutes, with bounded in-memory tracking. It is per process and IP-based: shared NATs still share a quota, restarts reset buckets, a trusted same-host process can spoof loopback headers, and edge/host DDoS defenses remain outside this release.

## External write proof (explicit operator opt-in)

**The repository does not activate this automatically.** After the owned Worlds HTTPS route is deployed and the read-only canaries pass, a trusted operator can execute a disposable write drill from outside the local network:

~~~bash
# No mutations without --execute. The command fails closed.
node scripts/probe-worlds-write.mjs https://worlds.YOUR_OWNED_BASE_DOMAIN

# Operator-authorized verification of an actual live endpoint:
node scripts/probe-worlds-write.mjs https://worlds.YOUR_OWNED_BASE_DOMAIN --execute
~~~

The `--execute` path checks read-only HTTPS identity and the vault's exact pinned public origin, then creates **one blank unlisted test world**, reads it back, proves a stale revision cannot overwrite it, updates the sky, checks its revision and content, and unpublishes it. It verifies the old visit link returns HTTP 404. Cleanup is attempted even when the test fails, with one retry. The JSON receipt contains no editing capability, scene payload, personal data, or private token. A failed cleanup marks the release **not verified** and may include an orphan world ID for private operator follow-up; a failing attempt is not guaranteed to leave zero server state.

The manual GitHub Actions **Evercraft Worlds external release gate** defaults to read-only. An explicit `allow_disposable_write=true` dispatch runs the write drill after the read-only Worlds, Heritage and Hidden World gates succeed. It uploads only the sanitized receipt. This is a test on one endpoint, not a physical iPhone Safari test, continuous monitoring or a guarantee of availability.

Public release requires passing external receipts and a separate, real-device iPhone create/save/return/share/unpublish check with the intended public TLS route. Do not label Worlds online saving live from source CI alone.

## One-command, non-mutating launch diagnostic

On the owning Linux computer, from the repository checkout:

~~~bash
node scripts/worlds-launch-diagnostics.mjs
~~~

Set the real owned hostname with the private environment variable `EVERCRAFT_WORLDS_PUBLIC_ORIGIN`, or pass `--public-origin https://worlds.YOUR_OWNED_BASE_DOMAIN`. Optional `--vault`, `--edge-control`, and `--backup-root` flags support alternate locally-owned paths. `EVERCRAFT_EDGE_CONTROL_TOKEN` is read from the private environment, never printed in the result.

The diagnostic inspects five prerequisites **without any mutations**: the owned HTTPS origin, a healthy pinned loopback vault, the latest integrity-verified private backup, the existing TLS-admitted owned edge, and an external read-only HTTPS Worlds probe. It returns a structured JSON receipt with the first next action. A missing hostname, failed backup, proof-only edge, or failed HTTPS route produces a blocked receipt and nonzero exit status.

Even a completely green diagnostic reports only `ready_for_disposable_write_drill=true`, not a live public launch. It never creates a world, starts a service, renews a lease, installs a timer, or performs customer writes. The next gate remains a separately authorized `node scripts/probe-worlds-write.mjs ... --execute` through the public HTTPS origin, followed by real iPhone Safari verification.
