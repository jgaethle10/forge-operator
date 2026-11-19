"""Owned Yard report ingestion uses a private gateway, never user-provided URLs."""
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

RID='rivet-yard:'+'a'*32
SHA='b'*64
SOURCE='c'*64

def ready_record(address='100 Test Ave', state='ready'):
    return {
      'ok':True,'schema':'evercraft.rivet.yard-report-record.v1',
      'report_id':RID,'generation_state':state,'created_at':'2026-11-19T12:00:00Z',
      'source_snapshot':{'sha256':SOURCE,'coverage_schema':'evercraft.rivet.source-coverage.v1','persisted':True},
      'report':{'sha256':SHA,'source_snapshot_sha256':SOURCE,'body':{
          'schema':'evercraft.rivet.yard-report.v1', 'generation_state':'ready',
          'report_type':'preliminary_site_opportunity','requested_address':address}},
      'verification':{key:True for key in (
       'source_sha256_match','source_byte_count_match','full_source_snapshot_persisted',
       'full_source_snapshot_reopened_and_verified','source_coverage_manifest_verified',
       'report_domain_projection_verified')}
    }

class FakeGateway(BaseHTTPRequestHandler):
    record=ready_record()
    calls=0
    def do_GET(self):
        self.__class__.calls += 1
        if self.headers.get('Authorization')!='Bearer '+('t'*32):
            self.send_response(401);self.end_headers();return
        if self.path != '/api/rivet/reports/'+RID.replace(':','%3A'):
            self.send_response(404);self.end_headers();return
        data=json.dumps(self.record).encode()
        self.send_response(200);self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def log_message(self,*args):pass

class OwnedReportBridgeTests(unittest.TestCase):
    def test_rejects_unsafe_gateway_and_bad_ids(self):
        with patch.dict(os.environ,{'EVERCRAFT_SITE_REPORT_GATEWAY_URL':'https://untrusted.example','EVERCRAFT_SITE_REPORT_GATEWAY_TOKEN_FILE':'/not/a/token'}):
            with self.assertRaisesRegex(ValueError,'loopback'):
                fetch_owned_ready_report(RID,'100 Test Ave')
            with self.assertRaisesRegex(ValueError,'identifier'):
                fetch_owned_ready_report('../wrong','100 Test Ave')

    def test_gateway_integrity_and_report_lineage(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)
            token=path/'gateway.key'; token.write_text('t'*32);token.chmod(0o600)
            gw=ThreadingHTTPServer(('127.0.0.1',0),FakeGateway)
            gw_thread=threading.Thread(target=gw.serve_forever,daemon=True);gw_thread.start()
            upload=path/'uploads';upload.mkdir()
            env={'EVERCRAFT_SITE_REPORT_GATEWAY_URL':f'http://127.0.0.1:{gw.server_port}',
                 'EVERCRAFT_SITE_REPORT_GATEWAY_TOKEN_FILE':str(token)}
            FakeGateway.calls=0
            with patch.dict(os.environ,env),patch.object(server,'DB',path/'test.sqlite3'),patch.object(server,'UPLOADS',upload),patch.object(server,'TOKEN',''):
                server.init()
                http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                http_thread=threading.Thread(target=http.serve_forever,daemon=True);http_thread.start()
                base=f'http://127.0.0.1:{http.server_port}/api'
                def req(path,method='GET',obj=None):
                    data=json.dumps(obj).encode() if obj is not None else None
                    request=Request(base+path,data=data,method=method,headers={'Content-Type':'application/json'} if data else {})
                    try:
                        with urlopen(request,timeout=4) as r:return r.status,json.load(r)
                    except HTTPError as exc:return exc.code,json.load(exc)
                try:
                    _,site=req('/sites','POST',{'address':'100 Test Ave'})
                    _,site2=req('/sites','POST',{'address':'200 Test Ave'})
                    _,scenario=req('/sites/'+site['id']+'/scenarios','POST',{'sc_name':'Baseline'})
                    code,source=req('/sites/'+site['id']+'/source-reports/import','POST',{'external_report_id':RID})
                    self.assertEqual(code,201,source)
                    self.assertEqual(source['report_sha256'],SHA)
                    self.assertEqual(source['source_sha256'],SOURCE)
                    self.assertEqual(source['verification_basis'],'private_gateway_attestation_not_field_verification')
                    calls=FakeGateway.calls
                    code,dup=req('/sites/'+site['id']+'/source-reports/import','POST',{'external_report_id':RID})
                    self.assertEqual(code,200)
                    self.assertEqual(dup['id'],source['id'])
                    self.assertEqual(FakeGateway.calls,calls)
                    code,wrong=req('/sites/'+site2['id']+'/source-reports/import','POST',{'external_report_id':RID})
                    self.assertEqual(code,400)
                    self.assertIn('address',wrong['error'])
                    code,invalid=req('/sites/'+site2['id']+'/orders','POST',{'scenario_id':scenario['id'],'source_report_id':source['id']})
                    self.assertEqual(code,400)
                    code,order=req('/sites/'+site['id']+'/orders','POST',{'scenario_id':scenario['id'],'source_report_id':source['id'],'scope':'Review layout'})
                    self.assertEqual(code,201,order)
                    _,snap=req('/reports/'+order['report_id']+'/export')
                    self.assertEqual(snap['originating_source_report']['external_report_id'],RID)
                    self.assertEqual(snap['originating_source_report']['source_sha256'],SOURCE)
                    from outbox_audit import audit
                    self.assertTrue(audit(server.DB)['ok'])
                    with server.connect() as db:
                        self.assertEqual(db.execute('SELECT source_report_id FROM order_source_links WHERE order_id=?',(order['id'],)).fetchone()[0],source['id'])
                        self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox WHERE event_type='site.source_report.linked.v1'").fetchone()[0],1)
                    code,_=req('/sites/'+site['id'],'PUT',{'address':'Changed Address'})
                    self.assertEqual(code,200)
                    code,stale=req('/sites/'+site['id']+'/orders','POST',{'scenario_id':scenario['id'],'source_report_id':source['id']})
                    self.assertEqual(code,400)
                    self.assertIn('current site address',stale['error'])
                finally:
                    http.shutdown();http.server_close();http_thread.join(timeout=4)
            gw.shutdown();gw.server_close();gw_thread.join(timeout=4)

if __name__=='__main__':unittest.main()
