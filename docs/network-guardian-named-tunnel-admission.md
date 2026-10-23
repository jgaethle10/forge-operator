# Network Guardian: outbound tunnel production admission

Status: **NOT DEPLOYED**. Public Canary passed Oct 23, 2026 with an accountless Quick Tunnel; the production named tunnel, DNS control and service are not configured. See issue #1590 and PR #1591.

## Proof preserved
- `cloudflared version 2026.10.1` installed on Penguin.
- Quick Tunnel assigned `comparative-servers-convinced-finding.trycloudflare.com` (temporary, not production).
- Both `http://127.0.0.1:18888/` and temporary HTTPS URL returned `EVERCRAFT_NETWORK_GUARDIAN_OK`.
- UDP/QUIC and HTTP/2 prechecks passed, registered SEA edge connection. No Ziply inbound forwarding.
- Canary was intentionally isolated from Fabric. Quick Tunnel must never be reinterpreted as authorized production Fabric exposure.

## Immutable operator constraints
- Ziply router administration is inaccessible despite days of attempts. Do not instruct router admin login.
- No live production DNS changes before a tested staging hostname and explicit cutover gate.
- No unauthenticated publication of private Systemia operations, tokens, device control or remote job execution.
- Keep Node002 compute remote_jobs_enabled=false and pending shadow telemetry quarantine.
- Never paste a named-tunnel bearer token or login certificate into GitHub, ChatGPT, logs, shell history or copied terminal transcripts.

## Named tunnel staging gates
1. Verify operator Cloudflare account and a DNS zone that can legitimately host a **dedicated staging hostname**. Cloudflare Tunnel public hostname setup normally requires the domain's zone configured in Cloudflare. IONOS currently owns registration; no permission to change the zone or nameservers is inferred. Avoid using production `systemiacommandcenters.com` until zone control and rollback are demonstrable.
2. Create a **remotely managed named tunnel**, e.g. `evercraft-network-guardian-staging`, using dashboard > Networking > Tunnels. Named tunnel requires private bearer token. Store using restricted local root-owned file or approved private secret store; never transmit token through discussion or version control.
3. First route a temporary/staging hostname to a dedicated harmless canary on `127.0.0.1:18888`. Configure unmatched hostnames to HTTP 404. Enforce Access policies where needed; public canary can contain no privileged functionality or secrets.
4. Install a resident systemd cloudflared service with `Restart=always`, `NoNewPrivileges`, private configuration and credential permissions, and minimal filesystem/network privileges. Inspect the official `cloudflared service install` process or use a reviewable service unit; do not run a shell command containing the bearer token.
5. Verify independently: tunnel connected; external test page exact content; restart/reconnect after `systemctl restart`; failure and recovery receipts; Chromebook LAN change should not affect tunnel as long as outward internet works.
6. **Only after staging approval**, plan how dynamic Fabric public routes are protected. Live current Fabric loopback `127.0.0.1:8787` includes read-only MCP as well as other app endpoints; exposing the entire upstream via tunnel without a public-route allowlist and per-route authorization is **NOT AUTHORIZED**. Implement explicit route boundaries before public deployment.
7. For domain cutover preserve existing IONOS DNS and mail records; verify Cloudflare zone eligibility/full versus partial DNS support; preview on a separate hostname first. Capture current A/AAAA/CNAME/TTL/zone delegation, use rollback with bounded monitoring, and verify externally from multiple networks. Cloudflare Quick Tunnel hostname cannot be a permanent custom-domain endpoint.

## Current blocking dependencies
- Cloudflare account or named tunnel authority unverified.
- No authorized staging DNS zone/hostname known.
- No persistent tunnel token or service installed.
- No independently validated public-route policy for Fabric.
- Prior IONOS DNS automation missing `IONOS_API_KEY`; present access unverified.

## Immediate safe operator action
Use official Cloudflare dashboard to verify login, Networking > Tunnels visibility, and available domain zones. Do **not** disclose a generated token. Report only whether an account and a suitable staging zone are available.
