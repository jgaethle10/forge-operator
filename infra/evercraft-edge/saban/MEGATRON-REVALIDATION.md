# Megatron Edge DNS Revalidation Handoff

Purpose: revalidate Lux's Megatron as a **candidate** second Evercraft authoritative DNS node in a failure domain distinct from `evercraft-penguin`.

Historical hardware context is lineage only. It does not grant current access or placement authority.

## Preconditions

- Machine owner explicitly authorizes the bounded Evercraft Edge DNS role now.
- Ubuntu/Debian with systemd and Node.js 22+.
- The machine is on a router/WAN/power domain genuinely independent from Penguin's `home-wan-1`.
- No purchase or paid capacity is authorized by this handoff.
- Port-forwarding/NAT changes are limited to the DNS canary mappings created by the promotion script.
- The node remains `public-edge-candidate` unless the external canary succeeds.

## One-command promotion

Run from a current checkout of `jgaethle10/forge-operator`:

```bash
export EVERCRAFT_EDGE_OPERATOR_AUTHORIZED=true
export EVERCRAFT_FAILURE_DOMAIN="<distinct-domain-id>"
export EVERCRAFT_NODE_ID="evercraft-megatron"
sudo -E bash scripts/make-linux-edge-node.sh
```

Use a stable, non-secret failure-domain identifier that represents the actual independent network/power boundary. Do not use `home-wan-1`.

## What the command proves

1. current operator authorization was explicitly supplied;
2. NodeSeed installs with persistent device identity;
3. the resident Edge DNS runtime answers locally over UDP and TCP;
4. router discovery/mapping attempts public TCP+UDP 53 to the resident DNS listener;
5. distributed external probes correlate a random UDP DNS transaction with Evercraft's own runtime receipt ledger;
6. external TCP/53 reachability is measured;
7. only after those gates pass is `public-ingress` applied.

## What it does not prove

- production NS delegation readiness by itself;
- DNSSEC readiness;
- current domain-delegation mutation authority;
- direct external DNS-over-TCP application response identity.

Production delegation remains blocked until two distinct admitted nodes exist and the stronger TCP application proof plus fresh domain-control mutation challenge pass.
