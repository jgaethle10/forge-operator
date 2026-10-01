# Evercraft Fabric: owned Chromebook public edge

This lane turns the already-tested native Evercraft Fabric MCP into a stable public HTTPS endpoint using the Chromebook and the household router instead of Base44 or a rented VM.

## Architecture

```text
OpenAI / public internet
        | HTTPS :443
        v
household router
        | port-forward 443 -> Chromebook:8443
        v
ChromeOS Linux port forwarding
        | TCP 8443
        v
Caddy in Crostini
        | loopback only
        v
Evercraft Fabric :8787
```

HTTP port 80 is forwarded to Chromebook port 18080 so Caddy can complete public certificate issuance/renewal. The MCP process itself remains bound to `127.0.0.1`; only the TLS reverse proxy is exposed.

## Install

From the Forge Operator repository:

```bash
sudo -v
bash scripts/install-fabric-owned-edge.sh \
  --domain fabric.YOURDOMAIN.com \
  --email YOUR_EMAIL
```

The installer creates resident systemd services for the Fabric MCP and Caddy edge, and installs a local helper for the OpenAI domain verification challenge.

## ChromeOS

Open **Settings -> About ChromeOS -> Developers -> Linux development environment -> Port forwarding**.

Add:

- TCP 18080, label `Evercraft HTTP`
- TCP 8443, label `Evercraft HTTPS`

ChromeOS describes this feature as making Linux ports available to other devices on the network.

## Router

Give the Chromebook a DHCP reservation if the router supports it. Then add:

- WAN TCP 80 -> Chromebook LAN IP, port 18080
- WAN TCP 443 -> Chromebook LAN IP, port 8443

If the router reports a private/CGNAT WAN address instead of a public address, direct inbound hosting will not work. In that case this lane must stop rather than pretending the endpoint is public; use another Evercraft-authorized public-edge candidate.

## DNS

Create an A record for the chosen hostname that points to the household public IPv4 address. A stable address or working dynamic-DNS update is required for review reliability.

## Verification

From cellular data or another network, verify:

```text
https://fabric.YOURDOMAIN.com/health
```

Then verify MCP initialization/tool discovery from outside the home network.

## OpenAI domain challenge

When the OpenAI plugin submission portal gives the exact verification token, run locally:

```bash
sudo evercraft-set-openai-challenge
```

Paste the token only into that local prompt. The helper stores it root-only and restarts Fabric. The server exposes the exact token at:

```text
https://fabric.YOURDOMAIN.com/.well-known/openai-apps-challenge
```

After verification, keep the endpoint live for review. Public-directory publication still depends on OpenAI review and explicit Publish after approval.


## Resident router-map recovery

When the household router supports UPnP IGD, Evercraft can keep the two public mappings resident without requiring the router admin password.

Install the refresh timer:

```bash
bash scripts/install-fabric-router-map-resident.sh \
  --gateway YOUR_ROUTER_IP \
  --host YOUR_CHROMEBOOK_LAN_IP
```

This installs a systemd timer that reasserts only:

- WAN TCP 80 -> Chromebook TCP 18080
- WAN TCP 443 -> Chromebook TCP 8443

It runs once after boot and every 10 minutes so a router reboot does not silently strand the public edge.


## Production trust class

The Chromebook/Crostini edge is admitted as:

```text
operator_authorized_public_edge
```

This is a production public-edge trust class, but it is **not** physical Node 001 certification. Crostini remains a virtualized Linux environment. The edge may serve production HTTPS because its public route, TLS, resident services, and exact Evercraft NodeSeed identity are verified independently.

The production trust chain is:

```text
public DNS + trusted TLS
  -> externally reachable Fabric
  -> /.well-known/evercraft-edge-attestation
  -> fresh verifier nonce
  -> local loopback NodeSeed /v1/attest
  -> Ed25519 signature
  -> exact NodeSeed device fingerprint
```

The allocator token never crosses the public edge. Fabric uses it only on loopback to request the signed NodeSeed attestation. The public response contains the signed attestation, public key, and identity statement, but no allocator authority.

The final admission receipt uses schema:

```text
evercraft.operator-public-edge-admission.v1
```

and must state all of the following before production admission:

- `state = production_edge_admitted`
- `trust_class = operator_authorized_public_edge`
- `public_https_verified = true`
- `trusted_tls_verified = true`
- `cryptographic_external_device_binding = true`
- `device_binding_state = signed_nonce_verified`
- `physical_field_certified = false`
- `node001_claimed = false`
- `base44_transport_required = false`

This lets the Chromebook be Evercraft's public front door without weakening or redefining the separate physical Node 001 evidence contract.

## Independent external witness

GitHub Actions runs `.github/workflows/chromebook-operator-edge-canary.yml` every ten minutes and on relevant edge changes. It is a verifier only, never runtime infrastructure. The workflow runs:

```bash
node scripts/fabric-edge-external-canary.mjs \
  --origin https://fabric.systemiacommandcenters.com
```

and stores a 90-day `fabric-operator-edge-canary.json` receipt. A failed external canary does not silently revoke the architecture or redirect traffic elsewhere; it marks current reachability unverified so the resident recovery path can repair the edge.

## Autonomous trust upgrade and recovery

The existing root-owned Fabric update timer also reconciles the signed-attestation wiring. When the local organism's NodeSeed receipt and allocator token exist, the updater safely adds their **file paths** to `/etc/evercraft/fabric.env`, restarts Fabric, verifies local health, performs a fresh signed nonce challenge, and only then writes a green update receipt.

No secret value is written to Git, emitted in updater receipts, or returned by the public attestation endpoint. If verification fails, the updater restores the previous environment and release.

The two local references are:

```text
~/.local/state/evercraft/organism/compute/nodeseed-receipt.json
~/.local/state/evercraft/organism/.secrets/allocator-token
```

The resident updater means an already-installed Chromebook edge can adopt this trust upgrade on its normal update cycle without a reinstall.
