import json, sys, tempfile, unittest
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import atlas

def feature(n):
    return {"type":"Feature","properties":{"OBJECTID":n,"GNIS_Name":"SYNTHETIC TEST ONLY"},"geometry":{"type":"LineString","coordinates":[[-120.,46.20],[-119.90,46.26]]}}

class Session:
    def __init__(self,missing=False): self.missing=missing
    def get(self,url,params,timeout):
        data={"objectIds":[1,2],"objectIdFieldName":"OBJECTID"} if params.get("returnIdsOnly")=="true" else {"type":"FeatureCollection","features":[] if self.missing else [feature(1),feature(2)]}
        return mock.Mock(status_code=200,raise_for_status=lambda:None,json=lambda:data)

class AtlasTests(unittest.TestCase):
    def test_complete_query(self):
        features,audit=atlas.collect(Session(),"WA_NHD",[-121,46,-119,47])
        self.assertEqual(audit["ids"],2)
        self.assertTrue(audit["retrieval_complete_for_query"])
        self.assertEqual(len(features),2)
        self.assertTrue(all(f["properties"]["solar_feasible"]=="NOT_ASSESSED" for f in features))
    def test_partial_query_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError,"incomplete"):
            atlas.collect(Session(missing=True),"WA_NHD",[-121,46,-119,47])
    def test_failure_clears_stale_archive(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(atlas,"OUT",Path(d)),mock.patch.object(atlas,"collect",side_effect=RuntimeError("offline")):
                old=Path(d)/"sunnyside_wa_RESEARCH_ONLY.zip"
                old.write_text("stale")
                self.assertFalse(atlas.build("sunnyside_wa"))
                self.assertFalse(old.exists())
                self.assertFalse((Path(d)/"sunnyside_wa"/"map.html").exists())
                manifest=json.loads((Path(d)/"sunnyside_wa"/"manifest.json").read_text())
                self.assertEqual(manifest["sales_gate"],"BLOCKED")
    def test_synthetic_success(self):
        fake_audit={"source_id":"WA_NHD","url":"test://source","attribution":"SYNTHETIC","ids":1,
                    "clipped":1,"mapped_length_km":2.3,"retrieval_complete_for_query":True}
        fake_feature={"type":"Feature","geometry":feature(1)["geometry"],"properties":
                      {"source_name":"SYNTHETIC TEST ONLY","evermaps_id":"test1","length_km":2.3,"source_id":"WA_NHD"}}
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.object(atlas,"OUT",Path(d)),mock.patch.object(atlas,"collect",side_effect=lambda s,source,bounds:([fake_feature],dict(fake_audit,source_id=source))):
                self.assertTrue(atlas.build("sunnyside_wa"))
                self.assertTrue((Path(d)/"sunnyside_wa_RESEARCH_ONLY.zip").exists())
                self.assertIn("NOT A SOLAR",(Path(d)/"sunnyside_wa"/"map.html").read_text())
if __name__=="__main__": unittest.main()
