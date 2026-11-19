"""Owned report gateway contract and site/order provenance checks (no external network)."""
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
import server
from report_bridge import fetch_owned_ready_report
from outbox_audit import audit

RID='rivet-yard:'+'a'*32
SOURCE='c'*64
SHA='b'*64


def record(address='100 Test Ave'):
    return {
        'ok':True,'schema':'evercraft.rivet.yard-report-record.v1',
        'report_id':RID,'generation_state':'ready','created_at':'2026-11-19T12:00:00Z',
        'source_snapshot':{'sha256':SOURCE,'coverage_schema':'evercraft.rivet.source-coverage.v1','persisted':True},
        'report':{'sha256':SHA,'source_snapshot_sha256':SOURCE,'body':{
            'schema':'evercraft.rivet.yard-report.v1','generation_state':'ready',
            'report_type':'preliminary_site_opportunity','requested_address':address}},
        'verification':{k:True for k in (
            'source_sha256_match','source_byte_count_match','full_source_snapshot_persisted',
            'full_source_snapshot_reopened_and_verified','source_coverage_manifest_verified',
            'report_domain_projection_verified')}
    }


class FakeGateway(BaseHTTPRequestHandler):
    hits=0
    def do_GET(self):
        self.__class__.hits+=1
        if self.headers.get('Authorization')!='Bearer '+('t'*32):
            self.send_response(401);self.end_headers();return
        if self.path!='/api/rivet/reports/'+RID.replace(':','%3A'):
            self.send_response(404);self.end_headers();return
        body=json.dumps(record()).encode()
        self.send_response(200);self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def log_message(self,*args):pass


class OwnedReportTests(unittest.TestCase):
    def test_unsafe_gateway_and_bad_report_id_rejected(self):
        with patch.dict(os.environ,{'EVERCRAFT_SITE_REPORT_GATEWAY_URL':'https://unknown.example','EVERCRAFT_SITE_REPORT_GATEWAY_TOKEN_FILE':'/nonexistent'}):
            with self.assertRaisesRegex(ValueError,'loopback'):fetch_owned_ready_report(RID,'100 Test Ave')
            with self.assertRaisesRegex(ValueError,'identifier'):fetch_owned_ready_report('../wrong','100 Test Ave')

    def test_import_is_durable_idempotent_and_address_bound(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);tok=root/'gateway.key';tok.write_text('t'*32);tok.chmod(0o600)
            gateway=ThreadingHTTPServer(('127.0.0.1',0),FakeGateway)
            gt=threading.Thread(target=gateway.serve_forever,daemon=True);gt.start()
            (root/'uploads').mkdir()
            env={'EVERCRAFT_SITE_REPORT_GATEWAY_URL':'http://127.0.0.1:'+str(gateway.server_port),'EVERCRAFT_SITE_REPORT_GATEWAY_TOKEN_FILE':str(tok)}
            with patch.dict(os.environ,env),patch.object(server,'DB',root/'test.sqlite3'),patch.object(server,'UPLOADS',root/'uploads'),patch.object(server,'TOKEN',''):
                server.init();app=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                at=threading.Thread(target=app.serve_forever,daemon=True);at.start()
                base='http://127.0.0.1:'+str(app.server_port)+'/api'
                def call(path,method='GET',data=None):
                    raw=json.dumps(data).encode() if data is not None else None
                    req=Request(base+path,data=raw,method=method,headers={'Content-Type':'application/json'} if raw else {})
                    try:
                        with urlopen(req,timeout=4) as r:return r.status,json.load(r)
                    except HTTPError as e:return e.code,json.load(e)
                try:
                    _,site=call('/sites','POST',{'address':'100 Test Ave'})
                    _,other=call('/sites','POST',{'address':'200 Test Ave'})
                    _,scenario=call('/sites/'+site['id']+'/scenarios','POST',{'sc_name':'Baseline'})
                    FakeGateway.hits=0
                    url='/sites/'+site['id']+'/source-reports/import'
                    code,linked=call(url,'POST',{'external_report_id':RID})
                    self.assertEqual(code,201,linked)
                    self.assertEqual(linked['source_sha256'],SOURCE)
                    code,duplicate=call(url,'POST',{'external_report_id':RID})
                    self.assertEqual(code,200)
                    self.assertEqual(duplicate['id'],linked['id'])
                    self.assertEqual(FakeGateway.hits,1)
                    code,_=call('/sites/'+other['id']+'/source-reports/import','POST',{'external_report_id':RID})
                    self.assertEqual(code,400)
                    code,order=call('/sites/'+site['id']+'/orders','POST',{'scenario_id':scenario['id'],'source_report_id':linked['id']})
                    self.assertEqual(code,201,order)
                    _,snap=call('/reports/'+order['report_id']+'/export')
                    self.assertEqual(snap['originating_source_report']['external_report_id'],RID)
                    self.assertTrue(audit(server.DB)['ok'])
                    code,_=call('/sites/'+other['id']+'/orders','POST',{'source_report_id':linked['id'],'scenario_id':scenario['id']})
                    self.assertEqual(code,400)
                    call('/sites/'+site['id'],'PUT',{'address':'Changed Address'})
                    code,_=call('/sites/'+site['id']+'/orders','POST',{'source_report_id':linked['id'],'scenario_id':scenario['id']})
                    self.assertEqual(code,400)
                finally:
                    app.shutdown();app.server_close();at.join(timeout=4)
            gateway.shutdown();gateway.server_close();gt.join(timeout=4)

if __name__=='__main__':unittest.main()
