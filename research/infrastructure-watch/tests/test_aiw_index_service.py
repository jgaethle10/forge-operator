"""Offline regression suite for evidence-gated PNW API. No external dependencies."""
import hashlib
from http.client import HTTPConnection
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from http.server import ThreadingHTTPServer

ROOT=Path(__file__).resolve().parents[1]
MODULE=ROOT/'engineering/aiw_index_service.py'
spec=importlib.util.spec_from_file_location('aiw_index_service',MODULE)
api=importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

class PNWIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=(ROOT/'pnw-2026.html') if (ROOT/'pnw-2026.html').exists() else ROOT.parents[1]/'public/infrastructure-watch/pnw-2026.html'
        cls.folder=TemporaryDirectory()
        cls.db=Path(cls.folder.name)/'bridges.sqlite'
        cls.meta=api.build_index(cls.source,cls.db)
    @classmethod
    def tearDownClass(cls):cls.folder.cleanup()

    def test_source_receipt_is_pinned(self):
        self.assertEqual(self.meta['source_asset_sha256'],api.SOURCE_HTML_SHA256)
        self.assertEqual(self.meta['raw_records'],21590)
        self.assertFalse(self.meta['national_import_complete'])
        self.assertIsNone(self.meta['last_live_emergency_check'])
    def test_state_and_condition_totals(self):
        for state,grades in api.EXPECTED.items():
            for grade,expected in grades.items():
                self.assertEqual(api.list_bridges(self.db,{'state':[state],'condition':[grade]})['total_matching'],expected)
        self.assertEqual(api.list_bridges(self.db,{})['total_matching'],21590)
    def test_yakima_true_county_and_unassigned(self):
        self.assertEqual(api.list_bridges(self.db,{'state':['WA'],'county':['077']})['total_matching'],531)
        x=api.list_bridges(self.db,{'state':['WA'],'county':['077'],'condition':['P']})
        self.assertEqual(x['total_matching'],27)
        self.assertFalse(x['national_complete'])
        self.assertFalse(x['live_alerts_connected'])
        self.assertEqual(api.list_bridges(self.db,{'state':['WA'],'county':['unassigned']})['total_matching'],559)
    def test_one_Oregon_N_no_emergency(self):
        x=api.list_bridges(self.db,{'state':['OR'],'condition':['N']})
        self.assertEqual(x['total_matching'],1)
        self.assertEqual(x['items'][0]['bridge_id'],api.OREGON_N_ID)
        self.assertIsNone(x['items'][0]['current_imminent_danger_verified'])
        self.assertFalse(x['items'][0]['condition_is_emergency'])
    def test_source_condition_does_not_imply_alert(self):
        x=api.list_bridges(self.db,{'state':['WA'],'condition':['P'],'limit':['250']})
        self.assertEqual(x['total_matching'],403)
        self.assertTrue(all(r['condition_is_emergency'] is False for r in x['items']))
        self.assertTrue(all(r['current_imminent_danger_verified'] is None for r in x['items']))
    def test_search_and_pagination(self):
        first=api.list_bridges(self.db,{'state':['WA'],'limit':['30'],'offset':['0']})
        second=api.list_bridges(self.db,{'state':['WA'],'limit':['30'],'offset':['30']})
        self.assertEqual(len(first['items']),30)
        self.assertFalse({x['bridge_id'] for x in first['items']} & {x['bridge_id'] for x in second['items']})
        self.assertEqual(api.list_bridges(self.db,{'state':['WA'],'q':['MILK CREEK']})['items'][0]['name'],'MILK CREEK')
        self.assertEqual(api.list_bridges(self.db,{'state':['WA'],'q':['%']})['total_matching'],0)
    def test_refuse_unknown_county_without_state(self):
        for params in ({'county':['077']},{'state':['ID'],'county':['077']},
                       {'state':['WA'],'county':['abc']},{'condition':['X']},
                       {'limit':['251']},{'offset':['-1']},{'state':['NO']},
                       {'state':['WA','ID']}):
            with self.subTest(params=params),self.assertRaises(ValueError):
                api.list_bridges(self.db,params)
    def test_exact_bridge_lookup(self):
        r=api.single_bridge(self.db,{'state':['OR'],'id':[api.OREGON_N_ID]})
        self.assertEqual(r['condition'],'N')
        self.assertIsNone(api.single_bridge(self.db,{'state':['WA'],'id':['this-does-not-exist']}))
    def test_bad_html_does_not_replace_existing_index(self):
        old_hash=hashlib.sha256(self.db.read_bytes()).hexdigest()
        with TemporaryDirectory() as folder:
            p=Path(folder)/'changed.html'
            p.write_bytes(self.source.read_bytes()+b'not source')
            with self.assertRaisesRegex(ValueError,'SHA-256 changed'):
                api.build_index(p,self.db)
        self.assertEqual(old_hash,hashlib.sha256(self.db.read_bytes()).hexdigest())
        self.assertEqual(api.get_meta(self.db)['raw_records'],21590)
    def test_bad_index_metadata_fails_closed(self):
        from shutil import copyfile
        import sqlite3
        with TemporaryDirectory() as folder:
            p=Path(folder)/'bad.db';copyfile(self.db,p)
            with sqlite3.connect(p) as c:
                c.execute("UPDATE metadata SET value='true' WHERE key='national_import_complete'")
            with self.assertRaisesRegex(ValueError,'completeness metadata invalid'):
                api.get_meta(p)
    def test_real_http_responses_and_blocked_writes(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),api.handler(self.db,self.source))
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            conn=HTTPConnection('127.0.0.1',server.server_port,timeout=7)
            def get(path,method='GET'):
                conn.request(method,path)
                r=conn.getresponse();content=r.read();return r,content
            r,b=get('/healthz');self.assertEqual(r.status,200)
            self.assertEqual(json.loads(b)['dataset_rows'],21590)
            r,b=get('/api/v1/coverage');self.assertEqual(r.status,200)
            self.assertFalse(json.loads(b)['national_import_complete'])
            r,b=get('/api/v1/bridges?state=WA&county=077&condition=P&limit=5')
            self.assertEqual(r.status,200);self.assertEqual(json.loads(b)['total_matching'],27)
            r,b=get('/api/v1/bridges?state=ID&county=077');self.assertEqual(r.status,400)
            r,b=get('/api/v1/bridge?state=OR&id=000013570-00286')
            self.assertEqual(r.status,200);self.assertEqual(json.loads(b)['condition'],'N')
            r,b=get('/?county=077');self.assertEqual(r.status,200)
            self.assertTrue(b.startswith(b'<!doctype html>'))
            r,b=get('/api/v1/bridges',method='POST');self.assertEqual(r.status,405)
            r,b=get('/not-a-route');self.assertEqual(r.status,404)
            conn.close()
        finally:
            server.shutdown();server.server_close();thread.join(timeout=2)

if __name__=='__main__':unittest.main()