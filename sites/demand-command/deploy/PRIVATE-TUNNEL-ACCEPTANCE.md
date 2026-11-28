# Demand Command private tunnel field acceptance

**Field receipt:** November 23, 2026 (reported by owner from Penguin shell).

**Verified outcome:** an HTTP request from **Penguin** to its private loopback `127.0.0.1:18897` via the reverse SSH tunnel returned the exact HTML title from the NextGen Demand Command app:

```text
<title>Evercraft Demand Command | Private Console</title>
```

Verification used:

```bash
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:18897/ |
  grep -F '<title>Evercraft Demand Command | Private Console</title>'
```

Previously separately observed:
- NextGen local app resident at `127.0.0.1:18896`.
- Penguin dedicated `sshd` on Crostini port `8222`, ED25519 server key fingerprint `SHA256:NVPAF3rqN9wjkR10o0EvB7aI/PBFaYj17dfDYvI++Ck`.
- NextGen reached Penguin's dedicated SSH service through Chromebook LAN `192.168.88.3:8222` and verified that fingerprint via `ssh-keyscan`.
- Penguin SSH authorized the NextGen dedicated public key `SHA256:fyeshErB89g7fvv3d1uT07fvWTsS0IOg7mglIW5BcWE`.
- No private key or customer data is stored here.

**Acceptance scope:** Transport and Demand HTML identity across the *private* tunnel are proven as of this one test. Not yet proven: ongoing tunnel persistence after Windows/WSL restart, end-to-end API authorization, encrypted SQLite durability, or externally reachable HTTP/TLS.

**PUBLIC RELEASE HOLDS:** `https://demand.systemiacommandcenters.com` is **NOT VERIFIED LIVE**. Before publishing, confirm current DNS authority/records, inspect existing owned Caddy service binding and actual Caddyfile without disclosing secrets, generate private outer Basic-auth credentials locally, validate a minimal additive hostname route with backup and rollback, and check public TLS + unauthenticated 401 + authenticated inner token from outside LAN.

Do not publish buyer data, open the SSH tunnel on WAN, restart normal SSH, or replace the existing Evercraft Fabric/Caddy route.
