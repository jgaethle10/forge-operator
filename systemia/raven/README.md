# Raven Nexus Private Runtime

This is the first owned private Raven human runtime.

It is deliberately a command room before it is an AI persona.

## What it does

- binds only to loopback
- requires an internal bearer authority token for every private endpoint
- exposes a corporate team directory derived from the Systemia machine contract
- creates durable private command-room sessions
- records founder commands and Systemia routing receipts
- preserves exact component keys plus founder-facing team labels
- never grants execution authority
- boots without any external AI provider
- does not claim AI inference until a model runtime is actually attached

## What it does not do

- no external communication
- no deployment or release
- no purchase or payment
- no specialist execution
- no model-generated conversational answer
- no public bind
- no provider credentials in receipts or session files

The next integration step is to register `systemia.raven-nexus.v1` as a managed Evercraft Compute/Yard workload, then let authenticated Evercraft Home proxy into it under Passport scope. Sovereign or external model inference can be attached later as an optional, explicitly evidenced capability.
