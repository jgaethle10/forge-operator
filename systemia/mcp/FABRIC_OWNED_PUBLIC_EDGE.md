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
