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

## Provisioning the Penguin SSH endpoint, owner-provided key available (November 20, 2026)

The NextGen owner generated a dedicated ED25519 key and shared **only the public half**, reporting fingerprint `SHA256:fyeshErB89g7fvv3d1uT07fvWTsS0IOg7mglIW5BcWE`. This value is an expected identity check, **not an authorized key grant by itself**; the installer reads the locally copied public key on Penguin and refuses any mismatch. Never commit or copy the private half.

The `install-penguin-demand-relay.sh` script installs a **separate systemd service**, `evercraft-demand-relay-sshd.service`, **not** default `ssh.service`. The staged `sshd-demand-relay.conf.example` policy specifies:
- Dedicated host ED25519 identity, separate from earlier system host key and its unverified comment.
- `Port 8222` in Crostini; ChromeOS must subsequently forward TCP 8222 **only from owner-approved LAN**.
- Service user `demandrelay` with `/usr/sbin/nologin`, `MaxSessions 0`, public-key-only authentication, `AllowTcpForwarding remote`, and remote listeners restricted to `127.0.0.1:18897`.
- `UsePAM yes` retains Linux account checks, but `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, and `AuthenticationMethods publickey` prevent password challenge sign-in.
- The public key lives in the service user's private home `/var/lib/evercraft/demandrelay/.ssh/authorized_keys` (mode 0600), where sshd can read it as the authorized account; the host private key and server config remain root-owned under `/etc/evercraft/demand-relay`.
- Authorized-key restrictions `restrict,port-forwarding,permitlisten="127.0.0.1:18897"` supplement the server's global forwarding-only controls. SSH key rotation is a separate reviewed operation, never silently performed by rerunning the installer.

If `$HOME/evercraft-demand-edge-canary` is already a clean clone of the feature branch, a fast-forward pull is sufficient. Otherwise clone separately without changing the canonical Penguin Forge deployment. Create a local public-key file **outside Git** and invoke the installer with `--install --public-key-file FILE --expected-fingerprint SHA256:...`; the command refuses missing/malformed or mismatched keys, a conflicting occupied listener, an unexpected preexisting service identity, or a differing installed SSH policy.

After successful installation, capture only the **new isolated Penguin host-key fingerprint**, active service status, and `ss -ltn '( sport = :8222 )'`. Do **not** report that the NextGen tunnel, ChromeOS forwarding, or public HTTPS route exists. No home-router WAN SSH forwarding is permitted.

**Failure recovery:** `sudo systemctl stop evercraft-demand-relay-sshd.service` stops only the new isolated listener if problems arise. Do not disable Fabric, restart the regular SSH service, or remove `/etc/ssh/sshd_not_to_be_run`.

## Dedicated SSH configuration staged after safe validation (November 20, 2026)

Penguin's owner-provided inspection reported:
- `sudo /usr/sbin/sshd -t` **PASS** after repairing `/run/sshd`.
- The normal `ssh.service` is **inactive** and `ConditionResult=no`. Its unit contains `ConditionPathExists=!/etc/ssh/sshd_not_to_be_run`; check whether the opt-out marker currently exists, rather than interpreting the condition as a damaged OpenSSH installation.
- The default service would listen on **port 22 on all interfaces**, with `passwordauthentication yes` and `allowtcpforwarding yes`. **Do not start the generic service or delete its opt-out marker just to make Demand Command reachable.**

The separately checked-in `sshd-demand-relay.conf.example` is inert; it documents a distinct SSH daemon on **Crostini port 8222**. That service allows only `demandrelay`, public-key authentication, **remote forwarding to Penguin loopback 127.0.0.1:18897**, and no shells/subsystems (OpenSSH `MaxSessions 0`). The config uses a **new, dedicated host key**, avoiding the unknown provenance of the current system SSH key comment.

Security gates before starting the isolated daemon:
1. NextGen generates a new ED25519 client identity locally (never send the private key to chat or the repo). Copy only its **public** key to Penguin through an owner-approved channel.
2. Penguin validates the separate `demandrelay` account, its service-user-owned private authorized_keys file, a dedicated ED25519 *server host key*, the config `sshd -t -f` output, and systemd unit before enabling **only the new relay service**.
3. NextGen pins Penguin's dedicated server host fingerprint through a trusted out-of-band procedure. Never use `StrictHostKeyChecking=no`.
4. ChromeOS explicitly forwards Linux TCP **8222** from the Chromebook LAN to Crostini. Verify the Chromebook's **host LAN address**, not Crostini 100.115.x.x. Never forward SSH from the household WAN/router.
5. Only after the reverse tunnel is present and serves exactly Demand Command's local HTML on Penguin loopback should the protected Caddy hostname and DNS be admitted.

Read-only check of the default SSH opt-out (safe on Penguin):
```bash
if test -e /etc/ssh/sshd_not_to_be_run; then
  echo "Normal SSH service intentionally held by opt-out marker"
