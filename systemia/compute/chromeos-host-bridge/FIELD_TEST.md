# ChromeOS Host Boundary Field Test

This is the live-device gate for `chromeos.crostini.port-forwarding.read.v1`.

A passing unit test does not satisfy this gate.

## 1. Install the Crostini receiver

From the checked-out Forge repository:

```bash
bash systemia/compute/enable-remote-operator-user.sh
```

On Crostini this installs the host-boundary receiver automatically unless
`EVERCRAFT_CHROMEOS_HOST_BOUNDARY_ENABLED=false`.

If the receiver was already installed and the observer must be intentionally
replaced:

```bash
bash systemia/compute/install-chromeos-host-boundary-bridge-user.sh --reset-pairing
```

A reset revokes the prior observer pairing, deletes node-local host capability
admissions, and rotates the pairing bootstrap token.

## 2. Install the ChromeOS companion

Load this directory as an unpacked extension on the explicitly authorized
Chromebook:

```text
systemia/compute/chromeos-host-bridge
```

Open the extension options, paste the one-time pairing bootstrap token, save,
and run **Check now**.

The companion generates a non-extractable ECDSA P-256 private key in its own
extension storage. The receiver locks to the resulting public-key fingerprint.

## 3. Prove direct host observation

The first live receipt must show all of the following:

```text
paired = true
observer_signature_verified = true
paired_observer_install_id == observer_install_id
paired_observer_key_fingerprint == observer_key_fingerprint
scan.settings_surface_observed = true
TCP 18080 present = true
TCP 8443 present = true
```

The enabled values are evidence, not assumptions. Do not toggle either port
during the read-only field test.

If the desktop fallback is used, its receipt should also report:

```text
surface_isolation.full_desktop_text_scanned = false
```

## 4. Prove fresh-check correlation

Request a fresh check through Remote Operator.

A passing result must carry the exact request ID created by that call. A
background heartbeat cannot satisfy a fresh-check request.

The observer sequence must advance. Replaying a previously signed report must
be rejected.

## 5. Reconcile the LAN witness

Run the existing LAN-side witness against the Chromebook host for TCP 18080
and TCP 8443.

The field certification may reach
`host_setting_and_lan_ready` only when the signed ChromeOS observation says
the admitted settings are enabled and the independent LAN witness can reach
both forwarded ports.

## 6. Inspect certification

Use `remote_host_boundary_certification`.

A field-ready certification must satisfy:

```text
state = host_setting_and_lan_ready
ready_for_external_canary = true
external_public_route_verified = false
mutation_authority = false
```

The final line is deliberate. This field gate proves the host boundary and LAN
boundary. It does not invent evidence about the public Internet path.

## 7. Admit the read capability

Node-local admission changes Evercraft trust state, so it requires an explicit
approval reference.

Use `remote_host_capability_admit` only after the field certification is
ready.

The admission is bound to the exact ChromeOS install ID and observer-key
fingerprint. Reinstalling, re-keying, resetting, or replacing the companion
invalidates that admission.

## 8. Prove generic dispatch

After admission, call `remote_host_capability_check` with:

```text
chromeos.crostini.port-forwarding.read.v1
```

The generic typed path must produce the same fresh, signed evidence semantics
as the specialized compatibility tool.

## 9. Prove the public route separately

Only after the host setting and LAN path are ready should the independent
external canary evaluate public DNS/TLS reachability.

A local or LAN green light is never promoted into a public-route claim.

## Failure rule

Any ambiguity, missing signature, mismatched observer identity, stale receipt,
unexpected accessibility-tree shape, replayed observer sequence, or
contradictory LAN evidence fails closed.

Do not turn on a generic desktop-action path to get around a failed field
proof.
