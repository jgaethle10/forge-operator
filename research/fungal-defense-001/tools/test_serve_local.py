#!/usr/bin/env python3
"""Test loopback preview boundaries without launching a public server."""
import http.client
import sys
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parent))
from serve_local import PreviewHandler


class LocalPreviewTests(unittest.TestCase):
    def test_only_versioned_page_is_served(self):
        with TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / 'observatory-v0.2.html').write_text('local-only-content',encoding='utf-8')
            (folder / 'private.txt').write_text('private-content', encoding='utf-8')
            handler = partial(PreviewHandler, directory=str(folder))
            with ThreadingHTTPServer(('127.0.0.1',0),handler) as server:
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                try:
                    for path, code in [('/',302),('/observatory-v0.2.html',200),('/private.txt',404),('/../../private.txt',404),('/data/cdc-cauris-clinical-annual.json',404)]:
                        conn = http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=2)
                        conn.request('GET',path)
                        res=conn.getresponse()
                        body=res.read().decode('utf-8')
                        self.assertEqual(res.status,code, path)
                        self.assertIn('no-store',res.getheader('Cache-Control',''))
                        self.assertIn("connect-src 'none'",res.getheader('Content-Security-Policy',''))
                        if code==200:
                            self.assertEqual(body,'local-only-content')
                        self.assertNotIn('private-content',body)
                        conn.close()
                finally:
                    server.shutdown()
                    worker.join(timeout=2)

if __name__ == '__main__':
    unittest.main()
