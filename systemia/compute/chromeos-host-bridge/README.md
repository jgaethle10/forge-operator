# ChromeOS Host Boundary Bridge

This is the narrow host-side companion for the boundary that a Crostini guest cannot truthfully observe by itself.

The first admitted capability is intentionally small:

```text
ChromeOS Settings
  -> accessibility automation tree
  -> only Crostini Port Forwarding
  -> only TCP 18080 + TCP 8443
  -> paired localhost receiver in Crostini
  -> Remote Operator read-only status
```

It is not a generic remote desktop agent. It does not persist screenshots or the raw accessibility tree, and v0.1.0 accepts no remote mutation commands.

## Why this exists

A Linux process inside Crostini can verify the guest listener, the local TLS proxy, and router automation, but the ChromeOS host owns the UI state that exposes a Linux port to the LAN. Treating that unobserved state as green creates a false-health gap.

ChromeOS exposes an extension automation capability for the desktop accessibility tree. The bridge uses that host-side capability to observe the port-forwarding surface, reduces the result to two admitted port records, then posts the reduced observation into Crostini over ChromeOS' ordinary localhost-to-Crostini tunnel.

## Install the Crostini receiver

From the repository root:

```bash
bash systemia/compute/install-chromeos-host-boundary-bridge-user.sh
```

The installer creates a 32-byte pairing secret in:

```text
~/.config/evercraft/chromeos-host-boundary.env
```

and starts:

```text
evercraft-chromeos-host-boundary-bridge.service
```

The secret is printed once for local pairing. It is never written into receipts.

## Install the ChromeOS companion

Until this becomes a managed Evercraft package, load `systemia/compute/chromeos-host-bridge` as an unpacked Chrome extension on the explicitly authorized Chromebook.

Open the extension options, paste the pairing token, save, and run **Check now**.

The extension will also perform a bounded read-only check every two minutes.

## Evidence semantics

A fresh bridge record means the ChromeOS accessibility surface was directly observed recently. It does not, by itself, prove WAN reachability.

The complete ingress diagnosis should reconcile independent evidence:

1. Crostini listener and service health.
2. ChromeOS host port-forward setting from this bridge.
3. Router mapping receipt.
4. A LAN witness for host reachability.
5. An external canary for public DNS/TLS reachability.

No inner green layer is allowed to stand in for an outer layer.

## Future mutation lane

A later version may reassert an already-admitted port toggle, but only through a separate action-specific approval capability. That lane should be exact-port, idempotent, receipt-bound, revocable, and fail closed when the settings accessibility structure changes.

Do not turn the desktop automation permission into a general remote clicker.
