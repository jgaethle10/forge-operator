"""Real loopback HTTP proof for source-bound PRIVATE Kennedy review PDF.

All images in the test are original synthetic pixels. Nothing is georeferenced,
licensed real aerial imagery, approved for customers, or published.
"""
import base64
import json
import unittest
from urllib.error import HTTPError
from urllib.request import Request,urlopen

from test_shell import KennedyHomeTest
from test_sheet_compiler import synthetic_fixture


class PrivateReviewHTTPTest(KennedyHomeTest):
    def api(self,method,path,body=None):
        content=json.dumps(body).encode() if body is not None else None
        req=Request(f"http://127.0.0.1:{self.port}{path}",data=content,method=method,
                    headers={"Content-Type":"application/json"} if content else {})
        try:
            with urlopen(req,timeout=10) as res:
                return res.status,res.read(),dict(res.headers)
        except HTTPError as exc:
            return exc.code,exc.read(),dict(exc.headers)

    def create_site(self,label):
        status,data,_=self.api("POST","/api/sites",{"name":label,"address":"100 Fictional Way"})
        self.assertEqual(status,201,data)
        return json.loads(data)["id"]

    def create_study(self,site_id):
        model=synthetic_fixture()[0]["model"]
        model={**model,"site_id":site_id}
        code,data,_=self.api("POST",f"/api/kss/sites/{site_id}/studies",model)
        self.assertEqual(code,201,data)
        return json.loads(data)

    def create_sources(self,site_id):
        _,site,sm,context,cm,_=synthetic_fixture()
        results=[]
        for role,image,manifest in (("site",site,sm),("context",context,cm)):
            manifest={**manifest,"site_id":site_id}
            data={"role":role,"manifest":manifest,
                  "png_base64":base64.b64encode(image).decode("ascii")}
            code,raw,_=self.api("POST",f"/api/kss/sites/{site_id}/aerial-sources",data)
            self.assertEqual(code,201,raw)
            results.append(json.loads(raw))
        return results

    def test_two_sheet_real_http_from_stored_source_bytes(self):
        sid=self.create_site("Kennedy Review Synthetic Site")
        study=self.create_study(sid)
        site,context=self.create_sources(sid)
        path=f"/api/kss/sites/{sid}/studies/{study['id']}/private-review"
        body={"site_source_id":site["source_id"],
              "context_source_id":context["source_id"]}
        code,pdf,headers=self.api("POST",path,body)
        self.assertEqual(code,200,pdf[:140])
        self.assertEqual(headers["Content-Type"],"application/pdf")
        self.assertIn("attachment",headers["Content-Disposition"])
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        self.assertIn(b"/Count 2",pdf)
        self.assertEqual(pdf.count(b"/Subtype /Image"),2)
        self.assertIn(b"PRIVATE SOURCE REVIEW",pdf)
        self.assertIn(b"PRIVATE OPERATOR REVIEW ONLY",pdf)
        self.assertIn(b"NOT FOR EXTERNAL DELIVERY",pdf)
        self.assertIn(b"NO SURVEY, ADA, ZONING OR CODE QA",pdf)
        self.assertIn(study["model_sha256"][:32].encode(),pdf)
        for rec in (site,context):
            self.assertIn(rec["image_sha256"][:32].encode(),pdf)
            self.assertIn(rec["source_id"].encode(),pdf)
        self.assertNotIn(b"public_access_authorized\": true",pdf)
        self.assertEqual(pdf,self.api("POST",path,body)[1])

    def test_cross_site_swapped_roles_and_unsafe_urls_rejected(self):
        a=self.create_site("Review site A")
        b=self.create_site("Review site B")
        study=self.create_study(a)
        source,context=self.create_sources(a)
        other_source,_=self.create_sources(b)
        path=f"/api/kss/sites/{a}/studies/{study['id']}/private-review"
        valid={"site_source_id":source["source_id"],
               "context_source_id":context["source_id"]}
        for altered in (
            {"site_source_id":other_source["source_id"],
             "context_source_id":context["source_id"]},
            {"site_source_id":context["source_id"],
             "context_source_id":source["source_id"]},
            {"site_source_id":source["source_id"],
             "context_source_id":source["source_id"]},
            {"site_source_id":"../../..",
             "context_source_id":context["source_id"]},
        ):
            code,data,_=self.api("POST",path,altered)
            self.assertIn(code,(404,422),data)
            self.assertNotIn(b"%PDF",data)
        # It must not be exposed on the separate public marketing home:
        # the public static Caddy allowlist remains separately gated by CI.
        code,data,_=self.api("GET",path)
        self.assertNotEqual(code,200)
        code,data,_=self.api("POST",
            f"/api/kss/sites/{b}/studies/{study['id']}/private-review",valid)
        self.assertEqual(code,404,data)


if __name__=="__main__":
    unittest.main()
