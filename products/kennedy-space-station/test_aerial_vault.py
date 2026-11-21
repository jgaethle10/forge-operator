"""Private Kennedy aerial source vault tests: no partner/client data."""
import base64
import hashlib
import json
import tempfile
import unittest

import raster_registration as reg
import aerial_vault
from test_sheet_compiler import synthetic_map_png

class AerialVaultTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="kss-air-vault-")
        self.vault=aerial_vault.AerialVault(self.temp.name)
        self.vault.init()
        self.image=synthetic_map_png(64,64)
        self.manifest={
            "schema":reg.SCHEMA,
            "site_id":"SITE-A",
            "pixel_width":64,"pixel_height":64,
            "expected_sha256":hashlib.sha256(self.image).hexdigest(),
            "rights_state":"owned","license_ref":"synthetic-test",
            "source_ref":"synthetic:owned-aerial",
            "evidence_state":"synthetic","max_rmse_m":.01,
            "control_points":[
                {"pixel_x":x,"pixel_y":y,"local_x_m":x*.5,"local_z_m":y*.5}
                for x,y in ((0,0),(63,0),(0,63),(63,63),(32,32))
            ]
        }
    def tearDown(self):
        self.temp.cleanup()
    def test_immutable_image_metadata_and_private_bytes(self):
        a=self.vault.save("SITE-A","site",self.manifest,self.image)
        self.assertEqual(a["image_sha256"],self.manifest["expected_sha256"])
        self.assertFalse(a["real_site_sheet_export_authorized"])
        self.assertFalse(a["georeferenced"])
        self.assertEqual(a["review_state"],"pending_independent_rights_and_geographic_qa")
        self.assertEqual(self.vault.list("SITE-A")[0]["source_id"],a["source_id"])
        self.assertEqual(self.vault.list("SITE-B"),[])
        receipt,stored=self.vault.get("SITE-A",a["source_id"],include_bytes=True)
        self.assertEqual(stored,self.image)
        self.assertEqual(receipt["registration"]["pixel_to_local_m"],
                         [0.5,0.,0.,0.,0.5,0.])
        with self.assertRaises(LookupError):
            self.vault.get("SITE-B",a["source_id"],include_bytes=True)
        with self.vault.connect() as db:
            event=db.execute("SELECT event_type,state,event_payload FROM source_events").fetchone()
            self.assertEqual(event["event_type"],"kss.aerial.source.staged.v1")
            self.assertEqual(event["state"],"pending")
            self.assertFalse(json.loads(event["event_payload"])["publication_authority"])
    def test_wrong_rights_site_and_corrupt_png_fail(self):
        with self.assertRaisesRegex(aerial_vault.SourceError,"manifest_site_mismatch"):
            self.vault.save("SITE-B","site",self.manifest,self.image)
        with self.assertRaisesRegex(aerial_vault.SourceError,"role"):
            self.vault.save("SITE-A","unknown",self.manifest,self.image)
        m={**self.manifest,"rights_state":"licensed","derivative_use_approved":False}
        with self.assertRaisesRegex(reg.RegistrationError,"derivative_use"):
            self.vault.save("SITE-A","site",m,self.image)
        corrupted=bytearray(self.image)
        corrupted[-1]^=1
        m={**self.manifest,"expected_sha256":hashlib.sha256(corrupted).hexdigest()}
        with self.assertRaises(Exception):
            self.vault.save("SITE-A","site",m,bytes(corrupted))
        self.assertEqual(self.vault.list("SITE-A"),[])
    def test_explicit_real_operator_attestation_is_hold_not_release(self):
        m={**self.manifest,"evidence_state":"source-derived",
           "source_ref":"operator-supplied-private-raster"}
        record=self.vault.save("SITE-A","context",m,self.image)
        self.assertFalse(record["customer_access_authorized"])
        self.assertFalse(record["public_access_authorized"])
        self.assertFalse(record["real_site_sheet_export_authorized"])

if __name__=="__main__":
    unittest.main()
