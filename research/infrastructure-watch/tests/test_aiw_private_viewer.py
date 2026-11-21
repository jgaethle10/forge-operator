"""Loopback viewer HTTP contract. No external network or deployment."""
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest

SRC = Path(__file__).resolve().parents[1] / "engineering" / "aiw_private_viewer.py"
spec = importlib.util.spec_from_file_location("aiw_private_viewer", SRC)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ViewerTests(unittest.TestCase):
    def test_read_only_status_and_failure_states(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            html = root / "viewer.html"
            status = root / "private.json"
            html.write_text("<!doctype html><html><body>private viewer</body></html>")
            server = ThreadingHTTPServer(("127.0.0.1", 0), mod.handler(html, status))
            worker = Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                def request(path, method="GET"):
                    conn = HTTPConnection("127.0.0.1", server.server_port, timeout=4)
                    conn.request(method, path)
                    r = conn.getresponse()
                    code, body, headers = r.status, r.read(), r.headers
                    conn.close()
                    return code, body, headers

                code, _, headers = request("/")
                self.assertEqual(code, 200)
                self.assertEqual(headers.get("Cache-Control"), "no-store")
                self.assertIn("frame-ancestors 'none'", headers.get("Content-Security-Policy", ""))
                self.assertEqual(request("/api/private-status")[0], 503)
                self.assertEqual(request("/api/private-status", "POST")[0], 405)
                self.assertEqual(request("/anything-else")[0], 404)

                status.write_text('{"status":"passed"}')
                self.assertEqual(request("/api/private-status")[0], 503)
                status.write_text(json.dumps({
                    "schema": "evercraft.aiw.private-operations.v1",
                    "visibility": "private_owner_only",
                    "public_release_ready": False, "national_collector": {"state": "stale"}}))
                code, body, headers = request("/api/private-status")
                self.assertEqual(code, 200)
                self.assertEqual(json.loads(body)["public_release_ready"], False)
                self.assertIn("application/json", headers.get("Content-Type"))
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=3)

    def test_dashboard_has_local_auto_refresh_and_manual_import(self):
        html = (SRC.parents[1] / "operator" / "private-operations.html").read_text()
        self.assertIn("refreshLocalStatus()", html)
        self.assertIn("fetch('/api/private-status'", html)
        self.assertIn('type="file"', html)
        self.assertIn("public_release_ready!==false", html)


if __name__ == "__main__":
    unittest.main()
