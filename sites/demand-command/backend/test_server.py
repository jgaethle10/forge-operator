"""Unit and loopback HTTP smoke tests for Demand Command API. Run `python -m unittest -v`."""
import http.client
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest

from server import fingerprint, identity, validate


class ModelTests(unittest.TestCase):
    def test_fingerprint_is_not_offer_dependent(self):
        a = {'business': 'A Coffee', 'website': 'https://www.acoffee.example/', 'pain': 'Site access lost', 'product': 'Site rescue'}
        b = {**a, 'product': 'Website Audit'}
        self.assertEqual(fingerprint(a), fingerprint(b))
        self.assertEqual(identity(a), 'acoffee.example')

    def test_verified_needs_receipt(self):
        with self.assertRaises(ValueError):
            validate({'business':'Acme','pain':'Broken website','evidence':'verified','source':'mail:123','sourceText':'Broken'})
        validate({'business':'Acme','pain':'Broken website','evidence':'verified','source':'mail:123','sourceText':'Broken','verification_receipt':'human-review:abc','verified_by':'revenue_ops'})


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        sock = socket.socket()
        sock.bind(('127.0.0.1',0))
        cls.port = sock.getsockname()[1]
        sock.close()
        cls.token = 'unit-test-secret-' + 'x'*48
        env = dict(os.environ, EVERCRAFT_DEMAND_TOKEN=cls.token, EVERCRAFT_DEMAND_PORT=str(cls.port), EVERCRAFT_DEMAND_DB=str(Path(cls.temp.name)/'demand.sqlite'))
        cls.process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('server.py'))], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            try:
                c=http.client.HTTPConnection('127.0.0.1',cls.port,timeout=1)
                c.request('GET','/api/heartbeat',headers={'Authorization':'Bearer '+cls.token})
                status=c.getresponse().status
                c.close()
                if status == 200:
                    break
            except OSError:
                pass
            time.sleep(.02)
        else:
            raise RuntimeError('API did not start: '+cls.process.stderr.read().decode())

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=4)
        cls.temp.cleanup()

    def request(self, method, route, body=None, auth=True):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=3)
        headers={'Content-Type':'application/json'}
        if auth: headers['Authorization']='Bearer '+self.token
        c.request(method,route,body=json.dumps(body) if body is not None else None,headers=headers)
        r=c.getresponse()
        data=json.loads(r.read())
        status=r.status
        c.close()
        return status,data

    def test_public_basic_auth_header_can_coexist_with_private_token(self):
        # The browser preserves its Caddy Basic login while the app token uses
        # a separate header. The inner API must not accept Basic alone.
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        c.request('GET', '/api/heartbeat', headers={
            'Authorization': 'Basic b3duZXI6b3V0ZXI=',
            'X-Evercraft-Demand-Token': self.token,
        })
        r = c.getresponse()
        body = json.loads(r.read())
        self.assertEqual(r.status, 200)
        self.assertTrue(body['ok'])
        c.close()

        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        c.request('GET', '/api/heartbeat', headers={
            'Authorization': 'Basic b3duZXI6b3V0ZXI=',
        })
        r = c.getresponse()
        self.assertEqual(r.status, 401)
        self.assertEqual(json.loads(r.read())['error'], 'Unauthorized')
        c.close()

        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        c.request('GET', '/api/opportunities', headers={
            'Authorization': 'Basic b3duZXI6b3V0ZXI=',
            'X-Evercraft-Demand-Token': 'invalid',
        })
        r = c.getresponse()
        self.assertEqual(r.status, 401)
        self.assertEqual(json.loads(r.read())['error'], 'Unauthorized')
        c.close()

    def test_full_lifecycle_and_fail_closed(self):
        self.assertEqual(self.request('GET','/api/opportunities',auth=False)[0],401)
        # UI shell may load, but API data still requires authentication.
        c = http.client.HTTPConnection('127.0.0.1',self.port,timeout=3)
        c.request('GET','/')
        response = c.getresponse()
        self.assertEqual(response.status,200)
        self.assertIn(b'Connect to private Demand API',response.read())
        c.close()
        record={'business':'Test Coffee', 'website':'https://www.testcoffee.example', 'buyer':'Owner', 'pain':'Former contractor has access to the website', 'evidence':'signal', 'category':'paid', 'status':'researching', 'source':'source-thread:7'}
        code,res=self.request('POST','/api/opportunities',record)
        self.assertEqual(code,201)
        oid=res['id']
        dup=self.request('POST','/api/opportunities',{**record,'product':'Evercraft Research'})
        self.assertEqual(dup[0],409)
        self.assertEqual(dup[1]['existing_id'],oid)
        code,body=self.request('GET','/api/opportunities')
        self.assertEqual((code,len(body['records'])),(200,1))
        self.assertEqual(self.request('PATCH',f'/api/opportunities/{oid}',{'version':999,'status':'drafted'})[0],409)
        code,body=self.request('PATCH',f'/api/opportunities/{oid}',{'version':1,'status':'drafted','draft':'A tailored test'})
        self.assertEqual((code,body['version']),(200,2))
        code,body=self.request('POST',f'/api/opportunities/{oid}/interactions',{'kind':'outreach_reported','note':'Reported email to owner','source':'email:thread:receipt'})
        self.assertEqual(code,201)
        self.assertEqual(body['transport_sent'],False)
        cc = self.request('GET',f'/api/opportunities/{oid}/contact-check')[1]
        self.assertTrue(cc['already_contacted_this_opportunity'])
        self.assertTrue(cc['contact_conflict'])
        self.assertEqual(self.request('POST',f'/api/opportunities/{oid}/interactions',{'kind':'delivery_verified','note':'Provider confirmed sent'})[0],400)
        code,body=self.request('GET',f'/api/opportunities/{oid}')
        self.assertEqual(len(body['activity']),3)
        self.assertEqual(body['status'],'drafted')
        self.assertEqual(self.request('GET',f'/api/opportunities/{oid}/contact-check')[1]['delivery_authorized'],False)
        code,beat=self.request('GET','/api/heartbeat')
        self.assertEqual((code,beat['count']), (200,1))
        self.assertTrue(beat['ok'])


if __name__ == '__main__':
    unittest.main()