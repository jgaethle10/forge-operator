"""Bridge never invents verified evidence or sends outbound messages."""
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
from revenue_desk_bridge import collect, bridge, local_url, normalize

SOURCE = {'opportunities': [
    {'id': 'FMP-001', 'business': 'Example Roofing', 'contact_name': 'Owner', 'pain_point': 'Public message asks for a replacement booking page', 'status': 'sent', 'source_url': 'https://example.org/post/1', 'original_message': 'Need help with booking', 'service': 'Custom website', 'estimated_value': 500},
    {'id': 'EV-002', 'business': 'Property Holdings', 'pain': 'Site operator requests a preliminary EV site report', 'status': 'new', 'category': 'direct_paid_work'},
    {'id': 'NO-003', 'business': 'Unknown Co', 'status': 'interested'},
]}

class BridgeModelTests(unittest.TestCase):
    def test_dry_run_preserves_uncertainty(self):
        staged, rejected = collect(SOURCE)
        self.assertEqual(len(staged), 2)
        self.assertEqual(rejected[0]['reason'], 'missing_explicit_problem')
        self.assertEqual(staged[0]['record']['evidence'], 'signal')
        self.assertEqual(staged[0]['record']['source'], 'revenue-desk:opportunity:FMP-001')
        self.assertEqual(staged[0]['record']['status'], 'contacted')
        self.assertTrue(staged[0]['contact_reported'])
        self.assertNotIn('verification_receipt', staged[0]['record'])
        report = bridge(SOURCE)
        self.assertEqual((report['created'], report['eligible'], report['needs_review']), (0, 2, 1))
        self.assertEqual(report['transport_messages_sent'], 0)
        self.assertEqual(report['provider_deliveries_verified'], 0)

    def test_reject_external_services_and_bad_schema(self):
        for url in ('http://evil.example:8795/api/opportunities', 'https://127.0.0.1:8795/api/opportunities', 'http://127.0.0.1:7777/api/opportunities', 'http://user:pwd@127.0.0.1:8795/api/opportunities'):
            with self.assertRaises(ValueError):
                local_url(url, allow_path={8795})
        with self.assertRaises(ValueError):
            collect({'foo': []})
        with self.assertRaises(ValueError):
            bridge(SOURCE, apply=True)

    def test_requires_stable_id_and_explicit_pain(self):
        self.assertEqual(normalize({'business':'ACME', 'problem':'No checkout'})[1], 'missing_safe_stable_id')
        self.assertEqual(normalize({'id':'33','business':'ACME','description':'Some offer'})[1], 'missing_explicit_problem')
        self.assertEqual(normalize({'id':'33','business':'ACME','pain':'No checkout','evidence':'verified'})[0]['record']['evidence'], 'signal')

class BridgeIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        sock = socket.socket(); sock.bind(('127.0.0.1',0)); cls.port = sock.getsockname()[1]; sock.close()
        cls.token = 't'*50
        env = dict(os.environ, EVERCRAFT_DEMAND_TOKEN=cls.token, EVERCRAFT_DEMAND_PORT=str(cls.port), EVERCRAFT_DEMAND_DB=str(Path(cls.temp.name)/'test.sqlite'))
        cls.proc = subprocess.Popen([sys.executable, str(Path(__file__).with_name('server.py'))], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            try:
                c=http.client.HTTPConnection('127.0.0.1',cls.port,timeout=1); c.request('GET','/api/heartbeat', headers={'Authorization':'Bearer '+cls.token}); r=c.getresponse(); r.read(); c.close()
                if r.status == 200: break
            except OSError: pass
            time.sleep(.02)
        else:
            raise RuntimeError('Demand API failed to start')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=4); cls.temp.cleanup()

    def test_apply_idempotent_and_contact_receipt_not_verified(self):
        # Production bridge only allows fixed port 8796. The port override below
        # is solely for a local unit test and cannot enable remote network access.
        from unittest.mock import patch
        with patch('revenue_desk_bridge.local_url', lambda url, allow_path: url):
            url = f'http://127.0.0.1:{self.port}'
            first = bridge(SOURCE, url, apply=True, token=self.token)
            self.assertEqual((first['created'], first['needs_review']), (2, 1))
            again = bridge(SOURCE, url, apply=True, token=self.token)
            self.assertEqual((again['created'], again['already_imported']), (0, 2))
        c = http.client.HTTPConnection('127.0.0.1', self.port)
        c.request('GET', '/api/opportunities', headers={'Authorization':'Bearer '+self.token})
        got=json.loads(c.getresponse().read()); c.close()
        self.assertEqual(len(got['records']), 2)
        rec=next(x for x in got['records'] if x['source'].endswith('FMP-001'))
        self.assertEqual(rec['evidence'], 'signal')
        self.assertTrue(any(x['type']=='outreach_reported' for x in rec['activity']))
        self.assertFalse(any(x['type']=='delivery_verified' for x in rec['activity']))

class NetworkBoundaryTests(unittest.TestCase):
    def test_http_redirect_cannot_escape_loopback(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        import urllib.error
        from revenue_desk_bridge import get_json
        class Redirect(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header('Location', 'https://example.org/capture')
                self.end_headers()
            def log_message(self, *_):
                return
        srv = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        t = Thread(target=srv.serve_forever, daemon=True); t.start()
        try:
            with self.assertRaises(urllib.error.HTTPError) as got:
                get_json(f'http://127.0.0.1:{srv.server_address[1]}/redirect')
            self.assertEqual(got.exception.code, 302)
        finally:
            srv.shutdown(); srv.server_close(); t.join(timeout=3)


if __name__ == '__main__':
    unittest.main()