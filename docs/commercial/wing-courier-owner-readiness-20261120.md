# Wing Courier owner-host readiness: one read-only command

**Purpose:** remove the "can't tell if Harbor can run the resident" ambiguity while keeping private files and customer media out of GitHub. This script does NOT enroll keys or tokens, enable Fabric, probe the Internet, start/stop services, or send files.

An authorized operator can run from the actual reviewed **Harbor** checkout:

```bash
node systemia/wing-courier/owner-readiness.mjs --wing harbor
```

Or from the actual owned **NextGen Fallen** checkout:

```bash
node systemia/wing-courier/owner-readiness.mjs --wing fallen
```

If and only if an existing verified owner-private receiver config **already** exists, optional local preflight:

```bash
node systemia/wing-courier/owner-readiness.mjs --wing harbor --config <EXISTING_PRIVATE_RECEIVER_CONFIG>
```

All output is **status only**: Linux vs non-Linux, Node>=22, non-root, local checkout SHA and clean/dirty flag, observed user `systemd` unit state, and `LOCAL_PRIVATE_PREFLIGHT_PASS / HOLD`. Never paste a config path, private key, token, source filename, host name or secrets into GitHub. The source SHA is not an independent owner attestation; `ACTIVE_UNATTESTED` means systemd returned active, **not** an authenticated Courier connection. The script intentionally performs no network operation; a fake/stale service cannot be promoted to ready.

A local `HOLD` does not mean the actual host is broken. Harbor's source issue #2414 reports no receiver preflight run; this command is the first safe operator-side action to establish whether Harbor has a compatible user-systemd runtime, source checkout and existing configuration. If Harbor is not Linux with user-systemd, stop. Do not attempt to install the Linux user unit on another OS.

After exact owner-side review, **separately** enroll the Harbor private scoped receive credential using the existing signed encrypted setup (`docs/commercial/harbor-signed-encrypted-enrollment-20261120.md`), then use `receiver-auth-canary.mjs --wing harbor --config <PRIVATE_CONFIG>` for its default offline preflight. A real network 401→200 challenge requires separate `--authorize-owned-network-check`, and is NOT executed here.

## Credential compatibility fix

The Harbor encrypted package preparer now normalizes an owner-private broker token ending in one optional standard line ending (`\n` or `\r\n`) to the exact broker-issued 43–256-character `[A-Za-z0-9_-]` token. It rejects embedded spaces, embedded newlines, an ASCII `Bearer ` prefix, or other non-broker punctuation. Encryption and local open use the canonical bytes, so an `echo`-created token file cannot silently yield a different Harbor token. The package creator also rejects a private-key PEM accidentally supplied in place of Harbor's independently verified X25519 **public** key.

None of this generates, provisions, rotates or reads a real token for GitHub. It is source code and synthetic tests until run on owner-controlled machines.

**Tracking:** #2414 Harbor host preflight; #2294 signed transport; #2416 Systemia one-body work; #2284 customer release freeze.