else
  echo "Opt-out marker absent; inspect current conditions before any start"
fi
systemctl is-active ssh.service || true
```

## Step 2: Private NextGen-to-Penguin transport (field acceptance PASSED November 23)

The public edge runs on Penguin and its proxy cannot see NextGen's `127.0.0.1`: that loopback address means **Penguin itself**. We must establish an Evercraft-operated tunnel instead of pointing a Caddy proxy at the wrong machine.

Proposed: a dedicated **restricted SSH reverse forward** originating from NextGen and terminating at Penguin loopback:

```text
NextGen API:           127.0.0.1:18896 (private)
NextGen outbound SSH:  NextGen -> Penguin authorized SSH endpoint (NO third party)
Penguin tunnel socket: 127.0.0.1:18897 (private)
Penguin Caddy:         HTTPS demand.systemiacommandcenters.com -> 127.0.0.1:18897
```

Use a separate `demandrelay` SSH identity with key-based authentication and a server-side `Match User demandrelay` policy: `AllowTcpForwarding remote`, `GatewayPorts no`, `PermitListen 127.0.0.1:18897`, `PasswordAuthentication no`, `PermitTTY no`, `X11Forwarding no`, `AllowAgentForwarding no`, `ForceCommand /bin/false` if compatible with forward-only sessions. The key must be generated locally and never committed or shared. Verify Penguin SSH host-key fingerprint out-of-band before accepting it. **Do not run an open unauthenticated tunnel or enable blanket SSH forwarding.** This bridge was subsequently provisioned and passed the private Penguin loopback HTML identity test. See PRIVATE-TUNNEL-ACCEPTANCE.md.

Once the restricted account, host key, and SSH listener are independently verified, a supervised NextGen service can use a command equivalent to:

```bash
ssh -NT -o BatchMode=yes -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -R 127.0.0.1:18897:127.0.0.1:18896 \
    demandrelay@PENGUIN_AUTHORIZED_SSH_HOST
```

This is an **illustrative gated command**, not something to run until the endpoint and identity have been verified.

## November 23, 2026 HTTPS publication preflight: verified field facts

The owner ran `inspect-penguin-public-route.sh` on Penguin, returning:
- `evercraft-public-edge.service` **active**; `evercraft-fabric.service` **active**.
- Caddy **v2.6.2**, with `*:8443` (TLS-side internal port) and `*:18080` (HTTP-side internal port) listeners. These do not alone establish external public reachability or trusted TLS for the new hostname.
- Existing Demand route **not present** in `/etc/evercraft/Caddyfile`; one explicit `worlds.systemiacommandcenters.com` site line observed at line 74 using the owner's conservative grep. Other existing hostname handling may be routed differently and needs inspection before appending.
- `demand.systemiacommandcenters.com` **does not resolve**. `fabric.systemiacommandcenters.com` resolves to `50.46.190.39` from Penguin; this is a DNS observation, not domain ownership verification.
- Penguin `127.0.0.1:18897` listens **loopback-only** and HTTP response matches Demand Command's title. See `PRIVATE-TUNNEL-ACCEPTANCE.md`.

**Compatibility correction:** Caddy v2.6.2 recognizes `basicauth`, not `basic_auth` (renamed in v2.8). The staged `Caddyfile.demand.example` now uses `basicauth` and remains **INERT**: no DNS, Caddy, proxy, authentication or TLS configuration was modified on Penguin. Do not paste password hashes into GitHub or chat.

**Next accepted prerequisites:** identify authoritative DNS provider/nameservers, preserve all existing records, inspect Caddy global `http_port`/`https_port` and additive site semantics, then use a protected local password hash in a reversible staged Caddy candidate. Never reload a live service until candidate validation, DNS authority and rollback are confirmed.

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
