# Demand Command private HTTPS candidate: field acceptance

**Field receipt:** November 23, 2026. Owner ran the staging script on Penguin from branch `feature/demand-command-site-20261118`.

Command:
```bash
sudo python3 sites/demand-command/deploy/stage-penguin-demand-https.py --stage
```

Owner-reported results:
- `PASS: root-only candidate and SHA-256 receipt created. LIVE CADDYFILE UNCHANGED.`
- `PASS: Candidate Caddy adaptation and offline provisioning validated.`
- Original `http_port 18080`, `https_port 8443`, and Worlds configuration preserved byte-for-byte.
- Files staged privately as `/etc/evercraft/.Caddyfile.demand-candidate` and `/etc/evercraft/.Caddyfile.demand-candidate.receipt`.
- The private SSH tunnel `127.0.0.1:18897` had separately returned the exact Demand Command HTML title.

**No credentials, private hashes, customer records or Caddyfile contents belong in this receipt.**

**Stage status:** `PASS / STAGED_ONLY`. This does **not** mean the DNS record exists or the external hostname serves HTTPS.

**Release hold:** At the last verified read-only inspection, `demand.systemiacommandcenters.com` did not resolve. Configure and verify the `demand` CNAME pointing to the existing `fabric.systemiacommandcenters.com` hostname in the owner's current authoritative DNS zone, preserving all other records. After that, verify existing live Caddy SHA matches the staging receipt and externally verify TLS, unauthenticated HTTP `401`, and authenticated inner API access. The candidate is not automatically applied.

**Safety requirement:** Never paste the password or root-only candidate contents into GitHub, chat, logs or screenshots. Do not restart default ssh, change public WAN routing, or overwrite existing Fabric and Worlds configuration.
