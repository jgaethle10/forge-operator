"""Contract tests for the owned AIW heartbeat. No external services required."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'engineering' / 'aiw_heartbeat.py'
spec = importlib.util.spec_from_file_location('aiw_heartbeat', MODULE)
heartbeat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(heartbeat)


class HeartbeatTests(unittest.TestCase):
    def test_only_owned_loopback_allowed(self):
        self.assertEqual(heartbeat.validate_origin('http://127.0.0.1:8786'), 'http://127.0.0.1:8786')
        for origin in ('https://example.com', 'http://example.com', 'http://127.0.0.1:8786/path',
                       'http://user:pass@127.0.0.1:8786', 'http://127.0.0.1:8786?x=1'):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                heartbeat.validate_origin(origin)

    def test_pass_records_only_snapshot_not_live_checks(self):
        with TemporaryDirectory() as d, patch.object(heartbeat, 'probe', return_value={
            'dataset_rows': 21590, 'national_complete': False,
            'live_emergency_check': False, 'latest_source_refresh_verified': False}):
            path = Path(d) / 'nested' / 'receipt.json'
            result = heartbeat.execute('http://127.0.0.1:8786', path)
            persisted = json.loads(path.read_text())
            self.assertEqual(result, persisted)
            self.assertEqual(result['status'], 'passed')
            self.assertFalse(result['scheduler_registered'])
            self.assertFalse(result['source_update_performed'])
            self.assertFalse(result['evidence']['live_emergency_check'])

    def test_failure_overwrites_prior_success_atomically(self):
        with TemporaryDirectory() as d:
            path = Path(d) / 'receipt.json'
            path.write_text('{"status":"passed"}')
            with patch.object(heartbeat, 'probe', side_effect=ValueError('wrong checksum')):
                result = heartbeat.execute('http://127.0.0.1:8786', path)
            self.assertEqual(result['status'], 'failed')
            self.assertEqual(json.loads(path.read_text())['status'], 'failed')
            self.assertIn('wrong checksum', result['failure'])


if __name__ == '__main__':
    unittest.main()
