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
