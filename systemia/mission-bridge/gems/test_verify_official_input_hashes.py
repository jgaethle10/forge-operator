import hashlib, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import verify_official_input_hashes as verifier

class Tests(unittest.TestCase):
 def test_missing_fails_closed(self):
  with tempfile.TemporaryDirectory() as d:
   self.assertEqual(verifier.verify(d)["state"],"held")
 def test_matching_bytes_and_tampering(self):
  with tempfile.TemporaryDirectory() as d:
   expected=hashlib.sha256(b"authentic").hexdigest()
   with patch.object(verifier,"EXPECTED",{"sample.tif":expected}):
    path=Path(d)/"sample.tif"
    path.write_bytes(b"authentic")
    self.assertEqual(verifier.verify(d)["state"],"verified")
    path.write_bytes(b"modified")
    self.assertEqual(verifier.verify(d)["files"]["sample.tif"]["status"],"hash_mismatch")
 def test_symlink_denied(self):
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/"target";target.write_bytes(b"x")
   (Path(d)/"sample.tif").symlink_to(target)
   with patch.object(verifier,"EXPECTED",{"sample.tif":hashlib.sha256(b"x").hexdigest()}):
    self.assertEqual(verifier.verify(d)["state"],"held")

if __name__=="__main__":unittest.main()
