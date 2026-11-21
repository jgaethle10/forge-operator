"""Real private HTTP tests for verified-byte, same-site aerial staging only."""
import base64
import hashlib
import json
import unittest
from urllib.error import HTTPError
from urllib.request import Request,urlopen

import raster_registration as reg
from test_shell import KennedyHomeTest
from test_sheet_compiler import synthetic_map_png


class AerialHTTPTest(KennedyHomeTest):
    def api(self,method,path,data=None):
        body=json.dumps(data).encode() if data is not None else None
        req=Request(f"http://127.0.0.1:{self.port}{path}",method=method,data=body,
                    headers={"Content-Type":"application/json"} if body else {})
        try:
            with urlopen(req,timeout=8) as res:
                return res.status,json.loads(res.read())
        except HTTPError as exc:
            return exc.code,json.loads(exc.read())

    def site(self,name):
        code,result=self.api("POST","/api/sites",
                             {"name":name,"address":"100 Fictional Way"})
        self.assertEqual(code,201,result)
        return result["id"]

    def model(self,site_id):
        image=synthetic_map_png(64,64)
        manifest={
            "schema":reg.SCHEMA,"site_id":site_id,
            "pixel_width":64,"pixel_height":64,
            "expected_sha256":hashlib.sha256(image).hexdigest(),
            "rights_state":"owned","license_ref":"synthetic-owned-fixture-only",
            "source_ref":"synthetic:kennedy-aerial-http",
            "evidence_state":"synthetic",
            "max_rmse_m":.01,
            "control_points":[
                {"pixel_x":x,"pixel_y":y,
                 "local_x_m":x*.5,"local_z_m":y*.5}
                for x,y in ((0,0),(63,0),(0,63),(63,63),(32,32))
            ]
        }
        return {"role":"site","manifest":manifest,
                "png_base64":base64.b64encode(image).decode("ascii")}

    def test_operator_records_are_immutable_private_and_site_scoped(self):
        a=self.site("Synthetic aerial A")
        b=self.site("Synthetic aerial B")
        payload=self.model(a)
        code,result=self.api("POST",f"/api/kss/sites/{a}/aerial-sources",payload)
        self.assertEqual(code,201,result)
        self.assertTrue(result["source_id"].startswith("AIR-"))
        self.assertEqual(result["image_sha256"],payload["manifest"]["expected_sha256"])
        self.assertFalse(result["public_access_authorized"])
        self.assertFalse(result["real_site_sheet_export_authorized"])
        self.assertEqual(result["review_state"],"pending_independent_rights_and_geographic_qa")
        code,listed=self.api("GET",f"/api/kss/sites/{a}/aerial-sources")
        self.assertEqual(code,200)
        self.assertEqual(len(listed),1)
        self.assertEqual(listed[0]["source_id"],result["source_id"])
        self.assertEqual(listed[0]["source_receipt_sha256"],
                         result["source_receipt_sha256"])
        code,detail=self.api("GET",f"/api/kss/sites/{a}/aerial-sources/{result['source_id']}")
        self.assertEqual(code,200)
        self.assertEqual(detail["source_receipt_sha256"],result["source_receipt_sha256"])
        self.assertNotIn("png_base64",json.dumps(detail))
        code,other=self.api("GET",f"/api/kss/sites/{b}/aerial-sources")
        self.assertEqual((code,other),(200,[]))
        code,notfound=self.api("GET",f"/api/kss/sites/{b}/aerial-sources/{result['source_id']}")
        self.assertEqual(code,404,notfound)

    def test_private_png_underlay_route_returns_only_same_site_original_bytes(self):
        sid=self.site("Private overlay source A")
        other=self.site("Private overlay source B")
        payload=self.model(sid)
        code,rec=self.api("POST",f"/api/kss/sites/{sid}/aerial-sources",payload)
        self.assertEqual(code,201,rec)
        image=base64.b64decode(payload["png_base64"])
        url=f"http://127.0.0.1:{self.port}/api/kss/sites/{sid}/aerial-sources/{rec['source_id']}/private-preview.png"
        req=Request(url,method="GET")
        with urlopen(req,timeout=8) as response:
            self.assertEqual(response.status,200)
            self.assertEqual(response.headers["Content-Type"],"image/png")
            self.assertEqual(response.headers["Cache-Control"],"no-store")
            self.assertEqual(response.headers["Cross-Origin-Resource-Policy"],"same-origin")
            self.assertEqual(response.headers["X-Kennedy-Review-Only"],"true")
            self.assertEqual(response.headers["X-Kennedy-Image-SHA256"],rec["image_sha256"])
            self.assertIn("inline",response.headers["Content-Disposition"])
            self.assertEqual(response.read(),image)
        wrong=url.replace(f"/{sid}/",f"/{other}/")
        with self.assertRaises(HTTPError) as other_err:
            urlopen(Request(wrong,method="GET"),timeout=8)
        self.assertEqual(other_err.exception.code,404)
        unknown=url.replace(rec["source_id"],"AIR-"+"F"*20)
        with self.assertRaises(HTTPError) as missing:
            urlopen(Request(unknown,method="GET"),timeout=8)
        self.assertEqual(missing.exception.code,404)
        # No raw PNG is available by referencing an arbitrary path.
        with self.assertRaises(HTTPError) as bad_path:
            urlopen(Request(url.replace("private-preview.png","public.png"),method="GET"),timeout=8)
        self.assertEqual(bad_path.exception.code,404)

    def test_forged_digest_wrong_site_invalid_payload_and_rights_refuse(self):
        a=self.site("Image rejection QA")
        payload=self.model(a)
        bad=json.loads(json.dumps(payload))
        bad["manifest"]["expected_sha256"]="0"*64
        code,_=self.api("POST",f"/api/kss/sites/{a}/aerial-sources",bad)
        self.assertEqual(code,422)
        bad=json.loads(json.dumps(payload))
        bad["manifest"]["site_id"]="OTHER-SITE"
        code,_=self.api("POST",f"/api/kss/sites/{a}/aerial-sources",bad)
        self.assertEqual(code,422)
        bad=json.loads(json.dumps(payload))
        bad["png_base64"]="%%%not-png%%%"
        code,_=self.api("POST",f"/api/kss/sites/{a}/aerial-sources",bad)
        self.assertEqual(code,422)
        bad=json.loads(json.dumps(payload))
        bad["manifest"]["rights_state"]="licensed"
        code,_=self.api("POST",f"/api/kss/sites/{a}/aerial-sources",bad)
        self.assertEqual(code,422)
        code,_=self.api("POST",f"/api/kss/sites/SITE-NOTFOUND/aerial-sources",payload)
        self.assertEqual(code,404)
        code,listed=self.api("GET",f"/api/kss/sites/{a}/aerial-sources")
        self.assertEqual(code,200)
        self.assertEqual(listed,[])

if __name__=="__main__":
    unittest.main()
