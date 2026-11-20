# Demand Command | NextGen to Penguin private tunnel

**Status:** Penguin dedicated SSH server is installed and listening at Crostini port 8222, but the LAN forwarding, NextGen SSH tunnel, DNS and public HTTPS remain **unverified/unreleased**.

Owner-supplied verified local identities:
- NextGen ED25519 client fingerprint: `SHA256:fyeshErB89g7fvv3d1uT07fvWTsS0IOg7mglIW5BcWE`
- Penguin's NEW dedicated server fingerprint: `SHA256:NVPAF3rqN9wjkR10o0EvB7aI/PBFaYj17dfDYvI++Ck`
- NextGen local Demand Command: `http://127.0.0.1:18896/`
- Target Penguin reverse-forward: `http://127.0.0.1:18897/` (local to Penguin only).

## ChromeOS action, no WAN changes

1. On **the Chromebook (ChromeOS settings, not Penguin shell)**, open Settings > About ChromeOS > Developers > Linux development environment > Port forwarding. Add **TCP 8222**, label `Evercraft Demand relay`, and toggle **on**. If this menu is missing on the specific ChromeOS version, stop here; do not assume the port is reachable.
2. From **Settings > Network > connected Wi-Fi**, find the Chromebook's **host LAN IPv4**, not Penguin guest's `100.115.92.205`. It should be an RFC1918 LAN address such as `192.168.x.x` or `10.x.x.x`.
3. Confirm NextGen and Chromebook can communicate on the local network (not blocked by client isolation). **Do not add router WAN forwarding for TCP 8222.**

See https://developers.google.com/chromeos/app-development/develop/port-forwarding .

## NextGen strict identity check

```bash
cd "$HOME/evercraft-demand-canary"
git status --short
git pull --ff-only  # only if the worktree is clean
bash sites/demand-command/deploy/install-nextgen-demand-tunnel.sh \
  --verify --lan-ip CHROMEBOOK_LAN_IP
```

The `--verify` mode asks the Chromebook host for Penguin's **ED25519 public SSH host key**, checks that it exactly matches `SHA256:NVPAF3rqN9wjkR10o0EvB7aI/PBFaYj17dfDYvI++Ck`, and refuses missing/wrong identity. It does not install a service, set a public route, or disable strict host checking.

Only after that passes:

```bash
bash sites/demand-command/deploy/install-nextgen-demand-tunnel.sh \
  --install --lan-ip CHROMEBOOK_LAN_IP
```

This installs an Evercraft-only `systemd --user` SSH service with a private 0600 known-hosts pin, preexisting NextGen identity, `StrictHostKeyChecking=yes`, `ExitOnForwardFailure=yes`, and `-R 127.0.0.1:18897:127.0.0.1:18896`. It does not publish the NextGen API to the network.

**Penguin independent readback after NextGen reports a running tunnel:**

```bash
ss -H -ltn '( sport = :18897 )'
curl --noproxy '*' -fsS --max-time 4 http://127.0.0.1:18897/ |
  grep -F '<title>Evercraft Demand Command | Private Console</title>'
```

Do not enable the HTTPS Caddy host until that returns the expected console title. A process reported active on NextGen alone is insufficient proof.

The `systemd --user` tunnel can survive terminal closure, but WSL2 must itself start after Windows reboot. Verify this separately. Never expose the relay SSH port on the household WAN.
