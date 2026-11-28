"""Fail-closed synthetic tests for Demand Command's public Caddy release guard."""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import subprocess

MODULE = Path(__file__).with_name("release-penguin-demand-https.py")
SPEC = importlib.util.spec_from_file_location("release_penguin_demand_https", MODULE)
release = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = release
SPEC.loader.exec_module(release)

OLD = b"""{\n    http_port 18080\n    https_port 8443\n}\nworlds.systemiacommandcenters.com {\n    reverse_proxy 127.0.0.1:8788\n}\n"""
HASH = b"$2a$14$" + b"z" * 53
EXTRA = (b"\ndemand.systemiacommandcenters.com {\n    basicauth {\n" +
         b"        owner " + HASH + b"\n    }\n" +
         b"    reverse_proxy 127.0.0.1:18897\n}\n")
NEW = OLD + EXTRA
RECEIPT = {
    "state": "STAGED_NOT_APPLIED",
    "live_config_sha256": hashlib.sha256(OLD).hexdigest(),
    "candidate_sha256": hashlib.sha256(NEW).hexdigest(),
}

class ReleaseTests(unittest.TestCase):
    def test_only_additive_candidate_is_accepted(self):
        release.check_candidate(OLD, NEW, RECEIPT)

    def test_refuse_a_changed_running_config(self):
        with self.assertRaisesRegex(release.Hold, "changed since staging"):
            release.check_candidate(OLD + b"#changed\n", NEW, RECEIPT)

    def test_refuse_mutation_to_existing_config(self):
        edited = NEW.replace(b"127.0.0.1:8788", b"127.0.0.1:8888")
        receipt = {**RECEIPT, "candidate_sha256": hashlib.sha256(edited).hexdigest()}
        with self.assertRaisesRegex(release.Hold, "preserve"):
            release.check_candidate(OLD, edited, receipt)

    def test_refuse_missing_auth(self):
        changed = NEW.replace(b"basicauth", b"no_auth_")
        receipt = {**RECEIPT, "candidate_sha256": hashlib.sha256(changed).hexdigest()}
        with self.assertRaises(release.Hold):
            release.check_candidate(OLD, changed, receipt)

    def test_refuse_public_upstream(self):
        changed = NEW.replace(b"127.0.0.1:18897", b"192.168.88.3:18896")
        receipt = {**RECEIPT, "candidate_sha256": hashlib.sha256(changed).hexdigest()}
        with self.assertRaises(release.Hold):
            release.check_candidate(OLD, changed, receipt)

    def test_refuse_reused_live_host(self):
        with self.assertRaises(release.Hold):
            release.check_candidate(OLD + EXTRA, NEW, RECEIPT)

    def test_refuse_missing_receipt(self):
        with self.assertRaises(release.Hold):
            release.check_candidate(OLD, NEW, {})

    def test_401_and_tls_must_both_pass(self):
        good = subprocess.CompletedProcess([], 0, "401 0", "")
        denied = subprocess.CompletedProcess([], 0, "200 0", "")
        tls_bad = subprocess.CompletedProcess([], 0, "401 60", "")
        with patch.object(release, "run", return_value=good):
            self.assertTrue(release.check_local_https())
        for bad in (denied, tls_bad, subprocess.CompletedProcess([], 60, "401 60", "")):
            with patch.object(release, "run", return_value=bad):
                self.assertFalse(release.check_local_https())

    def test_rejects_wrong_dns(self):
        with patch.object(release.socket, "getaddrinfo", side_effect=[
            [(None, None, None, None, ("50.46.190.39", 0))],
            [(None, None, None, None, ("1.2.3.4", 0))]
        ]):
            with self.assertRaises(release.Hold):
                release.check_dns()

if __name__ == "__main__":
    unittest.main()
