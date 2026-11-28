#!/usr/bin/env python3
import pathlib
import tempfile
import unittest
from evercraft_storage_steward import classify, inventory


class StorageStewardTests(unittest.TestCase):
    def test_conservative_classification(self):
        checks = {
            '/tmp/fmp/state/opportunity.sqlite3': 'PRESERVE',
            '/tmp/fmp/.git/objects/data': 'PRESERVE',
            '/tmp/fmp/backups/customer.json': 'PRESERVE',
            '/home/me/.npm/_cacache/content': 'REVIEW_REBUILDABLE_CACHE',
            '/home/me/.cache/pip/http': 'REVIEW_REBUILDABLE_CACHE',
            '/tmp/fmp/storage/engineering/run-1/data.bin': 'REVIEW_NOT_APPROVED',
            '/tmp/fmp/customer_data.mp4': 'PRESERVE_UNKNOWN',
            '/tmp/fmp/archive/client_secret.key': 'PRESERVE',
        }
        for path, expected in checks.items():
            self.assertEqual(classify(pathlib.Path(path)), expected, path)

    def test_inventory_is_read_only_and_symlink_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / 'engineering').mkdir()
            evidence = root / 'engineering' / 'evidence.bin'
            evidence.write_bytes(b'private')
            (root / '.git').mkdir()
            (root / '.git' / 'objects').write_bytes(b'preserve')
            (root / 'link').symlink_to(root / 'engineering')
            result = inventory(root, 100, 5, 4, 10)
            self.assertEqual(result['mode'], 'READ_ONLY_NO_COPY_NO_DELETE')
            self.assertFalse(result['partial'])
            self.assertEqual(result['skipped_symlinks'], 1)
            self.assertEqual(result['regular_files'], 1)
            self.assertEqual(evidence.read_bytes(), b'private')
            self.assertTrue((root / '.git' / 'objects').exists())

    def test_bounded_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for i in range(10):
                (root / f'file{i}').write_text('data')
            result = inventory(root, 3, 5, 4, 10)
            self.assertTrue(result['partial'])
            self.assertLessEqual(result['entries_examined'], 3)

    def test_root_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / 'linked').symlink_to(root)
            with self.assertRaises(ValueError):
                inventory(root / 'linked', 100, 5, 4, 10)


if __name__ == '__main__':
    unittest.main()
