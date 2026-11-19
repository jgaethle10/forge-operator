"""Read-only Washington 2026 API contract, with temporary synthetic SQLite only."""
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from threading import Thread
import unittest

src = Path(__file__).resolve().parents[1] / "engineering" / "aiw_wa26_readonly_api.py"
spec = importlib.util.spec_from_file_location("wa_api", src)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class WAApiTests(unittest.TestCase):
    def test_verified_index_and_read_only_geo_filter(self):
        with TemporaryDirectory() as tmp:
            db = Path(tmp) / "wa.sqlite"
            c = sqlite3.connect(db)
            c.executescript("""
                CREATE TABLE bridges (
                    state TEXT, bridge_id TEXT PRIMARY KEY, name TEXT, condition TEXT,
                    county_code TEXT, county_name TEXT, latitude REAL, longitude REAL,
                    coordinate_quality TEXT, source_url TEXT, inspection_entry_count INTEGER);
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            rows = []
            for code, n in (("G", 4298), ("F", 3918), ("P", 403)):
                for i in range(n):
                    id = f"{code}-{i:05d}"
                    quality = "review_outside_wa_bbox" if code == "G" and i == 0 else "numeric_within_wa_bbox_not_geodetically_verified"
                    rows.append(("WA",id,None,code,"77",None,43.4365 if i == 0 and code == "G" else 47.1,-123.89,quality,"source",0))
            c.executemany("INSERT INTO bridges VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows)
            metadata = {
                "source_sha256": api.EXPECTED_SHA,
                "scope": "WA_only_not_national",
                "emergency_feed": False,
            }
            c.executemany("INSERT INTO metadata VALUES (?,?)",
                          [(k, json.dumps(v)) for k,v in metadata.items()])
            c.commit()
            c.close()
            api.check_database(db)
            server = ThreadingHTTPServer(("127.0.0.1",0),api.handler(db))
            worker = Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                def request(path, method="GET"):
                    conn=HTTPConnection("127.0.0.1",server.server_port, timeout=5)
                    conn.request(method,path)
                    r=conn.getresponse()
                    code=r.status
                    obj=json.loads(r.read())
                    conn.close()
                    return code,obj
                status, coverage = request("/api/v1/coverage")
                self.assertEqual(status, 200)
                self.assertFalse(coverage["national_complete"])
                self.assertEqual(request("/api/v1/bridges?condition=G")[1]["total_matches"],4297)
                flagged = request("/api/v1/bridges?condition=G&mapped_only=0")[1]
                self.assertEqual(flagged["total_matches"],4298)
                self.assertEqual(flagged["bridges"][0]["coordinate_quality"],"review_outside_wa_bbox")
                self.assertEqual(request("/api/v1/bridges?condition=P&limit=10")[1]["returned"],10)
                self.assertEqual(request("/api/v1/bridges?limit=9999")[0],400)
                self.assertEqual(request("/api/v1/bridges?county=x")[0],400)
                self.assertEqual(request("/api/v1/bridges", "POST")[0],405)
                self.assertEqual(request("/secret")[0],404)
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
