#!/usr/bin/env python3
"""Synthetic-only checks for the ten-field private handoff exporter."""

import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('eo_export', HERE / 'export-sovereign-receipt.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def sample():
    return {
        'schema': mod.SCHEMA,
        'state': 'FIRST_INFERENCE_PASS',
        'real_local_inference': True,
        'model_sha256': mod.MODEL_SHA,
        'runtime_sha256': mod.RUNTIME_SHA,
        'model_reply_sha256': 'a' * 64,
        'inference_seconds': 17.81,
        'child_processes_stopped': True,
        'synthetic_only': True,
        'production_services_modified': False,
        'stage_root': '/private/do-not-export',
        'gateway_token': 'do-not-export',
        'model_reply_excerpt': 'do-not-export',
    }


class ExportTests(unittest.TestCase):
    def test_only_ten_fields_private_output_and_original_unchanged(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source, target = root / 'original.json', root / 'review.json'
            before = json.dumps(sample())
            source.write_text(before)
            clean = mod.export_receipt(source, target)
            self.assertEqual(set(clean), set(mod.FIELDS))
            self.assertEqual(set(json.loads(target.read_text())), set(mod.FIELDS))
            self.assertEqual(source.read_text(), before)
            self.assertEqual(os.stat(target).st_mode & 0o777, 0o600)
            self.assertNotIn('do-not-export', target.read_text())
            with self.assertRaises(FileExistsError):
                mod.export_receipt(source, target)

    def test_missing_field_rejected(self):
        record = sample()
        del record['production_services_modified']
        with self.assertRaisesRegex(ValueError, 'missing required'):
            mod.sanitize(record)

    def test_no_inference_or_production_change_rejected(self):
        for field, value in [ ('real_local_inference', False),
                              ('child_processes_stopped', False),
                              ('synthetic_only', False),
                              ('production_services_modified', True),
                              ('state', 'FIRST_INFERENCE_BLOCKED') ]:
            record = sample()
            record[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                mod.sanitize(record)

    def test_wrong_digest_nonfinite_duration_and_nonbool_rejected(self):
        for field, value in [('model_sha256', '0' * 64),
                             ('runtime_sha256', '0' * 64),
                             ('model_reply_sha256', 'not-a-digest'),
                             ('inference_seconds', float('nan')),
                             ('inference_seconds', True),
                             ('real_local_inference', 1)]:
            record = sample()
            record[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                mod.sanitize(record)

    def test_duplicate_json_keys_rejected_and_no_output(self):
        with tempfile.TemporaryDirectory() as root:
            source, target = Path(root) / 'orig.json', Path(root) / 'copy.json'
            source.write_text('{"state":"FIRST_INFERENCE_PASS","state":"FIRST_INFERENCE_BLOCKED"}')
            with self.assertRaisesRegex(ValueError, 'duplicate'):
                mod.export_receipt(source, target)
            self.assertFalse(target.exists())

    def test_source_destination_must_differ(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'orig.json'
            path.write_text(json.dumps(sample()))
            with self.assertRaisesRegex(ValueError, 'differ'):
                mod.export_receipt(path, path)


if __name__ == '__main__':
    unittest.main()
