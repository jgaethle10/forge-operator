# Evercraft Network Machine Commerce release gate

This branch stages the official MCP Registry metadata for Evercraft Machine Commerce v1.2.0.

## Required runtime changes before merge

The remote MCP and gateway must be independently verified to expose Evercraft Network as a public-safe discovery and human-handoff capability before this branch may merge to `main`.

Required Network tools:

- `get_network_capabilities`: read-only current public capability and claim-boundary report.
- `get_network_presence`: read-only evidence-safe public presence report.
- `prepare_network_handoff`: read-only tagged human URL for resilience, membership, or presence.

Required catalog entry:

- canonical public ID: `evercraft-network-resilience-membership-v1`
- commercial state: discovery only
- billing state: not live
- displayed Founding Membership: $9.99/month, up to five devices
- reservation creates no charge and activates no paid entitlement

## Hard safety boundary

Do not advertise or expose autonomous enrollment, payment, device control, carrier control, emergency routing, private device identity, private telemetry, precise private locations, operator/control-plane topology, guaranteed geographic coverage, cellular service, SIM/eSIM, 911/PSAP integration, emergency backhaul, or device-wide tunneling.

## Merge gate

Do not merge merely because source QA passes. Merge only after public readback confirms the updated remote MCP tool list and Network specialist responses. Merge then triggers the existing GitHub OIDC MCP Registry publication workflow.

This file is a release dependency receipt, not evidence that v1.2.0 is already live or published.
