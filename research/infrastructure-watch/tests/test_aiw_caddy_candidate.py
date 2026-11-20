"""Exact non-mutating AIW public-edge route insertion regression."""
from pathlib import Path
import importlib.util
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
module_path=ROOT/"release"/"aiw_caddy_candidate.py"
spec=importlib.util.spec_from_file_location("aiw_caddy_candidate",module_path)
caddy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(caddy)
FRAGMENT=(ROOT/"release"/"AIW-public-beta.Caddyfile.fragment").read_text()
BASE="""{
  http_port 18080
  https_port 8443
  email {$EVERCRAFT_ACME_EMAIL}
  admin off
}

{$EVERCRAFT_PUBLIC_HOST} {
  @remote {
    method POST
    path /v1/remote/*
  }
  handle /v1/remote/* {
    route {
      reverse_proxy 127.0.0.1:8797
    }
  }
  @evercraftHomeRoot path /home
  redir @evercraftHomeRoot /home/ 308
  handle_path /home/* {
    reverse_proxy 127.0.0.1:4310
  }
  handle {
    reverse_proxy 127.0.0.1:8787
  }
  header {
    X-Content-Type-Options nosniff
  }
  log {
    output file /var/log/caddy/evercraft-fabric-access.log
  }
}

worlds.systemiacommandcenters.com {
  handle /worlds/* {
    reverse_proxy 127.0.0.1:8788
  }
  handle {
    respond 404
  }
}
"""

class CandidateTests(unittest.TestCase):
    def test_only_one_narrow_static_route_is_inserted(self):
        target=caddy.build_candidate(BASE,FRAGMENT)
        self.assertEqual(target.count("handle_path /infrastructure-watch/*"),1)
        self.assertIn("root * /srv/evercraft/infrastructure-watch/current",target)
        self.assertTrue(target.startswith(BASE[:BASE.index("  handle {\n    reverse_proxy 127.0.0.1:8787")]))
        self.assertEqual(target[target.index("  handle {\n    reverse_proxy 127.0.0.1:8787"):],
                         BASE[BASE.index("  handle {\n    reverse_proxy 127.0.0.1:8787"):])
        self.assertIn('worlds.systemiacommandcenters.com {',target)
        self.assertEqual(len(re.findall(r'(?m)^\\s*reverse_proxy 127\\.0\\.0\\.1:8787\\s*
        self.assertEqual(target.count("reverse_proxy 127.0.0.1:4310"),1)
        self.assertEqual(target.count("reverse_proxy 127.0.0.1:8797"),1)
        self.assertEqual(target.count("reverse_proxy 127.0.0.1:8788"),1)

    def test_refuse_duplicate_route_and_config_drift(self):
        for original in (BASE.replace("handle_path /home/*","handle_path /house/*"),
                         BASE.replace("127.0.0.1:8787","127.0.0.1:8786"),
                         BASE.replace("{$EVERCRAFT_PUBLIC_HOST}","other.example.com"),
                         BASE + BASE,
                         BASE.replace("reverse_proxy 127.0.0.1:8787",
                                      "reverse_proxy 127.0.0.1:8787\n    reverse_proxy 127.0.0.1:9999"),
                         BASE.replace("  handle {\n    reverse_proxy 127.0.0.1:8787",
                                      "  handle /x/* {\n    reverse_proxy 127.0.0.1:8787"),
                         BASE.replace("  handle {\n    reverse_proxy 127.0.0.1:8787",
                                      "  handle_path /infrastructure-watch/* {\n    reverse_proxy 127.0.0.1:8787")):
            with self.subTest(original=original[:60]):
                with self.assertRaises(ValueError):
                    caddy.build_candidate(original,FRAGMENT)

    def test_reject_backend_hijack_in_release_fragment(self):
        with self.assertRaises(ValueError):
            caddy.build_candidate(BASE,FRAGMENT+"reverse_proxy 127.0.0.1:8787\n")
        with self.assertRaises(ValueError):
            caddy.build_candidate(BASE,FRAGMENT.replace("handle_path /infrastructure-watch/*",
                                                       "handle_path /home/*"))
        with self.assertRaises(ValueError):
            caddy.build_candidate(BASE,FRAGMENT.replace("file_server","respond 200"))

if __name__ == "__main__":
    unittest.main()
,target)),1)
        self.assertEqual(target.count("reverse_proxy 127.0.0.1:4310"),1)
        self.assertEqual(target.count("reverse_proxy 127.0.0.1:8797"),1)
        self.assertEqual(target.count("reverse_proxy 127.0.0.1:8788"),1)

    def test_refuse_duplicate_route_and_config_drift(self):
        for original in (BASE.replace("handle_path /home/*","handle_path /house/*"),
                         BASE.replace("127.0.0.1:8787","127.0.0.1:8786"),
                         BASE.replace("{$EVERCRAFT_PUBLIC_HOST}","other.example.com"),
                         BASE + BASE,
                         BASE.replace("reverse_proxy 127.0.0.1:8787",
                                      "reverse_proxy 127.0.0.1:8787\n    reverse_proxy 127.0.0.1:9999"),
                         BASE.replace("  handle {\n    reverse_proxy 127.0.0.1:8787",
                                      "  handle /x/* {\n    reverse_proxy 127.0.0.1:8787"),
                         BASE.replace("  handle {\n    reverse_proxy 127.0.0.1:8787",
                                      "  handle_path /infrastructure-watch/* {\n    reverse_proxy 127.0.0.1:8787")):
            with self.subTest(original=original[:60]):
                with self.assertRaises(ValueError):
                    caddy.build_candidate(original,FRAGMENT)

    def test_reject_backend_hijack_in_release_fragment(self):
        with self.assertRaises(ValueError):
            caddy.build_candidate(BASE,FRAGMENT+"reverse_proxy 127.0.0.1:8787\n")
        with self.assertRaises(ValueError):
            caddy.build_candidate(BASE,FRAGMENT.replace("handle_path /infrastructure-watch/*",
                                                       "handle_path /home/*"))
        with self.assertRaises(ValueError):
            caddy.build_candidate(BASE,FRAGMENT.replace("file_server","respond 200"))

if __name__ == "__main__":
    unittest.main()
