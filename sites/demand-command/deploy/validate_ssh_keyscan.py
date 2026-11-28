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


class NoHostKeyReceived(InvalidKeyscan):
    """No actual SSH key record in scan; caller may retry the connection."""
    pass


def canonicalize(scan: str, ipv4: str, expected_fingerprint: str) -> tuple[str, int]:
    ip = ipaddress.IPv4Address(ipv4)
    if not ip.is_private or ip in ipaddress.ip_network("100.64.0.0/10"):
        raise InvalidKeyscan("Refusing non-LAN or Crostini guest host address")
    label = f"[{ip}]:8222"
    lines = scan.splitlines()
    if not lines:
        raise NoHostKeyReceived("No SSH host key received")
    if len(lines) > 32 or len(scan) > 8192:
        raise InvalidKeyscan("Excessive SSH keyscan output")

    # ssh-keyscan sometimes writes informational '# host port SSH-2.0...' banner
    # comments into stdout. Such lines are not known_hosts records. Ignore ONLY
    # blanks/comments; validate every remaining key record and its pinned digest.
    key_rows = [
        (row_number, line)
        for row_number, line in enumerate(lines, start=1)
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not key_rows:
        raise NoHostKeyReceived("No SSH host key record after scan comments")

    observed_blob: str | None = None
    for row_number, line in key_rows:
        fields = line.strip().split()
        # Diagnostics are limited to public protocol metadata: line number,
        # field count, host token and key algorithm. Never print key bytes.
        if len(fields) != 3:
            token = fields[0] if fields else "<empty>"
            raise InvalidKeyscan(
                f"Line {row_number}: unexpected field count {len(fields)} "
                f"(host token={token[:120]!r})"
            )
        if fields[0] != label:
            raise InvalidKeyscan(
                f"Line {row_number}: unexpected host token {fields[0][:120]!r}, "
                f"expected {label!r}"
            )
        if fields[1] != "ssh-ed25519":
            raise InvalidKeyscan(
                f"Line {row_number}: unexpected algorithm {fields[1][:80]!r}"
            )
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
    return f"{label} ssh-ed25519 {observed_blob}", len(key_rows)


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
    except NoHostKeyReceived:
        return 3  # Retryable: comments arrived, but no actual host key.
    except (InvalidKeyscan, ValueError, UnicodeError, OSError) as exc:
        print(f"SSH keyscan rejected: {exc}", file=sys.stderr)
        return 4  # Non-retryable: malformed, conflicting or untrusted response.
    if count > 1:
        print(f"Accepted {count} identical, fingerprint-matched SSH key observations.", file=sys.stderr)
    print(canonical)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
