# Systemia remote device trust review

Systemia may **review** pending remote-device identity evidence, but it does not autonomously change the trust boundary.

## Read-only review

The control plane exposes a machine-readable read-only command:

```bash
node systemia/control-plane/control-plane.mjs \
  --pending-remote-devices \
  --yard-state /private/yard \
  --broker-deployment <remote-broker-deployment-id>
```

The result uses Yard's opaque candidate refs and does not expose raw device fingerprints.

## Prepare a trust change

Systemia can prepare, but not execute, an authorization plan:

```bash
node systemia/control-plane/control-plane.mjs \
  --prepare-remote-device-authorization \
  --broker-deployment <remote-broker-deployment-id> \
  --candidate <candidate-ref>
```

The returned plan is explicitly marked:

- `impact: trust_boundary`
- `human_gate_required: true`
- `explicit_candidate_confirmation_required: true`
- `explicit_approval_reference_required: true`
- `executable_by_control_plane: false`

The actual trust mutation remains a separate Yard action using the exact-candidate review flow.

## Routing rule

`trust_review` routes to Yard without a human hold because it is read-only.

`trust_change` routes to Yard and is always treated as consequential by work type. The human gate applies even when a mission author forgets to declare `impact: trust_boundary`.

Discovery, attestation, pending status, KAIDANCE holds and prepared plans do not grant device authority.
