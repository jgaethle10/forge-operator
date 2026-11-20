# Demand Command: resident app and owned HTTPS address

**Target (NOT LIVE until independently verified):** `https://demand.systemiacommandcenters.com/`

**Source authority:** GitHub `jgaethle10/forge-operator` branch `feature/demand-command-site-20261118`, draft PR #2261. **Mission authority:** Systemia. **Runtime:** existing Evercraft-owned NextGen + Chromebook/Penguin public edge. No Base44, Wix, GitHub Pages, rented SaaS runtime, or third-party proxy/tunnel.

## Why the local page disappeared

The owner closed the terminal running `python3 server.py`. That foreground process stops when its terminal/session ends. This is a process-liveness issue, not evidence that a public hostname was established. The earlier `http://127.0.0.1:18896/` is an address **only on NextGen**, not a public URL.

## Step 1: Keep Demand Command running without an open terminal (NextGen)

```bash
cd "$HOME/evercraft-demand-canary"
git status --short
git pull --ff-only
bash sites/demand-command/deploy/install-nextgen-resident.sh --check
bash sites/demand-command/deploy/install-nextgen-resident.sh --install
```

The script touches **only** the Demand Command user service/environment, never Revenue Desk, Fabric, router mappings or unrelated applications. It generates a private 0600 token file on first install, preserves an existing file, reuses the existing local Demand SQLite state path, and enables restart-on-failure under `systemd --user`. A non-Demand service occupying port 18896 stops the installer. The installer never opens a WAN port or changes DNS.

To retrieve the private token **on the machine only**:

```bash
bash sites/demand-command/deploy/install-nextgen-resident.sh --show-token
```

No screenshots or transcripts of the token. The app requires it after HTTP Basic authentication once the public route is admitted.

Check:

```bash
systemctl --user status evercraft-demand-command.service --no-pager
curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:18896/ | grep -F '<title>Evercraft Demand Command | Private Console</title>'
```

User service survival across logout depends on `loginctl show-user "$USER" -p Linger`. An administrator may allow `sudo loginctl enable-linger "$USER"` after reviewing local policy. **WSL2 does not guarantee it will start at Windows boot unless WSL itself starts.**

## Penguin field inspection: Crostini SSH boundary (2026-11-20)

Observed on Penguin:
- `evercraft-public-edge.service` active, Caddy installed, HTTPS listener on `:8443`. Existing Fabric must remain untouched.
- `/usr/sbin/sshd` installed; `ssh.socket` inactive. The earlier report `ssh.service enabled` does **not** establish that the service is listening.
- Linux `eth0=100.115.92.205/28` is a **Crostini private/virtual interface**, not a verified Chromebook LAN address. Do not use it as NextGen's SSH destination.
- The existing ED25519 public host key has SHA256 fingerprint `mQe0aOyNruEDV527WUh1fbxktl1A4xdxryGgMaZ7pzw`. Its comment says `root@kokoro-gcp-ubuntu-prod-97659191`. Comments alone do not authenticate a key's origin, so treat this as **identity-unverified** until a separately verified host-key record exists. Do not blindly accept a prompt from NextGen.
- ChromeOS Linux port forwarding supports **unprivileged ports**, ordinarily 1024–65535. Chromium's Crostini SSH developer guide recommends a non-22 port (example 8222). **Use an isolated restricted SSH endpoint on 8222**, not ChromeOS port 22, after access policy and key custody have been reviewed. Do not enable generic password SSH or route SSH from the internet.

Read-only diagnostics:
```bash
systemctl is-active ssh.service || true
sudo /usr/sbin/sshd -T | grep -E '^(port|listenaddress|allowtcpforwarding|gatewayports|passwordauthentication|permitrootlogin|pubkeyauthentication) ' || true
ss -ltn '( sport = :8222 or sport = :22 or sport = :18897 )'
ip -4 route show default
```

**Need owner-controlled Chromebook host LAN IP** from ChromeOS network settings, not Crostini `ip addr`. Before any NextGen SSH probe, set up a dedicated restricted high-port endpoint, then explicitly enable ChromeOS Linux port-forward TCP 8222 to that exact endpoint. This is LAN availability only and may need to be reenabled after Chromebook restart. The household router must **not** forward WAN SSH.

ChromeOS references: https://developers.google.com/chromeos/app-development/develop/port-forwarding and https://www.chromium.org/chromium-os/developer-library/guides/containers/crostini-developer-guide/

