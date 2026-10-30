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
