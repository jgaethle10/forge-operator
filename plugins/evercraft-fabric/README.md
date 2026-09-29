# Evercraft Fabric plugin

Evercraft Fabric is the thin universal connector into the Evercraft/Systemia fabric.

The goal is not to duplicate every Evercraft product inside every host. The host gets one doorway. Systemia remains the nervous system behind that doorway.

## What the plugin exposes

- public problem-to-capability discovery
- authenticated host connection receipts
- Passport-filtered Context Fabric retrieval
- scoped host-event projection into Context Fabric
- action-intent preparation for later Systemia admission and Execution Gate review

## What installation does not do

Installing or connecting the plugin does **not** grant private context, admin privileges, payment authority, production authority, or permission to execute external side effects.

Private operations require a scoped Evercraft Fabric credential plus any matching Passport scopes. Host content is ingested as evidence and does not become instruction or inherited authority.

## Development MCP

The source package currently points to the local Forge/Yard runtime:

`http://localhost:3000/mcp/evercraft-fabric`

## Production publication state

Source package state: **gateway and plugin source staged, public production URL not yet claimed**.

The production MCP URL must come from the Evercraft Compute/Yard deployment path. Replace the production template placeholder only after Yard emits a DeploymentReceipt and independently verifies the public HTTPS route. Provider-directory installation or marketplace availability remains a separate receipt-gated step.

## Architectural law

> Anything Evercraft builds should be fabric-addressable. Anything Evercraft connects should become fabric-aware.
