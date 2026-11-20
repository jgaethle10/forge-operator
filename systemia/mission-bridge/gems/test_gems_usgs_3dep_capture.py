import datetime
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError

import gems_usgs_3dep_capture as capture
from gems_dem_metadata_recon import ATLAS_SCHEMA, GROUPS


def atlas():
    features = []
    for col, group in enumerate(GROUPS):
        west = -119.9 + 0.2 * col
        ring = [[west, 39.9], [west+.1, 39.9], [west+.1, 40],
                [west, 40], [west, 39.9]]
        features.append({'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [ring]},
            'properties': {'tile_id': 'r01c0' + str(col),
                           'diagnostic_group': group,
                           'eligible_for_diagnostic_sample': True,
                           'no_fault_truth_or_geology_observed': True}})
    return {'type': 'FeatureCollection',
            'metadata': {'schema': ATLAS_SCHEMA,
                         'crs': 'OGC:CRS84 (WGS84 longitude latitude)'},
            'features': features}


def valid_response():
    return {'features': [{'attributes': {
        'OBJECTID': 812, 'project': 'SYNTHETIC TEST ONLY',
        'project_id': 23.0, 'pub_date': None, 'product_link': None,
        'metadata_link': None
    }}], 'exceededTransferLimit': False}


class PublicUsgsCaptureTests(unittest.TestCase):
    def test_no_network_without_explicit_gate(self):
        transport = Mock(side_effect=AssertionError('network_must_not_run'))
        with self.assertRaisesRegex(PermissionError, 'explicit_public_usgs_query_gate_required'):
            capture.capture(atlas(), transport=transport)
        transport.assert_not_called()

    def test_bounded_balanced_authorized_capture_is_only_index_metadata(self):
        transport = Mock(side_effect=lambda url: valid_response())
        pauses = []
        clock = lambda: datetime.datetime(2026, 11, 20, tzinfo=datetime.timezone.utc)
        result = capture.capture(atlas(), allow_public_query=True,
                                 transport=transport, pause=pauses.append, now=clock)
        self.assertEqual(transport.call_count, 3)
        self.assertEqual(pauses, [0.5, 0.5])
        self.assertEqual(result['balanced_queries_per_group'], 1)
        self.assertEqual(result['competition_submissions'], 0)
        self.assertEqual(result['raster_files_downloaded'], 0)
        self.assertTrue(result['all_three_groups_have_index_matches'])
        self.assertTrue(result['index_counts_are_not_comparable_dem_area'])
        self.assertEqual([result['index_summary_by_group'][group]['unique_usgs_index_objectids'] for group in GROUPS], [1, 1, 1])
        self.assertTrue(all(not result['index_summary_by_group'][group]['actual_dem_pixel_coverage_verified'] for group in GROUPS))
        self.assertFalse(result['competition_use_or_sponsor_share_rights_verified'])
        self.assertTrue(all(r['retrieved_at_utc'].startswith('2026-11-20T00:00:00')
                            for r in result['responses']))
        self.assertEqual([r['tile_id'] for r in result['responses']],
                         ['r01c00', 'r01c01', 'r01c02'])
        self.assertTrue(all(c.args[0].startswith(capture.SERVICE + '?')
                            for c in transport.call_args_list))

    def test_no_index_matches_still_not_a_fault_or_raster_conclusion(self):
        result = capture.capture(
            atlas(), allow_public_query=True, pause=lambda _: None,
            transport=lambda _: {'features': [], 'exceededTransferLimit': False})
        self.assertFalse(result['all_three_groups_have_index_matches'])
        self.assertTrue(result['index_counts_are_not_comparable_dem_area'])
        self.assertTrue(all(result['index_summary_by_group'][group]['unique_usgs_index_objectids'] == 0 for group in GROUPS))
        self.assertFalse(result['fault_truth_observed'])
        self.assertEqual(result['competition_submissions'], 0)

    def test_reject_truncated_and_error_responses(self):
        for payload in ({'error': {'message': 'failed'}},
                        {'features': [], 'exceededTransferLimit': True},
                        {'features': [{'attributes': {'OBJECTID': 1}},
                                      {'attributes': {'OBJECTID': 1}}]}):
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    capture.capture(atlas(), allow_public_query=True,
                                    transport=lambda _: payload, pause=lambda _: None)

    def test_wrong_destination_blocked_and_redirects_refused(self):
        for url in ('http://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/18/query?f=json',
                    'https://example.com/arcgis/rest/services/3DEPElevationIndex/MapServer/18/query?f=json',
                    'https://index.nationalmap.gov/other?f=json',
                    'https://index.nationalmap.gov@evil.example/arcgis/rest/services/3DEPElevationIndex/MapServer/18/query?f=json'):
            with self.subTest(url=url):
                with self.assertRaisesRegex(ValueError, 'usgs_endpoint_not_allowlisted'):
                    capture.assert_official_url(url)
        with self.assertRaisesRegex(ValueError, 'usgs_unexpected_redirect'):
            capture.NoRedirects().redirect_request(None, None, 302,
                                                    'redirect', None, 'https://elsewhere')

    def test_unbalanced_or_oversized_budget_rejected(self):
        for n in (0, 16, -1, True, '2'):
            with self.subTest(n=n):
                with self.assertRaisesRegex(ValueError, 'usgs_per_group_budget_invalid'):
                    capture.choose_balanced_queries(atlas(), n)
        with self.assertRaisesRegex(ValueError, 'usgs_balanced_group_too_small'):
            capture.choose_balanced_queries(atlas(), 2)

    def test_read_only_live_transport_enforces_json_byte_budget(self):
        class FakeResponse:
            def __init__(self, body): self.body = io.BytesIO(body)
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def getcode(self): return 200
            def read(self, n): return self.body.read(n)
        opener = Mock()
        opener.open.return_value = FakeResponse(json.dumps(valid_response()).encode())
        with patch.object(capture, 'build_opener', return_value=opener):
            result = capture.fetch_public_json(capture.SERVICE + '?f=json')
        self.assertEqual(result, valid_response())
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 12)
        opener.open.return_value = FakeResponse(b'x' * 2000)
        with patch.object(capture, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(ValueError, 'usgs_response_too_large'):
                capture.fetch_public_json(capture.SERVICE + '?f=json', max_bytes=10)

    def test_write_once_without_flag_does_not_touch_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            (target / 'atlas.json').write_text(json.dumps(atlas()))
            receipt = target / 'receipt.json'
            with patch('sys.argv', ['command', '--atlas', str(target/'atlas.json'),
                                    '--receipt', str(receipt)]):
                with self.assertRaisesRegex(PermissionError,
                                            'explicit_public_usgs_query_gate_required'):
                    capture.main()
            self.assertFalse(receipt.exists())


if __name__ == '__main__':
    unittest.main()
