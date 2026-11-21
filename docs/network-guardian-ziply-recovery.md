# Evercraft Network Guardian: Ziply ingress recovery

## Hard constraint
**Ziply router administration is inaccessible to the operator.** Access has been attempted unsuccessfully for days. Do not instruct the operator to log into `192.168.88.1`, change router rules in the admin UI, or obtain router credentials as a prerequisite. This blocker is documented as [incident #1590](https://github.com/jgaethle10/forge-operator/issues/1590).

## Incident evidence (2026-10-23)
- Chromebook's ChromeOS LAN IPv4 changed from `192.168.88.5` to `192.168.88.3`; Crostini's `100.115.92.x` is not the host LAN IPv4.
- `/etc/evercraft/router-map.env` was changed to `EVERCRAFT_ROUTER_LAN_HOST=192.168.88.3` with an Oct 23 backup.
- Router returned `owned_mapping_drift` for Evercraft TCP 80 to 18080 and TCP 443 to 8443, both still bound to `192.168.88.5`. `upnp_ownership_preflight_hold` is a deliberate safety interlock.
- Local Fabric `/health` HTTP 200, local TLS with proper hostname/SNI HTTP 200, public `/mcp` curl 7 / HTTP 000; WAN IPv4 and public DNS A both `50.46.190.39` when checked.
- A healthy timer or successful exit does **not** verify public ingress.

## Safe diagnosis (no router writes)
```bash
node scripts/network-guardian-diagnose.mjs
```
Reads `/var/lib/evercraft/router-map/latest.json` and `/etc/evercraft/router-map.env` and reports one of: `OWNED_MAPPING_DRIFT`, `OWNERSHIP_UNVERIFIED`, `OWNERSHIP_CONFLICT`, `STALE_RECEIPT`, `PUBLIC_UNVERIFIED`, `PUBLIC_VERIFIED`, `INVALID_INPUT`, `INVALID_RECEIPT`. An error code on nonverified ingress is intentional. The classifier **never modifies router mappings or issues repair authorization**. Tests: `node --test tests/network-guardian-diagnose.test.mjs`.

## Recovery architecture
1. **Near-term:** Validate exact Evercraft descriptors, TCP ports, internal ports, router device and recorded owner identity. Engineer a guarded, rollback/retry-safe owned-only transition from the previous verified Chromebook address to the current verified address using authorized router protocol APIs. Do not blindly invoke DeletePortMapping or seize mappings; ambiguous ownership must halt.
2. **Resilience:** Treat DHCP reservation as optional unless a real authorized path to router DHCP settings exists. Provide an independent ChromeOS host-LAN identity source; the Linux container's interface is insufficient.
3. **Preferred:** Establish authenticated, outbound-initiated ingress via a stable managed relay/tunnel, with certificate/domain routing, tight origin access, reconnect/backoff, operator controls, logs, rate limiting and external availability checks. Choose the provider/cost/deployment explicitly before cutover. No live DNS changes until the relay proves operational externally.
4. **Verification:** Distinguish local application health, local TLS with SNI, UPnP mapping ownership, WAN/DNS alignment, and an **independent** public canary. Hairpin self-tests inside Crostini are advisory only.
5. **Rollout:** Preserve current Fabric `main` service, release gates and pending Node002 shadow telemetry quarantine; do not merge mismatched deployed router sources without reconciling actual running code. Do not include DNS ports 53 or 53053 in web ingress recovery.

## Exit criteria
- A host LAN-address change triggers a safely verified recoverable transition **or** public ingress stays up via the independent outbound relay.
- Unknown mappings always fail closed and are never erased.
- Public HTTPS externally verifies HTTP 200 with real SNI and is reflected in a timestamped receipt.
- Tests cover .5→.3, foreign mapping, changed internal port, partial transition, gateway inaccessible, ISP filters, stale receipts and retries.
- The support runbook never instructs the operator to use the unavailable Ziply admin page.
