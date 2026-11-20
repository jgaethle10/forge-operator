import json
import tempfile
import unittest
from pathlib import Path

import gems_dem_metadata_recon as recon


def atlas():
    features = []
    for col, group in enumerate(recon.GROUPS):
        west = -119.9 + col * .2
        south = 39.9
        ring = [[west, south], [west+.1, south], [west+.1, south+.1],
                [west, south+.1], [west, south]]
        features.append({'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring]},
                         'properties': {'tile_id': 'r00c0'+str(col),
                                        'diagnostic_group': group,
                                        'eligible_for_diagnostic_sample': True,
                                        'no_fault_truth_or_geology_observed': True}})
    return {'type': 'FeatureCollection', 'metadata': {'schema': recon.ATLAS_SCHEMA,
            'crs': 'OGC:CRS84 (WGS84 longitude latitude)'}, 'features': features}


class DemReconTests(unittest.TestCase):
    def test_no_index_is_unknown_not_missing_coverage(self):
        report = recon.build(atlas())
        self.assertEqual(len(report['tiles']), 3)
        self.assertEqual(report['indexed_source_count'], 0)
        self.assertTrue(all(not t['verified_1m_dem_coverage'] for t in report['tiles']))
        self.assertFalse(report['submission_made'])
        self.assertFalse(report['source_metadata_claims_independently_verified'])

    def test_bbox_candidates_only_and_balanced_controls(self):
        index = {'schema': recon.INDEX_SCHEMA, 'sources': [{
            'id': 'mock', 'metadata_reference': 'synthetic-test-record',
            'bbox_wgs84': [-119.95, 39.85, -119.75, 40.05],
            'acquisition_date': None, 'vertical_datum': None, 'rights_reference': None}]}
        report = recon.build(atlas(), index)
        self.assertEqual([len(t['metadata_bbox_candidate_source_ids']) for t in report['tiles']], [1, 0, 0])
        self.assertEqual(report['atlas_groups'][recon.GROUPS[0]]['tiles_with_bbox_candidates'], 1)
        self.assertTrue(all(not t['verified_training_rights'] for t in report['tiles']))
        self.assertFalse(report['data_rights_verified'])

    def test_fail_closed_invalid_crs_and_group_imbalance(self):
        sample = atlas()
        sample['metadata']['crs'] = 'EPSG:32611'
        with self.assertRaisesRegex(ValueError, 'atlas_crs_or_schema_invalid'):
            recon.build(sample)
        sample = atlas()
        sample['features'][1]['properties']['diagnostic_group'] = 'not_selected'
        with self.assertRaisesRegex(ValueError, 'unbalanced_diagnostic_groups'):
            recon.build(sample)

    def test_fail_closed_bad_footprint_and_unverified_evidence(self):
        sample = atlas()
        sample['features'][0]['geometry']['coordinates'][0][2][0] = float('nan')
        with self.assertRaisesRegex(ValueError, 'invalid_wgs84_bounds'):
            recon.build(sample)
        sample = atlas()
        sample['features'][0]['properties']['no_fault_truth_or_geology_observed'] = False
        with self.assertRaisesRegex(ValueError, 'diagnostic_tile_evidence_contract_invalid'):
            recon.build(sample)

    def test_duplicate_index_sources_fail(self):
        base = {'id': 'x', 'metadata_reference': 'source',
                'bbox_wgs84': [-120, 39, -119, 40]}
        with self.assertRaisesRegex(ValueError, 'dem_index_provenance_invalid'):
            recon.build(atlas(), {'schema': recon.INDEX_SCHEMA, 'sources': [base, base]})

    def test_write_once_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path/'atlas.json').write_text(json.dumps(atlas()))
            receipt = path/'receipt.json'
            import sys
            from unittest.mock import patch
            with patch.object(sys, 'argv', ['tool', '--atlas', str(path/'atlas.json'),
                                            '--receipt', str(receipt)]):
                recon.main()
                self.assertTrue(receipt.is_file())
                with self.assertRaisesRegex(FileExistsError, 'dem_metadata_receipt_exists'):
                    recon.main()


if __name__ == '__main__':
    unittest.main()