## Step 2: Private NextGen-to-Penguin transport (held pending evidence)

The public edge runs on Penguin and its proxy cannot see NextGen's `127.0.0.1`: that loopback address means **Penguin itself**. We must establish an Evercraft-operated tunnel instead of pointing a Caddy proxy at the wrong machine.

Proposed: a dedicated **restricted SSH reverse forward** originating from NextGen and terminating at Penguin loopback:

```text
NextGen API:           127.0.0.1:18896 (private)
NextGen outbound SSH:  NextGen -> Penguin authorized SSH endpoint (NO third party)
Penguin tunnel socket: 127.0.0.1:18897 (private)
Penguin Caddy:         HTTPS demand.systemiacommandcenters.com -> 127.0.0.1:18897
```

Use a separate `demandrelay` SSH identity with key-based authentication and a server-side `Match User demandrelay` policy: `AllowTcpForwarding remote`, `GatewayPorts no`, `PermitListen 127.0.0.1:18897`, `PasswordAuthentication no`, `PermitTTY no`, `X11Forwarding no`, `AllowAgentForwarding no`, `ForceCommand /bin/false` if compatible with forward-only sessions. The key must be generated locally and never committed or shared. Verify Penguin SSH host-key fingerprint out-of-band before accepting it. **Do not run an open unauthenticated tunnel or enable blanket SSH forwarding.** This bridge is not provisioned by this PR.

Once the restricted account, host key, and SSH listener are independently verified, a supervised NextGen service can use a command equivalent to:

```bash
ssh -NT -o BatchMode=yes -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -R 127.0.0.1:18897:127.0.0.1:18896 \
    demandrelay@PENGUIN_AUTHORIZED_SSH_HOST
```

This is an **illustrative gated command**, not something to run until the endpoint and identity have been verified.

## Step 3: Owned public HTTPS edge + DNS (held pending proof)

Use the separately staged `Caddyfile.demand.example` as an **additional hostname block**, not a replacement for `/etc/evercraft/Caddyfile`. Do not restart the public Fabric edge or overwrite existing routes until a safe backup, Caddy syntax validation and rollback are established.

1. Independently verify Evercraft domain administration of `systemiacommandcenters.com`. Add a **specific** CNAME for `demand` to `fabric.systemiacommandcenters.com`, *only* if the existing Fabric DNS/public IP and edge topology are still valid. Preserve all other DNS, including email records.
2. On Penguin, create a separate strong Caddy **HTTP Basic** credential, locally hash it with `caddy hash-password`, and place the hash into a protected local edge configuration. This is the outer login gate; the Demand API bearer token remains independently required. Do not commit a real password hash to the repo.
3. Verify `curl` from **Penguin** to `http://127.0.0.1:18897/` returns the exact Demand Command HTML identity before the Caddy route is enabled.
4. Back up the current Caddyfile, incorporate only the new hostname block, run `caddy validate` with the **same environment and global-port settings** as the resident edge service, then reload the **existing** Caddy service. Do not launch a second competing Caddy instance.
5. Independently verify trusted TLS from an **external network**. Unauthenticated access to `https://demand.systemiacommandcenters.com/` must return 401 before any HTML or buyer data; authenticating outer Basic + inner bearer token must show the private UI. Confirm security headers and no public search indexing. Verify service survives browser/terminal closure and restores after planned restart.
6. Verify the private source-review bridge from Penguin to NextGen. The current `/api/revenue-desk-review` inside the NextGen process still queries **local NextGen** port 8795, which is correct through this transport. Do not move the database or call Penguin's unrelated port 8795.
7. For production use with real buyers, move the SQLite file to an Evercraft-owned encrypted volume, implement browser sessions and authorization, and run security review. This initial edge is an **authenticated engineering canary**, not a public multiuser CRM.

### Stop conditions

Missing/unknown DNS authority, no trusted TLS, weak or absent outer auth, unresolved SSH trust, no authenticated local API, public data exposure, or a Caddy change that risks Fabric must all **HOLD**. A proposed hostname is not proof that the site is online.

## Evidence to report without secrets

- NextGen Demand user unit active + local title proof; status of user linger.
- Penguin tunnel listener bound to **loopback only** and exact service identity.
- Caddy validate success + rollback backup.
- External HTTPS status/TLS chain + unauthenticated 401 proof + authenticated owner-view receipt.
- Actual date and hash of the served release.

No private tokens, source messages, customer identities, or credential hashes in public PRs or chat.
