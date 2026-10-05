# Raven Nexus Private Runtime

This is the first owned private Raven human runtime.

It is deliberately a command room before it is an AI persona.

## What it does

- binds only to loopback
- requires a server-side internal bearer authority token for private endpoints
- can bind sessions to an authenticated subject supplied by the trusted Evercraft gateway
- exposes a corporate team directory derived from the Systemia machine contract
- creates durable private command-room sessions
- records founder commands, Systemia mission references and receipt hashes
- preserves exact component keys plus founder-facing team labels
- keeps requested, planned, routed, held, authorized, executed and verified states distinct
- never grants execution authority
- boots without any external AI provider
- boots without Base44
- does not claim AI inference until a model runtime is actually attached
- remains useful after restart because session state is stored under the admitted Evercraft state directory

## Evidence boundary

Standalone Raven reports itself as `Raven Private Runtime`. It does not claim Evercraft Compute ownership until Compute actually starts it.

The health surface is sanitized. Control tokens are never returned to the browser, JSON responses, receipts or session files.

Systemia remains mission authority. Raven records a founder request and the resulting Systemia plan, but the existence of a route or receipt does not prove execution, authorization or verification.

## What it does not do

- no direct browser identity implementation
- no external communication
- no deployment or release
- no purchase or payment
- no specialist execution
- no model-generated conversational answer
- no public bind
- no provider credentials in receipts or session files

## Resident Systemia integration

The private runtime can be admitted as an optional resident service by Systemia Core. It remains disabled unless both `RAVEN_PRIVATE_STATE_DIR` and `RAVEN_PRIVATE_CONTROL_TOKEN_FILE` are bound into the owned runtime. The control token is read from a private file rather than passed as a command-line secret, and the runner rejects token files that are readable by group or others.

This is source and supervisor wiring, not a claim that Raven is already deployed on a live Evercraft Compute node. A deployment receipt can be bound separately through `RAVEN_PRIVATE_DEPLOYMENT_RECEIPT_FILE`.

## Provider boundary

`provider-secret-boundary.mjs` defines the Raven-side secret injection boundary for direct provider adapters such as the owned Kaggle/Numerai competition scout. Provider credentials are not persisted in Raven session receipts or public repository artifacts. Provider execution remains Systemia -> Raven Nexus -> provider API, never Base44 or public Fabric transit.

Authenticated Evercraft Home can later proxy into Raven through governed Evercraft Identity and Passport primitives. Sovereign or external model inference remains a separate optional layer.
