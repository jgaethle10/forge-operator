"""Source-bound Census/USGS preview tests: offline; no provider calls in CI."""
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import aerial_sources
import server

ADDRESS="4600 Silver Hill Rd, Washington, DC 20233"
MATCH={"result":{"addressMatches":[{
    "matchedAddress":"4600 SILVER HILL RD, WASHINGTON, DC, 20233",
    "coordinates":{"x":-76.92748724,"y":38.84601622}
}]}}
JPEG=b"\xff\xd8\xff"+b"\x00"*200+b"\xff\xd9"


class FakeResponse:
    def __init__(self,url,data,mime,actual_url=None,status=200):
        self.url=url
        self.actual_url=actual_url or url
        self.status=status
        self.headers={"Content-Type":mime}
        self.data=data
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def geturl(self):return self.actual_url
    def read(self,count=-1):return self.data[:count]


class FakeOpener:
    def __init__(self,matches=None,img=JPEG,redirect=False,imgmime="image/jpeg"):
        self.calls=[]
        self.matches=matches if matches is not None else MATCH
        self.img=img
        self.redirect=redirect
        self.imgmime=imgmime
    def __call__(self,req,timeout):
        from urllib.parse import urlsplit,parse_qs
        url=req.full_url
        self.calls.append((url,timeout))
        p=urlsplit(url)
        if p.netloc=="geocoding.geo.census.gov":
            self._assert_provider(p,"/geocoder/locations/onelineaddress")
            return FakeResponse(url,json.dumps(self.matches).encode(),"application/json")
        if p.netloc=="basemap.nationalmap.gov":
            self._assert_provider(p,"/arcgis/rest/services/USGSImageryOnly/MapServer/export")
            query=parse_qs(p.query)
            assert query["bboxSR"]==["3857"] and query["imageSR"]==["3857"]
            assert query["format"]==["jpg"] and query["f"]==["image"]
            assert query["size"]==["1024,752"]
            return FakeResponse(url,self.img,self.imgmime,
                                "https://untrusted.example/aerial" if self.redirect else None)
        raise AssertionError("Unexpected upstream domain "+p.netloc)
    @staticmethod
    def _assert_provider(url,path):
        assert url.scheme=="https" and url.path==path


class AerialProviderTests(unittest.TestCase):
    def test_single_us_address_yields_source_backed_two_image_previews(self):
        stub=FakeOpener()
        data=aerial_sources.preview_from_address(ADDRESS,opener=stub)
        self.assertEqual(len(stub.calls),3)
        self.assertEqual(data["schema"],"evercraft.site-planner.usgs-address-aerial.v1")
        self.assertEqual(data["match_class"],"census_address_range_not_parcel")
        self.assertFalse(data["parcel_boundaries_verified"])
        self.assertFalse(data["imagery_date_verified"])
        self.assertEqual(data["approximate_address_coordinate"]["lat"],38.84601622)
        self.assertEqual(data["site"]["sha256"],data["vicinity"]["sha256"])
        self.assertEqual(data["site"]["width_pixels"],1024)
        self.assertEqual(data["site"]["height_pixels"],752)
        self.assertIn("screening",data["use_class"])
        self.assertLess(data["site"]["bbox_3857"][2]-data["site"]["bbox_3857"][0],1000)
        self.assertGreater(data["vicinity"]["bbox_3857"][2]-data["vicinity"]["bbox_3857"][0],4000)

    def test_no_or_multiple_census_matches_refuse_imagery(self):
        for matches in ([],MATCH["result"]["addressMatches"]*2):
            stub=FakeOpener(matches={"result":{"addressMatches":matches}})
            with self.assertRaisesRegex(ValueError,"missing or ambiguous"):
                aerial_sources.preview_from_address(ADDRESS,opener=stub)
            self.assertEqual(len(stub.calls),1)

    def test_rejects_untrusted_provider_redirect_bad_jpeg_and_out_of_bounds(self):
        for opener in (FakeOpener(redirect=True),FakeOpener(img=b"not an image"),
                       FakeOpener(imgmime="text/html"),FakeOpener(img=b"\xff\xd8\xff"+b"a"*(4*1024*1024)+b"\xff\xd9")):
            with self.assertRaises(ValueError):
                aerial_sources.preview_from_address(ADDRESS,opener=opener)
        outside={"result":{"addressMatches":[{"matchedAddress":ADDRESS,
                     "coordinates":{"x":130.0,"y":35.0}}]}}
        with self.assertRaisesRegex(ValueError,"outside supported"):
            aerial_sources.preview_from_address(ADDRESS,opener=FakeOpener(matches=outside))

    def test_rejects_bad_address_without_network(self):
        for addr in ("", "short", "a\nanother street", "x"*201):
            stub=FakeOpener()
            with self.assertRaises(ValueError):aerial_sources.preview_from_address(addr,opener=stub)
            self.assertEqual(stub.calls,[])

    def test_private_http_api_does_not_touch_customer_or_outbox_tables(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(server,"DB",Path(tmp)/"site.sqlite3"),patch.object(server,"TOKEN","test-token"),\
                 patch.object(server,"preview_from_address") as preview:
                preview.return_value=aerial_sources.preview_from_address(ADDRESS,opener=FakeOpener())
                server.init()
                http=ThreadingHTTPServer(("127.0.0.1",0),server.Handler)
                t=threading.Thread(target=http.serve_forever,daemon=True);t.start()
                url=f"http://127.0.0.1:{http.server_port}/api/aerial/preview"
                raw=json.dumps({"address":ADDRESS}).encode()
                try:
                    with self.assertRaises(HTTPError) as denied:
                        urlopen(Request(url,data=raw,method="POST",headers={"Content-Type":"application/json"}),timeout=4)
                    self.assertEqual(denied.exception.code,401)
                    self.assertEqual(preview.call_count,0)
                    req=Request(url,data=raw,method="POST",headers={"Content-Type":"application/json","Authorization":"Bearer test-token"})
                    with urlopen(req,timeout=4) as rsp:
                        self.assertEqual(rsp.status,200)
                        self.assertEqual(json.load(rsp)["match_class"],"census_address_range_not_parcel")
                        self.assertEqual(rsp.headers.get("Cache-Control"),"no-store")
                        self.assertIn("img-src 'self' data: blob:",rsp.headers.get("Content-Security-Policy",""))
                    self.assertEqual(preview.call_count,1)
                    with server.connect() as db:
                        for tab in ("sites","orders","outbox","evidence"):
                            self.assertEqual(db.execute("SELECT count(*) FROM "+tab).fetchone()[0],0)
                finally:
                    http.shutdown();http.server_close();t.join(timeout=5)

if __name__=="__main__":unittest.main()
