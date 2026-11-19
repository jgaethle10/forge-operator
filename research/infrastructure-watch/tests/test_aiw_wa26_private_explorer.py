"""Private Washington explorer browser/proxy contract tests (no public calls)."""
import importlib.util
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest

PATH=Path(__file__).resolve().parents[1]/"engineering"/"aiw_wa26_private_explorer.py"
spec=importlib.util.spec_from_file_location("aiw_wa26_private_explorer",PATH)
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class ExplorerTests(unittest.TestCase):
    def test_restricted_private_routes(self):
        with TemporaryDirectory() as dirname:
            page=Path(dirname)/"index.html"
            page.write_text("<!doctype html><title>Washington Evidence</title>")
            server=ThreadingHTTPServer(("127.0.0.1",0),app.handler(page))
            thread=Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                def request(path, method="GET"):
                    c=HTTPConnection("127.0.0.1",server.server_port,timeout=3)
                    c.request(method,path)
                    r=c.getresponse()
                    result=(r.status,r.read(),dict(r.getheaders()))
                    c.close()
                    return result
                code,data,headers=request("/")
                self.assertEqual(code,200)
                self.assertIn(b"Washington Evidence",data)
                self.assertIn("default-src 'none'",headers.get("Content-Security-Policy",""))
                self.assertEqual(request("/healthz")[0],200)
                self.assertEqual(request("/api/bridges?evil=1")[0],400)
                self.assertEqual(request("/api/bridges?limit=1&limit=2")[0],400)
                self.assertEqual(request("/api/v1/bridges")[0],404)
                self.assertEqual(request("/etc/passwd")[0],404)
                self.assertEqual(request("/","POST")[0],405)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__=="__main__":
    unittest.main()
