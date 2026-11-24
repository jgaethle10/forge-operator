"""Synthetic guardrails for NextGen private API token rotation."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

MODULE = Path(__file__).with_name("rotate-nextgen-demand-token.py")
SPEC = importlib.util.spec_from_file_location("rotate_nextgen_demand_token", MODULE)
rotate = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = rotate
SPEC.loader.exec_module(rotate)


class TokenRotationTests(unittest.TestCase):
    def test_rotates_only_token_and_retains_db_path(self):
        original = ("EVERCRAFT_DEMAND_TOKEN=old-secret\n"
                    "EVERCRAFT_DEMAND_PORT=18896\n"
                    "EVERCRAFT_DEMAND_DB=/home/coach/.local/state/evercraft/demand-command.sqlite\n")
        new = "X" * 64
        result = rotate.replace_token(original, new)
        self.assertNotIn("old-secret", result)
        self.assertIn("EVERCRAFT_DEMAND_TOKEN=" + new + "\n", result)
        self.assertEqual(result.splitlines()[1:], original.splitlines()[1:])

    def test_rejects_missing_or_duplicated_key(self):
        for body in ("EVERCRAFT_DEMAND_PORT=18896\n",
                     "EVERCRAFT_DEMAND_TOKEN=a\nEVERCRAFT_DEMAND_TOKEN=b\n"):
            with self.assertRaises(ValueError):
                rotate.replace_token(body, "X" * 64)

    def test_rejects_short_or_multiline_token(self):
        for candidate in ("short", "X" * 64 + "\n"):
            with self.assertRaises(ValueError):
                rotate.replace_token("EVERCRAFT_DEMAND_TOKEN=old\n", candidate)


if __name__ == "__main__":
    unittest.main()
