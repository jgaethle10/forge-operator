# Sentinel Infrastructure Guard | defense-first extension

**Status:** Proposed passive evaluation kernel plus a read-only Linux node-audit CLI.
Neither is deployed monitoring, host hardening, or certification of safety.

Systemia Sentinel already owns life-safety anomaly correlation. This extension
accepts small, authenticated, *authorized* observation receipts and makes a
bounded operator-review decision. It introduces no second agent hierarchy.

## Why this exists

A warm freezer, unexpected defrost, disconnected controller, or silent node
can be caused by many things: ordinary maintenance, power failure, equipment
fault, misconfiguration, or hostile activity. Never assert a cyberattack from
one abnormal reading. Never assume silence means normal operation.

## First deployment: Evercraft-owned infrastructure only

1. Inventory **privately** each owned node, edge ingress, DNS replica, route,
   certificate renewal path, telemetry feed, backup and recovery path. Preserve
   owner, purpose, dependency, current software/firmware, and whether remote
   administration is truly necessary. Do not commit addresses, secrets,
   network diagrams, host-specific open ports, or credential details.
2. Assess currently exposed ingress **only through authorized inventory and
   existing operator records**. No Internet-wide discovery or probing.
   Review router forwarding, access control, SSH authentication, firewall
   defaults, software updates, and service-account scope with the operator.
3. Separate public ingress, management, private workers, and any future OT
   network into distinct policy zones. Avoid shared credentials, implicit
   trust, and uncontrolled lateral movement.
4. Require authenticated encrypted telemetry, identity rotation, least
   privilege, and fresh independent health receipts. Use a separate outside
   witness for critical public endpoints where feasible.
5. Confirm backup restoration and incident communications with deliberate,
   supervised exercises. Keep local/manual safety controls available.
6. Admit a node to protected status only after independently verified
   production receipts show that alarms reach a person and recovery works.

Existing Edge rules governing signed DNS zone snapshots, no public recursion,
and verified replica promotion remain mandatory. An active unit, CI pass, or
GitHub green check is never proof of external network protection.

## Read-only local assessment for Node001 and Node002

From a checkout that contains this PR branch, run as the ordinary, non-root
operator on each **owned Linux environment** (Debian and Ubuntu WSL):

```bash
node scripts/evercraft-node-security-audit.mjs
```

The CLI reads `ss -H -ltn`, `systemctl is-active` for common SSH units,
`sshd -T` for selected effective SSH defaults, and `ufw status` where
available. It executes commands without a shell, and makes **no network
connections, configuration changes, or privilege escalation attempts**.

The printed JSON includes only counts and classifications: no raw IP
addresses, listening ports, hostname, credentials, router topology, or
complete SSH/firewall rules. Keep even sanitized operational receipts private.

- Wildcard TCP bind is an **indicator for review**, not proof of public access.
- `sshd -T` with no connection context cannot establish every `Match` block
  or real access policy; its results are leads for operator validation.
- `ufw active` is **not** sufficient evidence of firewall enforcement.
  `ufw inactive` does not exclude nftables or upstream filtering.
- A service shown inactive does not exclude socket activation, containers,
  alternate init systems, or other remote access paths.
- No UDP audit, router port-forward inspection, patch-freshness assessment,
  real backup-restoration drill, external reachability test, or live threat
  detection is included.
- Run on the host whose security is in question; running on a CI runner or
  an assistant sandbox **does not** assess Evercraft-owned machines.

Use each report to form a prioritized, operator-approved remediation plan.
Avoid changing remote SSH or firewall rules without a known-good access path,
backups, and a verified rollback plan. Never expose a sensitive host report
through a public repository or application.

## Cold-chain and other physical infrastructure pilots

Only connect to equipment **owned by Evercraft or explicitly authorized in
writing** by its operator. Vendor consoles and device management interfaces
are not community infrastructure available for us to use.

Use passive read-only adapters. Start with separately powered temperature
measurements plus existing controller status and independent connectivity or
power evidence. Do not poll industrial controllers aggressively or execute
defrost, compressor, thermostat, refrigeration, power, valve, or safety-system
commands. Vendor approval and supervised safety analysis are required before
any operational integration.

Adapter responsibilities:
- Authenticate the origin and authorize the device/tenant outside this kernel.
- Normalize each source to opaque source_id and actual independence_group.
- Report one of normal, abnormal, safety_alarm, error, with checked_at.
- Keep high-resolution locations, raw telemetry, sensitive topology and
  secrets out of the public signal/event payload.
- Set conservative max_age_seconds per source. Use consistent timestamps.
- Avoid considering two controller-derived values independent witnesses.

Guard result:
- **healthy:** all required witnesses fresh, no reported anomaly.
- **watch:** one independent witness family reports abnormality.
- **elevated:** two or more independent groups report abnormality.
- **urgent_review:** an authenticated adapter reports a safety alarm;
  human/local confirmation is still required.
- **degraded/blind:** partial/complete loss of trustworthy coverage.

Each result retains attribution = undetermined, prohibits controller actions,
and explicitly separates a *reported* safety alarm from confirmed danger.

## Testing and release gates

Offline proof:
```bash
node --test systemia/sentinel/infrastructure-guard.test.mjs systemia/sentinel/node-security-posture.test.mjs
```

Tests cover independent anomaly signals, misleading same-controller witness
counts, reported safety alarms, stale/missing/error sources, future-dated
telemetry, SSH authentication findings, listeners, firewall evidence limits,
and privacy-minimizing outputs.

**Not yet accomplished:** installed sensors, live adapters, production node
audits, host hardening, WAN/firewall review, alert delivery, recovery drills,
real-world sensitivity/false-positive measurement, customer agreements, or
safety/OT certification.

No live roll-out or production declaration until those have independent
receipts. No autonomous changes to physical equipment.
