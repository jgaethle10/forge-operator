"""AIW Evercraft bridge-and-compass brand: exporter and safe hotfix regressions."""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[1]
PRIVATE = SRC / "operator" / "aiw-state-first-private.html"
EXPORTER = SRC / "release" / "aiw_public_beta_bundle.py"
HOTFIX = SRC / "release" / "aiw-beta-brand-hotfix-penguin.py"


def load(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


exporter=load("aiw_exporter_with_brand",EXPORTER)
hotfix=load("aiw_brand_hotfix_script",HOTFIX)


class EvercraftBrandTests(unittest.TestCase):
    def test_static_export_has_consistent_branded_header_and_empty_state(self):
        result=exporter.static_page(PRIVATE.read_bytes()).decode()
        self.assertEqual(result.count('viewBox="0 0 64 64"'),2)
        self.assertEqual(result.count('aria-hidden="true"><svg'),2)
        self.assertNotIn("⌖",result)
        self.assertEqual(result.count(".symbol svg{"),1)
        self.assertEqual(result.count(".empty .icon svg{"),1)
        self.assertIn("function hoverPreview(name)",result)
        self.assertIn("fetch('./data/wa-bridges.json'",result)
        self.assertIn('href="./about.html"',result)
        self.assertIn("American Infrastructure Watch",result)

    def test_hotfix_refuses_any_nonbaseline_header(self):
        source=PRIVATE.read_text()
        for bad in (source.replace("⌖", "X", 1),
                    source.replace(".symbol{height:34px;",".symbol{height:35px;",1)):
            with self.assertRaisesRegex(ValueError,"Expected exactly one"):
                exporter.apply_brand_to_public(bad)
        with self.assertRaisesRegex(ValueError,"Expected exactly one"):
            exporter.apply_brand_to_public(exporter.apply_brand_to_public(source))

    def test_brand_hotfix_keeps_all_evidence_bytes(self):
        original=PRIVATE.read_text()
        payload={}
        for name in hotfix.EXPECTED-{"release.json","SHA256SUMS"}:
            payload[name] = (original.encode() if name=="index.html" else ("content:"+name).encode())
        manifest={
            "schema":"evercraft.aiw.public-beta-static.v1",
            "source_commit":hotfix.SOURCE,
            "national_state_summaries_2025":52,
            "wa_2026_total":8619, "wa_2026_poor":403,
            "wa_2026_deep_records":8618,
            "public_url_verified":False,
            "files": {name: hashlib.sha256(data).hexdigest() for name,data in payload.items()},
        }
        # Test independent rechecks while preserving the original static release's
        # full 13-file membership and manifest/checksum contract.
        new=hotfix.create_new_payload(payload,manifest,exporter)
        for name in hotfix.EXPECTED-{"index.html","release.json","SHA256SUMS"}:
            self.assertEqual(new[name],payload[name])
        self.assertEqual(
            json.loads(new["release.json"])["branding_revision"],
            exporter.AIW_BRAND_REVISION)
        self.assertIn(b"<svg",new["index.html"])
        self.assertNotIn("⌖".encode(),new["index.html"])
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for name,data in new.items():
                path=root/name; path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
            items,verified=hotfix.verify(root)
            self.assertEqual(items["index.html"],new["index.html"])
            self.assertEqual(verified["files"]["index.html"],hotfix.digest(new["index.html"]))


if __name__ == "__main__":
    unittest.main()
