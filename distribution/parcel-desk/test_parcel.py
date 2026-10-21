import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from evercraft_parcel import split, restore

class TestParcel(unittest.TestCase):
    def test_roundtrip_multichunk(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td); raw=b"evercraft\x00"*1025+b"fin"; (p/'source.bin').write_bytes(raw)
            m=split(p/'source.bin',p/'parcel',2000)
            self.assertTrue(len(m['parts'])>2)
            recovered=restore(p/'parcel',p/'recv')
            self.assertEqual(raw,recovered.read_bytes())
            self.assertEqual(hashlib.sha256(raw).hexdigest(),m['original_sha256'])
    def test_tampered_chunk_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td); (p/'source.bin').write_bytes(b"abc"*2000)
            split(p/'source.bin',p/'parcel',1024)
            q=p/'parcel'/'part-00002.bin'; b=bytearray(q.read_bytes()); b[4]^=1; q.write_bytes(b)
            with self.assertRaises(ValueError): restore(p/'parcel',p/'recv')
            self.assertFalse((p/'recv'/'source.bin').exists())
    def test_manifest_path_traversal_blocked(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td); (p/'source.bin').write_bytes(b"abc"); split(p/'source.bin',p/'parcel',10)
            f=p/'parcel'/'parcel-manifest.json'; m=json.loads(f.read_text()); m['original_name']='../../outside.bin'; f.write_text(json.dumps(m))
            with self.assertRaises(ValueError): restore(p/'parcel',p/'recv')
    def test_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td); (p/'a.txt').write_text('hello'); split(p/'a.txt',p/'parts',8)
            restore(p/'parts',p/'recv')
            with self.assertRaises(FileExistsError): restore(p/'parts',p/'recv')
    def test_empty_file(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td); (p/'zero.dat').write_bytes(b'')
            manifest=split(p/'zero.dat',p/'parcel',5)
            self.assertEqual([],manifest['parts'])
            self.assertEqual(b'',restore(p/'parcel',p/'recv').read_bytes())

if __name__=='__main__': unittest.main(verbosity=2)
