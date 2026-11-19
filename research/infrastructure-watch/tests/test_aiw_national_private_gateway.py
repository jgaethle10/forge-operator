"""Offline tests: original national HTML retained, 2026 WA depth isolated and honest."""
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from threading import Thread
import unittest

MODULE=Path(__file__).resolve().parents[1]/"engineering"/"aiw_national_private_gateway.py"
spec=importlib.util.spec_from_file_location("aiw_national_private_gateway",MODULE)
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class NationalFirstTests(unittest.TestCase):
    def test_national_shell_and_owned_wa_queries(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            web=root/"map";web.mkdir()
            (web/"index.html").write_text("<html><body><h1>Original US infrastructure map</h1></body></html>")
            (web/"pnw-2026.html").write_text("<p>PNW evidence</p>")
            overlay=root/"overlay.js";overlay.write_text("window.deepEvidenceLoaded = true;")
            db=root/"wa.sqlite"
            conn=sqlite3.connect(db)
            conn.executescript("""CREATE TABLE bridges(
                bridge_id TEXT,name TEXT,condition TEXT,county_code TEXT,
                latitude REAL,longitude REAL,coordinate_quality TEXT,inspection_entry_count INTEGER);
                CREATE TABLE metadata(key TEXT,value TEXT);""")
            conn.executemany("INSERT INTO bridges VALUES(?,?,?,?,?,?,?,?)",[
                ("WA-OK","WA bridge","P","77",46.6,-120.5,"numeric_within_wa_bbox_not_geodetically_verified",1),
                ("WA-OUT","Outlier","G","27",43.4365,-123.896469,"review_outside_wa_bbox",0)
            ])
            conn.commit();conn.close()
            server=ThreadingHTTPServer(("127.0.0.1",0),app.make_handler(web,overlay,db))
            worker=Thread(target=server.serve_forever,daemon=True);worker.start()
            try:
                def get(path,method="GET"):
                    c=HTTPConnection("127.0.0.1",server.server_port,timeout=3)
                    c.request(method,path)
                    r=c.getresponse()
                    status=r.status;body=r.read();headers=dict(r.getheaders());c.close()
                    return status,body,headers
                status,page,headers=get("/")
                self.assertEqual(status,200)
                self.assertIn(b"Original US infrastructure map",page)
                self.assertIn(b"owned-wa26-drilldown.js",page)
                self.assertEqual(get("/owned-wa26-drilldown.js")[0],200)
                self.assertEqual(get("/pnw-2026.html")[0],200)
                status,raw,_=get("/api/wa26/bridges?condition=P")
                self.assertEqual(status,200)
                data=json.loads(raw)
                self.assertEqual(data["total_matches"],1)
                self.assertEqual(data["bridges"][0]["bridge_id"],"WA-OK")
                self.assertFalse(data["national_2026_complete"])
                viewport="/api/wa26/viewport?south=42&north=49&west=-125&east=-115"
                map_data=json.loads(get(viewport)[1])
                self.assertEqual(map_data["total_matches"],1)
                self.assertNotIn("WA-OUT",str(map_data["bridges"]))
                self.assertEqual(get("/api/wa26/bridges?county=27")[0],200)
                self.assertEqual(json.loads(get("/api/wa26/bridges?county=27")[1])["total_matches"],0)
                self.assertEqual(get("/api/wa26/bridges?limit=500")[0],400)
                self.assertEqual(get("/api/wa26/bridges?offset=-1")[0],400)
                self.assertEqual(get("/api/wa26/viewport?south=50&north=40&west=-125&east=-115")[0],400)
                self.assertEqual(get("/api/status")[0],404)
                self.assertEqual(get("/api/wa26/bridges","POST")[0],405)
                self.assertEqual(get("/.env")[0],404)
            finally:
                server.shutdown();server.server_close();worker.join(timeout=3)


if __name__=="__main__":
    unittest.main()
