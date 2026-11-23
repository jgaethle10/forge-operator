#!/usr/bin/env python3
"""Fail-closed SSH host-key scan validation for the private NextGen→Penguin tunnel.

Reads UNTRUSTED ssh-keyscan stdout. Accepts repeated observations only when every
record identifies the exact requested host, port, ED25519 key and pinned digest.
Emits exactly ONE canonical OpenSSH known_hosts line on success. No credentials.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import ipaddress
import pathlib
import struct
import sys


class InvalidKeyscan(Exception):
    pass


def canonicalize(scan: str, ipv4: str, expected_fingerprint: str) -> tuple[str, int]:
    ip = ipaddress.IPv4Address(ipv4)
    if not ip.is_private or ip in ipaddress.ip_network("100.64.0.0/10"):
        raise InvalidKeyscan("Refusing non-LAN or Crostini guest host address")
    label = f"[{ip}]:8222"
    lines = scan.splitlines()
    if not lines:
        raise InvalidKeyscan("No SSH host key received")
    if len(lines) > 32 or len(scan) > 8192:
        raise InvalidKeyscan("Excessive SSH keyscan output")

    observed_blob: str | None = None
    for line in lines:
        fields = line.strip().split()
        if len(fields) != 3 or fields[0] != label or fields[1] != "ssh-ed25519":
            raise InvalidKeyscan("Unexpected SSH host, port, key type or keyscan record")
        blob_text = fields[2]
        try:
            blob = base64.b64decode(blob_text, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise InvalidKeyscan("Malformed SSH public key") from exc
        if base64.b64encode(blob).decode("ascii") != blob_text:
            raise InvalidKeyscan("Non-canonical SSH public key encoding")
        # OpenSSH ssh-ed25519 blob is SSH-string("ssh-ed25519") + SSH-string(32-byte key).
        if (len(blob) != 51
            or struct.unpack(">I", blob[:4])[0] != 11
            or blob[4:15] != b"ssh-ed25519"
            or struct.unpack(">I", blob[15:19])[0] != 32):
            raise InvalidKeyscan("Unexpected SSH ED25519 key blob structure")
        fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")
        if fingerprint != expected_fingerprint:
            raise InvalidKeyscan("SSH host fingerprint MISMATCH; no tunnel may be installed")
        if observed_blob is not None and blob_text != observed_blob:
            raise InvalidKeyscan("Conflicting SSH host keys in same scan")
        observed_blob = blob_text

    assert observed_blob is not None
    return f"{label} ssh-ed25519 {observed_blob}", len(lines)


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: validate_ssh_keyscan.py LAN_IPV4 EXPECTED_SHA256 SCAN_FILE", file=sys.stderr)
        return 2
    host, fingerprint, filename = sys.argv[1:]
    try:
        data = pathlib.Path(filename).read_bytes()
        if not data:
            return 3  # Retryable: no public host-key response.
        canonical, count = canonicalize(data.decode("ascii", errors="strict"), host, fingerprint)
    except (InvalidKeyscan, ValueError, UnicodeError, OSError) as exc:
        print(f"SSH keyscan rejected: {exc}", file=sys.stderr)
        return 4  # Non-retryable: malformed, conflicting or untrusted response.
    if count > 1:
        print(f"Accepted {count} identical, fingerprint-matched SSH key observations.", file=sys.stderr)
    print(canonical)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
