# Evercraft Host Boundary Capability Fabric

## Purpose

Containers and guest runtimes are deliberately unable to see or control every host operating-system surface. Evercraft must not paper over that boundary by pretending a guest observation is a host observation.

The Host Boundary Capability Fabric turns those otherwise-human-only host surfaces into explicit, typed, auditable capabilities.

```text
LLM / Systemia
  -> Remote Operator
  -> admitted capability registry
  -> exact host adapter
  -> authorized host companion
  -> narrow observation or action
  -> receipt
```

The first production candidate is:

```text
chromeos.crostini.port-forwarding.read.v1
```

It observes only the Crostini Port Forwarding surface and only the admitted TCP ports 8443 and 18080.

## Non-negotiable invariants

1. No generic remote-desktop capability is admitted.
2. Every host capability has a stable capability ID and a typed adapter.
3. Every capability declares whether it has mutation authority.
4. Read capabilities cannot secretly carry mutation authority.
5. Host observations never inherit authority from guest observations.
6. A fresh-check request is satisfied only by evidence tied to that request ID.
7. Screenshots and raw accessibility trees are not persisted unless a future capability explicitly requires them and passes a separate privacy/security review.
8. Pairing is explicit. Discovering a device does not authorize it.
9. Mutation capabilities, when introduced, must be action-specific, approval-scoped, field-certified, revocable, and receipt-producing.
10. A local or host green light never proves public reachability. External routes require an independent external witness.

## Capability lifecycle

```text
candidate
  -> implementation
  -> synthetic proof
  -> authorized field proof
  -> node-local admission
  -> monitored production capability
  -> revoke / expire / supersede
```

A capability is not available to an LLM merely because code exists for it. The registry records candidates as well as admitted capabilities, and generic dispatch is allowed only when the entry's admission state is `admitted`. A candidate can still use a dedicated field-test path to collect the evidence required for promotion.

## Generic operator surface

`remote_host_capabilities` lists registered capabilities, their admission state, and their authority/privacy properties.

`remote_host_capability_check` accepts a capability ID and routes only to a registered adapter. Candidate capabilities additionally need a valid node-local field admission before generic dispatch. That admission is bound to the exact host companion install and expires; unregistered capability IDs, stale admissions and unavailable adapters fail closed.

Specialized compatibility tools may exist for important capabilities, but the generic typed capability surface is the long-term API.

## ChromeOS v0.2

The ChromeOS companion:

- polls the paired local receiver for fresh-check requests;
- opens the Crostini Port Forwarding settings surface only when work exists or a low-rate heartbeat is due;
- uses the ChromeOS accessibility automation tree;
- reduces host state to the admitted port records;
- reports an observation carrying the matching request ID;
- persists no raw accessibility tree and no screenshot;
- exposes no arbitrary click or navigation command from Remote Operator.

The Crostini receiver:

- requires the local pairing secret;
- validates schema, clock window, capability ID, ports and protocol;
- stores an integrity-sealed latest observation;
- stores an integrity-sealed fresh-check request;
- completes a request only when the matching request ID returns;
- exposes the result into Remote Operator.

## Evidence ladder

A public-ingress diagnosis should preserve each boundary separately:

```text
Fabric loopback
  -> local TLS edge
  -> ChromeOS port-forward setting
  -> LAN witness
  -> router NAT mapping
  -> independent public canary
```

Contradictions are useful evidence. For example, "ChromeOS setting enabled + LAN unreachable" points somewhere different from "ChromeOS setting disabled."

## Expansion model

Future host adapters can cover Windows, macOS, Linux desktop, Android, ChromeOS and dedicated Evercraft hardware, but every adapter should be smaller than the host itself.

Good capability:

```text
chromeos.crostini.port-forwarding.read.v1
```

Bad capability:

```text
desktop.do-anything.v1
```

The moat is not a giant remote-control permission. The moat is a growing library of narrow, trustworthy host capabilities that Systemia can reason about and compose.
