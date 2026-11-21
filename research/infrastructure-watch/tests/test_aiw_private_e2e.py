"""AIW end-to-end PRIVATE operations pipeline contract.

Exercised against temporary files only. Validates collector-reported source
receipt -> exporter -> read-only local HTTP viewer. Does not fetch agencies,
install Kaidance schedules, modify production, or authorize publication.
"""
from datetime import datetime, timezone, timedelta
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest

BASE=Path(__file__).resolve().parents[1]
def load(name):
    src=BASE/"engineering"/(name+".py")
    spec=importlib.util.spec_from_file_location(name,src)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

receipts=load("aiw_kaidance_receipts")
export=load("aiw_private_status_export")
viewer=load("aiw_private_viewer")


class EndToEndTests(unittest.TestCase):
    def test_receipt_to_local_dashboard_and_failure(self):
        with TemporaryDirectory() as folder:
            root=Path(folder)
            registry=root/"registry.json"
            registry.write_text(json.dumps({"sources":[
                {"id":"bridge","url":"https://agency.example/bridge"},
                {"id":"minutes","url":"https://agency.example/minutes"}]}))
            receipt_dir=root/"receipts"
            cycle_path=root/"cycle.json"
            hb_path=root/"hb.json"
            status_path=root/"private-status.json"
            now=datetime.now(timezone.utc)-timedelta(seconds=20)
            stamp=now.isoformat(timespec="seconds").replace("+00:00","Z")
            def obs(id,result):
                return {"id":id,"url":"https://agency.example/"+id,
                    "result":result,"checked_at":stamp,
                    "content_sha256":"a"*64 if result=="ok" else None,
                    "error_code":None if result=="ok" else "SOURCE_UNAVAILABLE"}
            # Registry URL is authoritative. Test source order independent.
            observations=[obs("bridge","ok"),obs("minutes","failed")]
            cycle={"cycle_id":"cycle1","collector_id":"testcollector",
                "started_at":stamp,"finished_at":stamp,"sources":observations}
            cycle_path.write_text(json.dumps(cycle))
            saved=receipts.record_receipt(registry,cycle_path,receipt_dir)
            self.assertFalse(saved["complete"])
            hb_path.write_text(json.dumps({
                "schema":"evercraft.aiw.heartbeat.v1",
                "scope":"owned_pnw_v015_service_not_national_site",
                "status":"passed","checked_at_utc":stamp,
                "evidence":{"dataset_rows":21590,"national_complete":False,
                    "live_emergency_check":False,
                    "latest_source_refresh_verified":False}}))
            snapshot=export.collect_status(registry,receipt_dir,hb_path)
            self.assertEqual(snapshot["national_collector"]["state"],"degraded")
            self.assertEqual(snapshot["national_collector"]["sources_ok"],1)
            self.assertFalse(snapshot["public_release_ready"])
            export.save_atomic(status_path,snapshot)
            html=BASE/"operator"/"private-operations.html"
            server=ThreadingHTTPServer(("127.0.0.1",0),viewer.handler(html,status_path))
            worker=Thread(target=server.serve_forever,daemon=True)
            worker.start()
            try:
                conn=HTTPConnection("127.0.0.1",server.server_port,timeout=5)
                conn.request("GET","/api/private-status")
                response=conn.getresponse()
                self.assertEqual(response.status,200)
                served=json.loads(response.read())
                conn.close()
                self.assertEqual(served["national_collector"]["state"],"degraded")
                self.assertEqual(served["national_collector"]["sources_failed_count"],1)
                self.assertNotIn("agency.example",json.dumps(served))
                self.assertFalse(served["public_release_ready"])
                # Corrupt status must not be served as success.
                status_path.write_text('{"schema":"bad"}')
                conn=HTTPConnection("127.0.0.1",server.server_port,timeout=5)
                conn.request("GET","/api/private-status")
                response=conn.getresponse()
                self.assertEqual(response.status,503)
                response.read()
                conn.close()
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=3)


if __name__=="__main__":
    unittest.main()
