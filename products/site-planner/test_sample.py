"""Safe, nonmutating sample endpoint: fictional evidence, no hidden customer data."""
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch
import server


class SamplePreviewTests(unittest.TestCase):
    def test_sample_is_read_only_and_honors_private_authentication(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(server, 'DB', Path(tmp) / 'sample.sqlite3'), patch.object(server, 'TOKEN', 'fixture-only-secret'):
                server.init()
                http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
                thread = threading.Thread(target=http.serve_forever, daemon=True)
                thread.start()
                base = f'http://127.0.0.1:{http.server_port}'
                try:
                    for route in ('/sample', '/sample.html'):
                        with self.assertRaises(HTTPError) as err:
                            urlopen(base + route, timeout=4)
                        self.assertEqual(err.exception.code, 401)
                        with urlopen(Request(base + route, headers={'Authorization': 'Bearer fixture-only-secret'}), timeout=4) as res:
                            self.assertEqual(res.status, 200)
                            self.assertTrue(res.headers.get('Content-Type', '').startswith('text/html'))
                            self.assertEqual(res.headers.get('X-Frame-Options'), 'DENY')
                            self.assertIn('frame-ancestors', res.headers.get('Content-Security-Policy', ''))
                            doc = res.read().decode('utf-8')
                            self.assertIn('Fictional retail property', doc)
                            self.assertIn('NOT TO SCALE', doc)
                            self.assertIn('ASSUMED', doc)
                            self.assertIn('UNKNOWN', doc)
                            self.assertIn('not a site survey', doc.lower())
                            self.assertNotIn('buy.stripe.com', doc)
                    with server.connect() as db:
                        self.assertEqual(db.execute('SELECT count(*) FROM sites').fetchone()[0], 0)
                        self.assertEqual(db.execute('SELECT count(*) FROM orders').fetchone()[0], 0)
                        self.assertEqual(db.execute('SELECT count(*) FROM outbox').fetchone()[0], 0)
                finally:
                    http.shutdown()
                    http.server_close()
                    thread.join(timeout=4)


if __name__ == '__main__':
    unittest.main()
