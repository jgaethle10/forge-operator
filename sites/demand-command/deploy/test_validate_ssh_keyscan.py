"""Synthetic security tests for Demand Command's SSH host-key pinning."""
import base64
import hashlib
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest

from validate_ssh_keyscan import canonicalize, InvalidKeyscan, NoHostKeyReceived


def example_key(seed=0):
    # Fabricated SSH ED25519 public key, never a real server or client identity.
    blob = struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32) + bytes(
        (i + seed) % 256 for i in range(32)
    )
    value = base64.b64encode(blob).decode("ascii")
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")
    return value, fingerprint


class ValidateKeyscanTests(unittest.TestCase):
    host = "192.168.88.3"
    address = "[192.168.88.3]:8222"

    def record(self, value, address=None, kind="ssh-ed25519"):
        return f"{address or self.address} {kind} {value}\n"

    def test_accept_one_correct_key(self):
        value, fp = example_key()
        output, count = canonicalize(self.record(value), self.host, fp)
        self.assertEqual(output, self.record(value).strip())
        self.assertEqual(count, 1)

    def test_accept_repeated_same_key_and_reduce_to_one_record(self):
        value, fp = example_key()
        output, count = canonicalize(self.record(value) * 3, self.host, fp)
        self.assertEqual(output, self.record(value).strip())
        self.assertEqual(count, 3)

    def test_accept_openssh_banner_comment_then_correct_key(self):
        value, fp = example_key()
        banner = "# 192.168.88.3:8222 SSH-2.0-OpenSSH_9.2p1 Debian-2+deb12u7\\n"
        output, count = canonicalize(banner + self.record(value), self.host, fp)
        self.assertEqual(output, self.record(value).strip())
        self.assertEqual(count, 1)

    def test_accept_banner_comments_and_duplicate_matching_keys(self):
        value, fp = example_key()
        comment = "# 192.168.88.3:8222 SSH-2.0-OpenSSH_9.2p1 Debian-2+deb12u7\\n"
        output, count = canonicalize(
            comment + self.record(value) + "\\n" + comment + self.record(value),
            self.host, fp,
        )
        self.assertEqual(output, self.record(value).strip())
        self.assertEqual(count, 2)

    def test_comments_only_are_retryable_and_never_a_valid_key(self):
        comment = "# 192.168.88.3:8222 SSH-2.0-OpenSSH_9.2p1 Debian-2+deb12u7\\n"
        _, fp = example_key()
        with self.assertRaises(NoHostKeyReceived):
            canonicalize(comment, self.host, fp)

    def test_comment_does_not_allow_untrusted_key_record(self):
        good, fp = example_key()
        bad, _ = example_key(1)
        comment = "# 192.168.88.3:8222 SSH-2.0-OpenSSH_9.2p1\\n"
        with self.assertRaisesRegex(InvalidKeyscan, "MISMATCH"):
            canonicalize(comment + self.record(bad), self.host, fp)
        with self.assertRaisesRegex(InvalidKeyscan, "MISMATCH"):
            canonicalize(comment + self.record(good) + self.record(bad), self.host, fp)

    def test_cli_only_comments_is_retryable_three(self):
        helper = pathlib.Path(__file__).with_name("validate_ssh_keyscan.py")
        _, fp = example_key()
        with tempfile.NamedTemporaryFile() as f:
            f.write(b"# 192.168.88.3:8222 SSH-2.0-OpenSSH_9.2p1\\n")
            f.flush()
            r = subprocess.run([sys.executable, str(helper), self.host, fp, f.name],
                               capture_output=True, text=True)
        self.assertEqual(r.returncode, 3)
        self.assertEqual(r.stdout, "")

    def test_reject_conflicting_key_even_if_first_matches(self):
        value, fp = example_key()
        other, _ = example_key(1)
        with self.assertRaises(InvalidKeyscan):
            canonicalize(self.record(value) + self.record(other), self.host, fp)

    def test_reject_wrong_fingerprint(self):
        value, _ = example_key()
        _, fp = example_key(2)
        with self.assertRaisesRegex(InvalidKeyscan, "MISMATCH"):
            canonicalize(self.record(value), self.host, fp)

    def test_reject_wrong_host(self):
        value, fp = example_key()
        with self.assertRaises(InvalidKeyscan):
            canonicalize(self.record(value, address="[192.168.88.4]:8222"), self.host, fp)

    def test_failure_diagnostic_reports_host_without_key_material(self):
        value, fp = example_key()
        with self.assertRaises(InvalidKeyscan) as caught:
            canonicalize(self.record(value, address="[192.168.88.4]:8222"), self.host, fp)
        message = str(caught.exception)
        self.assertIn("unexpected host token", message)
        self.assertIn("[192.168.88.4]:8222", message)
        self.assertNotIn(value, message)

    def test_failure_diagnostic_reports_unexpected_fields_without_key_material(self):
        value, fp = example_key()
        with self.assertRaises(InvalidKeyscan) as caught:
            canonicalize(self.record(value) + "bad unexpected record with fields\n", self.host, fp)
        message = str(caught.exception)
        self.assertIn("unexpected field count", message)
        self.assertNotIn(value, message)

    def test_reject_wrong_algorithm(self):
        value, fp = example_key()
        with self.assertRaises(InvalidKeyscan):
            canonicalize(self.record(value, kind="ssh-rsa"), self.host, fp)

    def test_reject_any_unexpected_line(self):
        value, fp = example_key()
        with self.assertRaises(InvalidKeyscan):
            canonicalize(self.record(value) + "untrusted line\n", self.host, fp)

    def test_reject_guest_address(self):
        value, fp = example_key()
        with self.assertRaises(InvalidKeyscan):
            canonicalize(self.record(value), "100.115.92.205", fp)

    def test_cli_empty_scan_returns_retry_code_three(self):
        helper = pathlib.Path(__file__).with_name("validate_ssh_keyscan.py")
        value, fp = example_key()
        with tempfile.NamedTemporaryFile() as f:
            r = subprocess.run([sys.executable, str(helper), self.host, fp, f.name],
                               capture_output=True, text=True)
        self.assertEqual(r.returncode, 3)
        self.assertEqual(r.stdout, "")

    def test_cli_identical_duplicates_emits_one_canonical_record(self):
        helper = pathlib.Path(__file__).with_name("validate_ssh_keyscan.py")
        value, fp = example_key()
        with tempfile.NamedTemporaryFile() as f:
            f.write((self.record(value) * 2).encode())
            f.flush()
            r = subprocess.run([sys.executable, str(helper), self.host, fp, f.name],
                               capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout, self.record(value))

    def test_cli_conflicting_keys_never_emit_known_hosts_data(self):
        helper = pathlib.Path(__file__).with_name("validate_ssh_keyscan.py")
        value, fp = example_key()
        other, _ = example_key(1)
        with tempfile.NamedTemporaryFile() as f:
            f.write((self.record(value) + self.record(other)).encode())
            f.flush()
            r = subprocess.run([sys.executable, str(helper), self.host, fp, f.name],
                               capture_output=True, text=True)
        self.assertEqual(r.returncode, 4)
        self.assertEqual(r.stdout, "")


if __name__ == "__main__":
    unittest.main()
