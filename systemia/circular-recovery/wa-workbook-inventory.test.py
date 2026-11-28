import hashlib
import importlib.util
import io
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("inventory", pathlib.Path(__file__).with_name("wa-workbook-inventory.py"))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)

class InventoryProof(unittest.TestCase):
    def test_metadata_and_tamper(self):
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, "w") as archive:
            archive.writestr("[Content_Types].xml", "<fixture/>")
            archive.writestr("xl/_rels/workbook.xml.rels", "<fixture/>")
            archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Info-Notes"/><sheet name="Data"/></sheets></workbook>')
        data = raw.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as tmp:
            file = pathlib.Path(tmp) / ("fixture-" + digest + ".xlsx")
            file.write_bytes(data)
            file.chmod(0o600)
            result = inventory.inspect(tmp, "fixture", digest)
            self.assertEqual([x["name"] for x in result["sheets"]], ["Info-Notes", "Data"])
            self.assertEqual(result["rowsVerified"], 0)
            self.assertFalse(result["unitsVerified"])
            file.write_bytes(data + b"tampered")
            with self.assertRaisesRegex(ValueError, "digest mismatch"):
                inventory.inspect(tmp, "fixture", digest)

if __name__ == "__main__":
    unittest.main()
