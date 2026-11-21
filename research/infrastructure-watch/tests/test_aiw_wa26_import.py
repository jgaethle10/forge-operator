"""Offline fail-closed tests for source-pinned Washington SNBI importer."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

MODULE = Path(__file__).resolve().parents[1] / "engineering" / "aiw_wa26_import.py"
spec = importlib.util.spec_from_file_location("aiw_wa26_import", MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class WashingtonImporterTests(unittest.TestCase):
    def test_component_conditions(self):
        self.assertEqual(mod.classification({"BC01": "7", "BC02": "8", "BC03": "9", "BC04": "N"}), "G")
        self.assertEqual(mod.classification({"BC01": "6", "BC02": "7", "BC03": "9", "BC04": "N"}), "F")
        self.assertEqual(mod.classification({"BC01": "4", "BC02": "7", "BC03": "9", "BC04": "N"}), "P")
        self.assertIsNone(mod.classification({"BC01": "N", "BC02": "N"}))
        with self.assertRaises(ValueError):
            mod.classification({"BC01": "unexpected"})

    def test_reviewed_coordinate_exception_is_pinned(self):
        self.assertEqual(
            mod.EXPECTED_COORDINATE_EXCEPTIONS,
            {"0000P06117B1804": (43.4365, -123.896469)}
        )
        self.assertTrue(43.4365 < 45.0)

    def test_invalid_source_and_no_overwrite(self):
        with TemporaryDirectory() as folder:
            path = Path(folder)
            source = path / "WA26.json"
            source.write_text("[]")
            output = path / "independent.sqlite"
            with self.assertRaises(ValueError):
                mod.build(source, output)
            self.assertFalse(output.exists())
            output.write_bytes(b"must never replace")
            with self.assertRaises(FileExistsError):
                mod.build(source, output)
            self.assertEqual(output.read_bytes(), b"must never replace")


if __name__ == "__main__":
    unittest.main()
