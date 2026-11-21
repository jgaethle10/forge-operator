import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

import gems_usgs_3dep_index as usgs
from gems_dem_metadata_recon import ATLAS_SCHEMA, GROUPS


def mini_atlas():
    features = []
    for i, group in enumerate(GROUPS):
        west = -119.9 + .2*i
        south = 39.8
        coords = [[west,south],[west+.1,south],[west+.1,south+.1],
                  [west,south+.1],[west,south]]
        features.append({'type':'Feature', 'geometry':{'type':'Polygon','coordinates':[coords]},
                         'properties':{'tile_id':'r01c0'+str(i),'diagnostic_group':group,
                                       'eligible_for_diagnostic_sample':True,
                                       'no_fault_truth_or_geology_observed':True}})
    return {'type':'FeatureCollection',
            'metadata':{'schema':ATLAS_SCHEMA,'crs':'OGC:CRS84 (WGS84 longitude latitude)'},
            'features':features}


def response_bundle(queries, features=None):
    if features is None:
        features = [{'attributes':{
            'OBJECTID': 123,'project':'synthetic project',
            'project_id': 101.,'pub_date': '2026-01-01',
            'product_link':'https://example.org/not-real',
            'metadata_link':'https://example.org/not-real-metadata'
        }}]
    return {'schema':usgs.RESULTS_SCHEMA,'responses':[
        {'tile_id':q['tile_id'],'query_sha256':q['query_sha256'],
         'response':{'features':features,'exceededTransferLimit':False}}
        for q in queries]}


class Official3DepIndexTests(unittest.TestCase):
    def test_only_fixed_official_layer_and_group_balanced_envelopes(self):
        report = usgs.build(mini_atlas())
        self.assertEqual(report['atlas_review_control_tile_count'], 3)
        self.assertIsNone(report['captured_index_response_summaries'])
        self.assertEqual(report['ingested_raw_response_count'], 0)
        self.assertEqual(report['network_calls_by_tool'],0)
        self.assertFalse(report['model_trained'])
        self.assertEqual(report['competition_submissions'],0)
        for q in report['queries']:
            url = urlparse(q['query_url'])
            self.assertEqual(url.scheme,'https')
            self.assertEqual(url.netloc,'index.nationalmap.gov')
            self.assertEqual(url.path, '/arcgis/rest/services/3DEPElevationIndex/MapServer/18/query')
            params = parse_qs(url.query)
            self.assertEqual(params['inSR'], ['4326'])
            self.assertEqual(params['spatialRel'],['esriSpatialRelIntersects'])
            self.assertEqual(params['f'],['json'])
            self.assertEqual(params['returnGeometry'], ['false'])
            self.assertEqual(params['outFields'],[usgs.FIELDS])
            geometry = json.loads(params['geometry'][0])
            self.assertEqual(geometry['spatialReference'],{'wkid':4326})
            self.assertEqual(geometry['xmin'],q['query_bbox_wgs84'][0])
            self.assertEqual(geometry['ymax'],q['query_bbox_wgs84'][3])
            self.assertTrue(q['query_is_bbox_screen_only'])
            self.assertFalse(q['raster_coverage_or_rights_verified'])

    def test_captured_synthetic_index_results_are_not_raster_truth(self):
        queries = usgs.build_queries(mini_atlas())
        bundle = response_bundle(queries)
        report = usgs.build(mini_atlas(), bundle)
        self.assertEqual(report['ingested_raw_response_count'],3)
        self.assertTrue(report['metadata_index_response_is_not_actual_pixel_coverage'])
        self.assertEqual([r['index_polygon_intersections_reported'] for r in
                          report['captured_index_response_summaries']], [1,1,1])
        self.assertTrue(all(not r['actual_dem_pixels_checked'] for r in
                            report['captured_index_response_summaries']))
        self.assertTrue(all(not r['query_response_independently_authenticated'] for r in
                            report['captured_index_response_summaries']))

    def test_incomplete_or_wrong_query_or_duplicate_fails_closed(self):
        queries=usgs.build_queries(mini_atlas())
        bundle=response_bundle(queries)
        with self.assertRaisesRegex(ValueError,'usgs_responses_incomplete'):
            usgs.ingest(queries,{'schema':usgs.RESULTS_SCHEMA,
                                 'responses':bundle['responses'][:-1]})
        bundle['responses'][0]['query_sha256']='bad'
        with self.assertRaisesRegex(ValueError,'usgs_response_query_digest_mismatch'):
            usgs.ingest(queries,bundle)
        bundle=response_bundle(queries)
        bundle['responses'][1]['tile_id']=bundle['responses'][0]['tile_id']
        with self.assertRaisesRegex(ValueError,'usgs_response_tile_id_mismatch'):
            usgs.ingest(queries,bundle)

    def test_server_error_truncation_and_duplicate_features_rejected(self):
        queries=usgs.build_queries(mini_atlas())
        for raw in ({'error':{'message':'not available'}},
                    {'features':[], 'exceededTransferLimit':True},
                    {'features':[{'attributes':{'OBJECTID':1}},
                                 {'attributes':{'OBJECTID':1}}]}):
            with self.subTest(raw=raw):
                bundle=response_bundle(queries)
                bundle['responses'][0]['response']=raw
                with self.assertRaises(ValueError):
                    usgs.ingest(queries,bundle)

    def test_bad_atlas_and_nonexistent_data_are_never_silently_accepted(self):
        bad=mini_atlas()
        bad['metadata']['crs']='EPSG:32611'
        with self.assertRaises(ValueError):
            usgs.build(bad)
        bad=mini_atlas()
        bad['features'][0]['properties']['no_fault_truth_or_geology_observed']=False
        with self.assertRaises(ValueError):
            usgs.build(bad)

    def test_write_once_no_network_and_private_atlas_stays_private(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            atlas=folder/'private_atlas.geojson'
            receipt=folder/'queries.json'
            atlas.write_text(json.dumps(mini_atlas()))
            with patch('sys.argv', ['test', '--atlas',str(atlas),'--receipt',str(receipt)]):
                usgs.main()
                self.assertTrue(receipt.is_file())
                with self.assertRaisesRegex(FileExistsError,'usgs_query_receipt_exists'):
                    usgs.main()


if __name__=='__main__':
    unittest.main()
