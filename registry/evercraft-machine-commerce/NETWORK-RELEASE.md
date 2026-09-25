# Evercraft Network Machine Commerce release gate

This branch stages official MCP Registry metadata for Evercraft Machine Commerce v1.2.0. It is deliberately downstream of runtime verification.

## Exact source candidates

Evercraft Network:
- Base44 app: `6a983e0ad004be753d51d569`
- checkpoint: `6ab5562556ac9d9ba16944f3`
- source commit: `ed27bf1e1bc8c3343b8ec044b55cfe3cf1f17bfb`
- QA: lint PASS, build PASS, `NETWORK_AGENT_GATEWAY_QA_OK`

Evercraft Machine Commerce:
- Base44 app: `692b4178919afe7d08c4d2b8`
- checkpoint: `6ab556277fdb82fe4c06a5c0`
- source commit: `7ee829e568d3d8dfdfb019b5be376d92c440101f`
- QA: lint PASS, build PASS, catalog consistency PASS with 37 entries, Systemia release policy PASS, `MACHINE_COMMERCE_NETWORK_QA_OK`

## Required public readback before merge

The deployed remote MCP must report version v1.2.0 and expose:
- `get_network_capabilities`
- `get_network_presence`
- `prepare_network_handoff`

The deployed catalog must contain exactly one `evercraft-network-resilience-membership-v1` record with:
- `commercial_state=discovery_only`
- displayed Founding Membership $9.99/month, up to five devices
- `billing_live=false`
- reservation creates no charge and no paid entitlement

The deployed Network agent gateway must verify read-only capability, public-presence and human-handoff responses.

## Hard safety boundary

No autonomous enrollment, payment, device control, carrier control or emergency routing. No private topology, fleet telemetry, precise private locations, secrets, session material or private device identity exposure. No claim of cellular service, SIM/eSIM, carrier priority/preemption, 911/PSAP integration, emergency backhaul, guaranteed geographic coverage, device-wide tunneling or physical hardware.

## Publication gate

Do not merge this branch merely because source QA passes. After Base44 noninteractive production deployment and public readback pass, merge to `main`. The existing GitHub OIDC workflow will then publish `registry/evercraft-machine-commerce/server.json` to the official MCP Registry.

This file is a release-dependency receipt, not evidence that v1.2.0 is already live or registry-published.
