import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from server import make_handler, SCHEMA

TOKEN='test-secret-token-only-for-unit-test-123'

class AaarApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(Path(cls.tmp.name)/'store.json',TOKEN,Path(cls.tmp.name)))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
    def call(self,method,path,payload=None,auth=True):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=4)
        headers={}
        if auth:headers['Authorization']='Bearer '+TOKEN
        if payload is not None:
            headers['Content-Type']='application/json'
            payload=json.dumps(payload)
        conn.request(method,path,body=payload,headers=headers)
        response=conn.getresponse()
        status=response.status;data=json.loads(response.read())
        conn.close()
        return status,data
    def test_01_auth_and_health(self):
        self.assertEqual(self.call('GET','/healthz',auth=False)[0],200)
        self.assertEqual(self.call('GET','/api/state',auth=False)[0],401)
    def test_02_revision_guard_and_persistence(self):
        s,initial=self.call('GET','/api/state')
        self.assertEqual((s,initial['revision']),(200,0))
        state={'schema':SCHEMA,'programs':[{'id':'AAAR-001','name':'Safe simulated project','next':'Review evidence'}],'history':[]}
        self.assertEqual(self.call('POST','/api/state',{'expected_revision':4,'state':state})[0],409)
        s,result=self.call('POST','/api/state',{'expected_revision':0,'state':state})
        self.assertEqual((s,result['revision'],result['github_synced']),(200,1,False))
        self.assertEqual(self.call('GET','/api/state')[1]['programs'][0]['id'],'AAAR-001')
        self.assertEqual(self.call('POST','/api/state',{'expected_revision':0,'state':state})[0],409)
    def test_03_orders_no_execution_and_dedup(self):
        order={'program_id':'AAAR-001','action':'Run offline simulation twice','idempotency_key':'AAAR-001-proof-2026-11-19'}
        s,a=self.call('POST','/api/orders',order)
        self.assertEqual((s,a['systemia_execution'],a['deduplicated']),(200,False,False))
        s,b=self.call('POST','/api/orders',order)
        self.assertEqual((s,b['deduplicated'],b['order']['id']),(200,True,a['order']['id']))
        self.assertEqual(self.call('POST','/api/orders',{**order,'action':'Different command'})[0],409)
        self.assertEqual(self.call('POST','/api/orders',{**order,'program_id':'NONEXISTENT','idempotency_key':'new'})[0],404)
        self.assertEqual(self.call('GET','/api/state')[1]['revision'],2)
    def test_04_safety_truth_and_validation(self):
        s,data=self.call('GET','/api/audit')
        self.assertEqual(s,200)
        self.assertEqual(len(data['audit']),2)
        state={'schema':SCHEMA,'programs':[{'id':'dup','name':'x'},{'id':'dup','name':'y'}]}
        self.assertEqual(self.call('POST','/api/state',{'expected_revision':2,'state':state})[0],422)
        self.assertEqual(self.call('GET','/api/state')[1]['revision'],2)
        self.assertFalse(self.call('GET','/healthz',auth=False)[1]['systemia_execution'])

if __name__=='__main__':unittest.main(verbosity=2)