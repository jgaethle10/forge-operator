"""Synthetic unit tests for offline-only Demand Caddy candidate staging."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

MODULE = Path(__file__).with_name("stage-penguin-demand-https.py")
SPEC = importlib.util.spec_from_file_location("stage_penguin_demand_https", MODULE)
stage = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = stage
SPEC.loader.exec_module(stage)

EXISTING = """{
    http_port 18080
    https_port 8443
}
fabric.systemiacommandcenters.com {
    reverse_proxy 127.0.0.1:8765
}
worlds.systemiacommandcenters.com {
    reverse_proxy 127.0.0.1:8788
}
"""
TEMPLATE = """demand.systemiacommandcenters.com {
    basicauth {
        owner REPLACE_WITH_LOCAL_CADDY_BCRYPT_HASH
    }
    reverse_proxy 127.0.0.1:18897
}
"""
HASH = "$2a$14$" + "a" * 53


class CandidateTests(unittest.TestCase):
    def test_password_pair_validates_without_disclosing_credentials(self):
        secret = "unique-and-long-2026-privately-chosen"
        stage.validate_password_pair(secret, secret)
        cases = [
            (secret, secret + "-different", "did not match"),
            ("very-short", "very-short", "shorter than"),
            (secret + "\n", secret + "\n", "newline"),
        ]
        for first, second, reason in cases:
            with self.assertRaises(ValueError) as raised:
                stage.validate_password_pair(first, second)
            self.assertIn(reason, str(raised.exception))
            self.assertNotIn(secret, str(raised.exception))
            self.assertNotIn(first, str(raised.exception))

    def test_candidate_preserves_current_config_byte_for_byte_as_prefix(self):
        new = stage.stage_text(EXISTING, TEMPLATE, HASH)
        self.assertTrue(new.startswith(EXISTING))
        self.assertEqual(new.count("demand.systemiacommandcenters.com {"), 1)
        self.assertNotIn(stage.PLACEHOLDER, new)
        self.assertIn("owner " + HASH, new)
        self.assertIn("reverse_proxy 127.0.0.1:18897", new)
        self.assertIn("worlds.systemiacommandcenters.com", new)

    def test_never_duplicate_existing_host(self):
        with self.assertRaises(ValueError):
            stage.stage_text(EXISTING + TEMPLATE, TEMPLATE, HASH)

    def test_reject_wrong_caddy_version_directive(self):
        with self.assertRaises(ValueError):
            stage.stage_text(EXISTING, TEMPLATE.replace("basicauth", "basic_auth"), HASH)

    def test_reject_unexpected_upstream(self):
        with self.assertRaises(ValueError):
            stage.stage_text(EXISTING, TEMPLATE.replace("18897", "18896"), HASH)

    def test_reject_weakly_formed_hash(self):
        with self.assertRaises(ValueError):
            stage.stage_text(EXISTING, TEMPLATE, "password")

    def test_reject_bad_template_placeholder(self):
        with self.assertRaises(ValueError):
            stage.stage_text(EXISTING, TEMPLATE.replace(stage.PLACEHOLDER, "literal-secret"), HASH)

    def test_reject_missing_trailing_newline(self):
        with self.assertRaises(ValueError):
            stage.stage_text(EXISTING.rstrip(), TEMPLATE, HASH)


if __name__ == "__main__":
    unittest.main()
