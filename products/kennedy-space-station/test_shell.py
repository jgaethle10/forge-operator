"""Real HTTP smoke tests for the separate Kennedy product shell."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent


class KennedyHomeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="evercraft-kss-")
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            cls.port = s.getsockname()[1]
        env = {**os.environ, "KENNEDY_PORT": str(cls.port),
               "EVERCRAFT_SITE_HOST": "127.0.0.1",
               "EVERCRAFT_SITE_DATA": cls.temp.name,
               "EVERCRAFT_SITE_TOKEN": ""}
        cls.proc = subprocess.Popen([sys.executable, str(ROOT / "server.py")],
                                    cwd=str(ROOT), env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            if cls.proc.poll() is not None:
                raise AssertionError("Kennedy server exited during startup: " + cls.proc.stderr.read().decode()[:2000])
            try:
                with urlopen(f"http://127.0.0.1:{cls.port}/api/health", timeout=0.2):
                    break
            except Exception:
                time.sleep(0.05)
        else:
            cls.proc.terminate()
            raise AssertionError("Kennedy server did not respond")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=6)
        cls.proc.stderr.close()
        cls.temp.cleanup()

    def get(self, path):
        with urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=4) as r:
            return r.status, r.read().decode("utf-8")

    def test_distinct_product_homes(self):
        status, home = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("Kennedy Space Station | Your place to plan", home)
        self.assertIn("CONCEPT ONLY", home)
        self.assertIn("Concept · not available", home)
        status, studio = self.get("/studio")
        self.assertEqual(status, 200)
        self.assertIn("Kennedy Spatial Studio", studio)
        self.assertIn("Save revision", studio)
        status, workspace = self.get("/workspace")
        self.assertEqual(status, 200)
        self.assertIn("Evercraft | Site Planner", workspace)
        self.assertNotEqual(home, workspace)

    def test_health_is_honest(self):
        status, health = self.get("/api/health")
        self.assertEqual(status, 200)
        value = json.loads(health)
        self.assertEqual(value["connected_product"], "Evercraft Site Planner")
        self.assertTrue(value["preliminary_2d_studies"])
        self.assertTrue(value["aerial_registration_kernel"])
        self.assertTrue(value["synthetic_s0_a0_pdf_compiler"])
        self.assertTrue(value["synthetic_raster_pdf_ci_proof"])
        self.assertFalse(value["real_raster_pdf_in_studio"])
        self.assertTrue(value["aerial_image_upload_integrated"])
        self.assertEqual(value["aerial_upload_mode"], "private_operator_json_png_only")
        self.assertFalse(value["aerial_sources_export_authorized"])
        self.assertFalse(value["aerial_underlay_sheet_export"])
        self.assertFalse(value["s0_a0_two_sheet_compiler"])
        self.assertFalse(value["historical_site_report_parity"])
        self.assertFalse(value["historical_site_plan_parity"])
        self.assertFalse(value["membership_checkout_integrated"])
        self.assertFalse(value["public_customer_access"])
        self.assertFalse(value["spatial_rendering_integrated"])

    def test_nonloopback_bind_refused_even_with_shared_token(self):
        """A bearer token must not authorize KSS to listen on every interface."""
        import os
        import subprocess
        import sys
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ,
                   "EVERCRAFT_SITE_HOST": "0.0.0.0",
                   "EVERCRAFT_SITE_TOKEN": "synthetic-token-does-not-open-port",
                   "EVERCRAFT_SITE_DATA": tmp,
                   "KENNEDY_DATA": str(Path(tmp) / "kennedy"),
                   "KENNEDY_PORT": "8811"}
            p = subprocess.run([sys.executable, str(ROOT / "server.py")],
                               env=env, capture_output=True, text=True, timeout=8)
            self.assertNotEqual(p.returncode, 0)
            self.assertIn("refusing non-loopback", p.stderr)

    def test_site_created_in_site_planner_is_visible_from_kennedy(self):
        data = json.dumps({"name": "Owned synthetic parcel", "address": "100 Example Road",
                           "site_type": "preliminary site planning"}).encode()
        req = Request(f"http://127.0.0.1:{self.port}/api/sites", data=data,
                      headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=4) as r:
            self.assertEqual(r.status, 201)
            site = json.load(r)
        status, raw = self.get("/api/sites")
        self.assertEqual(status, 200)
        self.assertIn(site["id"], [s["id"] for s in json.loads(raw)])
        status, linked = self.get("/workspace?site=" + site["id"])
        self.assertEqual(status, 200)
        self.assertIn("Site Planner", linked)


if __name__ == "__main__":
    unittest.main()
