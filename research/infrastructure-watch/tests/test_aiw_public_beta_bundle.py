"""Regression tests for a source-locked no-runtime AIW public beta package."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SRC=Path(__file__).resolve().parents[1]/"release"/"aiw_public_beta_bundle.py"
spec=importlib.util.spec_from_file_location("aiw_public_beta_bundle",SRC)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

PRIVATE=Path(__file__).resolve().parents[1]/"operator"/"aiw-state-first-private.html"


class StaticReleaseTests(unittest.TestCase):
    def test_approved_hover_html_converts_to_relative_assets_and_no_root_api(self):
        text=mod.static_page(PRIVATE.read_bytes()).decode()
        for name in ("./vendor/leaflet.css","./vendor/leaflet.js",
                     "./data/states.json","./data/states.geojson",
                     "./data/wa-summary.json","./data/wa-bridges.json",
                     "./about.html"):
            self.assertIn(name,text)
        self.assertIn("function hoverPreview(name)",text)
        self.assertIn("layer.bindTooltip(()=>hoverPreview(name)",text)
        self.assertIn("staticBridgeRows.filter",text)
        self.assertNotIn('fetch("/api/',text)
        self.assertNotIn("fetch('/api/",text)
        self.assertNotIn('href="/advanced"',text)
        self.assertNotIn("fetch('/api/wa26/bridges",text)

    def test_mutated_page_is_not_silently_repackaged(self):
        changed=PRIVATE.read_bytes().replace(b"function hoverPreview(name)",b"function renamed(name)")
        with self.assertRaisesRegex(ValueError,"Approved hover experience missing"):
            mod.static_page(changed)
        changed=PRIVATE.read_bytes().replace(b"function selectRecord(r)",b"function replacedRecord(r)")
        with self.assertRaisesRegex(ValueError,"controller changed"):
            mod.static_page(changed)

    def test_public_beta_package_is_static_and_fails_closed(self):
        preview=PRIVATE.read_bytes()
        states=[{"name":"Washington","bridges_2025":8500,"poor_2025":490,"vintage":2025}]+[
            {"name":f"State {n}","bridges_2025":100,"poor_2025":3,"vintage":2025}
            for n in range(51)]
        geo={"type":"FeatureCollection","features":[
            {"type":"Feature","properties":{"name":f"Region {i}"},
             "geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}
            for i in range(56)]}
        wa={"scope":"WA_only_2026","records":8619,
            "conditions":{"G":4298,"F":3918,"P":403},
            "flagged_coordinate_count":1,"historical_condition_not_emergency":True,
            "national_2026_complete":False,"source_sha256":"synthetic-test"}
        rows=[{"bridge_id":f"WA-TEST-{i:05d}","name":f"Synthetic bridge {i}",
               "condition":"P" if i<403 else "F",
               "county_code":"077","latitude":46.6,"longitude":-120.5,
               "coordinate_quality":"reported_within_wa_bbox","inspection_entry_count":1}
              for i in range(8618)]
        response={}
        response["/"]=preview
        response["/api/states"]=mod.emit_json({"scope":"national_state_summaries_FHWA_2025","states":states})
        response["/data/states.geojson"]=mod.emit_json(geo)
        response["/api/wa26/summary"]=mod.emit_json(wa)
        for offset in range(0,8618,100):
            page=rows[offset:offset+100]
            response[f"/api/wa26/bridges?limit=100&offset={offset}"]=mod.emit_json({
                "scope":"WA_only_2026","total_matches":8618,
                "offset":offset,"returned":len(page),"not_live_safety":True,"bridges":page})
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            vendor=root/"vendor";vendor.mkdir()
            (vendor/"leaflet.js").write_bytes(b"fake-map-js")
            (vendor/"leaflet.css").write_bytes(b"fake-map-css")
            (vendor/"LICENSE").write_text("license test")
            approved=root/"approved.html";approved.write_bytes(preview)
            args=type("Args",(),{"origin":"http://127.0.0.1:8796",
                "source_html":str(approved),"leaflet_dir":str(vendor),
                "output":str(root/"release"),"commit":"a"*40})()
            with patch.object(mod,"acquire",side_effect=lambda _base,p:response[p]):
                with patch.dict(mod.LEAFLET_SRI,{
                    "leaflet.js":mod.base64.b64encode(mod.hashlib.sha256(b"fake-map-js").digest()).decode(),
                    "leaflet.css":mod.base64.b64encode(mod.hashlib.sha256(b"fake-map-css").digest()).decode()
                }):
                    mod.export(args)
            out=root/"release"
            self.assertTrue((root/"release.tar.gz").exists())
            self.assertTrue((out/"data/wa-bridges.json").is_file())
            self.assertTrue((out/"data/states.geojson").is_file())
            self.assertTrue((out/"vendor/leaflet.js").is_file())
            self.assertFalse((out/".env").exists())
            manifest=json.loads((out/"release.json").read_text())
            self.assertFalse(manifest["public_release_ready"])
            self.assertFalse(manifest["public_url_verified"])
            self.assertEqual(manifest["wa_2026_deep_records"],8618)
            self.assertEqual(len(json.loads((out/"data/wa-bridges.json").read_text())["bridges"]),8618)
            self.assertFalse(any("/api/" in p for p in manifest["files"]))
            with self.assertRaises(FileExistsError):
                with patch.object(mod,"acquire",side_effect=lambda _base,p:response[p]):
                    mod.export(args)

    def test_source_must_be_private_loopback(self):
        with tempfile.TemporaryDirectory() as tmp:
            a=type("Args",(),{"origin":"https://fabric.systemiacommandcenters.com",
                "source_html":tmp+"/nonexistent.html","leaflet_dir":tmp,
                "output":tmp+"/out","commit":"a"*40})()
            with self.assertRaisesRegex(ValueError,"loopback"):
                mod.export(a)


if __name__=="__main__":
    unittest.main()
