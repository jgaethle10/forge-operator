"""GEMS-008C synthetic, no-network public metadata and provenance tests."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import gems_008c_nbmg_service_scout as x

def plan():
    return {"schema":x.SCHEMA,"query":x.BASE+"?f=json",
            "eligible_for_training_or_scoring":False}

def feature(n,source="OFR 20-1",fault="normal"):
    return {"attributes":{"OBJECTID":n,"source":source,"faultType":fault,
            "positionalAccuracy":"known","observationMethod":"field"}}

class ScoutTests(unittest.TestCase):
    def test_bounded_metadata_classifies_but_never_qualifies_labels(self):
        r=x.analyze(plan(),{"features":[feature(1),feature(2),
                                      feature(3,"OFR 05-11",None)]})
        self.assertEqual(r["feature_count"],3)
        self.assertEqual(r["source_distribution"],{"OFR 05-11":1,"OFR 20-1":2})
        self.assertEqual(r["faultType_distribution"]["(missing)"],1)
        self.assertFalse(r["independent_fault_labels_qualified"])
        self.assertFalse(r["competition_submission_made"])
        self.assertNotIn("query",r)

    def test_truncated_missing_corrupted_and_geometry_are_refused(self):
        cases=[
          {"features":[feature(1)],"exceededTransferLimit":True},
          {"features":[feature(1),feature(1)]},
          {"features":[dict(feature(1),geometry={"paths":[[1,2]]})]},
          {"features":[{"attributes":{"OBJECTID":1}}]},
          {"error":{"message":"unavailable"}},
          {"features":[feature(n) for n in range(x.MAX_RECORDS)]}]
        for c in cases:
            with self.subTest(key=str(c)[:30]),self.assertRaises(ValueError):
                x.analyze(plan(),c)

    def test_private_original_pdf_receipt_and_write_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);pdf=root/"sheet.pdf";pdf.write_bytes(b"synthetic-pdf")
            sha=x.sha(pdf)
            manifest=root/"source.json"
            manifest.write_text(json.dumps({
              "schema":"evercraft.gems.external-fault-source-acquisition.v1",
              "sources":[{
                "id":"nbmg-ofr-20-1-petrified-spring-sheet1-2020",
                "retrieval":{"sha256":sha},
                "technical":{"crs":"EPSG:26911 (NAD83 / UTM zone 11N)"},
                "organizer_overlap":{"source_neatline_epsg26911":[
                   [400000,4260000],[410000,4260000],
                   [410000,4270000],[400000,4270000]]}}]}))
            with patch.object(x,"PDF_SHA",sha):
                q=x.preregister(manifest,pdf)
                self.assertIn("returnGeometry=false",q["query"])
                self.assertTrue(q["query"].startswith(x.BASE))
                x.write_once(root/"receipt.json",q)
                with self.assertRaises(FileExistsError):
                    x.write_once(root/"receipt.json",q)
            with self.assertRaisesRegex(ValueError,"source_pdf_sha256_mismatch"):
                x.preregister(manifest,pdf)

if __name__=="__main__":unittest.main()
