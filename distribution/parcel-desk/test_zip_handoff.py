"""Parcel Desk v0.4: no-network, fail-closed ZIP handoff regressions."""
import io
import os
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

from evercraft_parcel import split, restore_zip


def make_zip(root, data=b"check\x00" * 8000, method=zipfile.ZIP_STORED):
    root = Path(root)
    (root / "source.bin").write_bytes(data)
    manifest = split(root / "source.bin", root / "parts", 10000)
    archive = root / "parcel.zip"
    with zipfile.ZipFile(archive, "w", compression=method) as z:
        for part in manifest["parts"]:
            z.write(root / "parts" / part["name"], part["name"])
        z.write(root / "parts" / "parcel-manifest.json", "parcel-manifest.json")
        z.writestr("README-RECIPIENT.txt", "Offline handoff, no identity attestation.")
    return archive, data


def rewrite_zip(source, output, *, omit=None, corrupt=None):
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as dst:
        for info in src.infolist():
            if info.filename == omit:
                continue
            data = src.read(info.filename)
            if info.filename == corrupt:
                data = b"!" + data[1:]
            dst.writestr(info.filename, data)


class ZipHandoffTest(unittest.TestCase):
    def test_exact_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, original = make_zip(root)
            self.assertEqual(restore_zip(z, root / "out").read_bytes(), original)

    def test_empty_original(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root, b"")
            self.assertEqual(restore_zip(z, root / "out").read_bytes(), b"")

    def test_unsupported_compression(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root, method=zipfile.ZIP_DEFLATED)
            with self.assertRaisesRegex(ValueError, "Compression"):
                restore_zip(z, root / "out")

    def test_duplicate_name(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(z, "a") as out:
                    out.writestr("parcel-manifest.json", "{}")
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                restore_zip(z, root / "out")

    def test_zip_slip_attempt(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            with zipfile.ZipFile(z, "a") as out:
                out.writestr("../outside.txt", "unsafe")
            with self.assertRaisesRegex(ValueError, "unsafe"):
                restore_zip(z, root / "out")
            self.assertFalse((root / "outside.txt").exists())

    def test_extra_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            with zipfile.ZipFile(z, "a") as out:
                out.writestr("unknown.txt", "unauthorized")
            with self.assertRaisesRegex(ValueError, "unsafe"):
                restore_zip(z, root / "out")

    def test_hash_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            broken = root / "broken.zip"
            rewrite_zip(z, broken, corrupt="part-00001.bin")
            with self.assertRaisesRegex(ValueError, "SHA256"):
                restore_zip(broken, root / "out")
            self.assertFalse((root / "out" / "source.bin").exists())

    def test_missing_piece(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            broken = root / "broken.zip"
            rewrite_zip(z, broken, omit="part-00002.bin")
            with self.assertRaisesRegex(ValueError, "ZIP pieces"):
                restore_zip(broken, root / "out")

    def test_non_object_manifest_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            invalid = root / "invalid.zip"
            with zipfile.ZipFile(z) as src, zipfile.ZipFile(invalid, "w") as dst:
                for info in src.infolist():
                    data = src.read(info.filename)
                    if info.filename == "parcel-manifest.json":
                        data = b"[]"
                    dst.writestr(info.filename, data)
            with self.assertRaisesRegex(ValueError, "manifest format"):
                restore_zip(invalid, root / "out")

    def test_refuse_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            target = restore_zip(z, root / "out")
            with self.assertRaises(FileExistsError):
                restore_zip(z, root / "out")
            self.assertTrue(target.is_file())

    def test_refuse_symlink_output(self):
        if os.name == "nt":
            self.skipTest("symlink creation depends on Windows privileges")
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            z, _ = make_zip(root)
            (root / "target").mkdir()
            (root / "symlink").symlink_to(root / "target", target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                restore_zip(z, root / "symlink")


if __name__ == "__main__":
    unittest.main()
