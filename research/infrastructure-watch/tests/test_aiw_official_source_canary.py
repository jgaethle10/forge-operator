"""AIW source-access canary unit tests; network is mocked, no agency calls."""
import importlib.util
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import json
import unittest
from unittest.mock import patch

ENGINEERING = Path(__file__).resolve().parents[1] / "engineering"
sys.path.insert(0, str(ENGINEERING))
spec = importlib.util.spec_from_file_location("aiw_official_source_canary", ENGINEERING / "aiw_official_source_canary.py")
canary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(canary)


class TestCanary(unittest.TestCase):
    def test_url_allowlist(self):
        self.assertEqual(canary.allowed_url("https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm"), "www.fhwa.dot.gov")
        for url in ("http://www.fhwa.dot.gov/path",
                    "https://www.fhwa.dot.gov.evil.example/path",
                    "https://127.0.0.1/path",
                    "https://localhost/path",
                    "https://echo.epa.gov:8080/path",
                    "https://user:pass@www.eia.gov/path"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                canary.allowed_url(url)

    def test_three_sources_and_evidence_schema(self):
        with TemporaryDirectory() as tmp:
            registry = Path(tmp) / "registry.json"
            registry.write_text(json.dumps({"sources": [
                {"id": "fhwa", "url": "https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm"},
                {"id": "epa", "url": "https://echo.epa.gov/tools/data-downloads"},
                {"id": "eia", "url": "https://www.eia.gov/electricity/annual/html/epa_11_02.html"}
            ]}))
            with patch.object(canary, "probe", side_effect=[
                ("ok", "a"*64, None), ("failed", None, "HTTP_NON_200"),
                ("unavailable", None, "FETCH_UNAVAILABLE")]):
                observation = canary.cycle(registry)
            assert canary.receipts.validate_cycle(observation, canary.receipts.source_registry(registry))
            saved = canary.receipts.record_receipt(registry, self._save_raw(tmp, observation), Path(tmp)/"receipts")
            self.assertFalse(saved["complete"])
            self.assertEqual(canary.receipts.status(registry,Path(tmp)/"receipts")["state"], "degraded")

    def _save_raw(self, folder, data):
        path=Path(folder)/"cycle.json"
        path.write_text(json.dumps(data))
        return path


if __name__ == "__main__":
    unittest.main()
