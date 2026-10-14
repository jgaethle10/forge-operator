# Shadow Continuity | Evercraft Compute

This provider-neutral module is a source-only, read-only assessment of **stored** device-shadow telemetry. It contains no remote connector, outbound network calls, credentials, file writes, command execution or device enrollment. It does not grant a lease.

## Data contract

The trusted caller passes a private node key, a source adapter, exact nonce/sample prefixes, server-accepted samples and nonce metadata (up to 2,000 each), registry and authority records, and the observation clock. This public source intentionally contains **no live device identity, hostname, IP, token, key or private telemetry**.

The module reports observed heartbeat intervals and evidence-linked digests over 2, 6 and 24 hours, as well as gaps and uptime-counter reversals with precise timestamps. It rejects ambiguous duplicate sample IDs and nonce keys rather than silently accepting them. It never claims that SHA-256 linkage re-verifies the original Ed25519 signature or closes a concurrent nonce replay race.

**Important:** Receipt intervals are not physical computer uptime. A reversal in a reported uptime counter is an investigation cue, not an independently proven reboot. A successful synthetic GitHub Actions test is not a live HP-origin result.

## Field operator handoff

A trusted operator must separately inspect the machine's actual Windows sleep/reboot events, WSL startup, systemd and scheduled task logs, and the signed sender's restart behavior. Do not reinstall the working sender solely to diagnose an interruption. Obtain source-only machine-origin custody evidence before beginning any separate work-permit path.

Production requires independent signed issuer/root commissioning, transactional replay claims, bounded sandbox, external observer proof, revocation and Systemia admission. The existing shadow transport is not a command channel. No change to EV/RIVET/AliEV held products is authorized.

Run the synthetic negative and positive checks with:

    node --test tests/shadow-continuity.test.mjs

The workflow is intentionally source-only and read-only.
