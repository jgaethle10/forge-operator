"""Source-bound synthetic S-0/A-0 PDF fixture and regression tests."""
import hashlib
import json
import struct
import unittest
import zlib

import raster_registration as reg
import sheet_compiler as comp
import spatial


def synthetic_map_png(width=256, height=256, context=False, filter_type=0):
    """Fully original pixel-art geography, intentionally NOT a real aerial."""
    def chunk(tag, data):
        body=tag+data
        return struct.pack(">I",len(data))+body+struct.pack(">I",zlib.crc32(body)&0xffffffff)
    rgb_rows=[]
    for y in range(height):
        row=bytearray()
        for x in range(width):
            # Fictional terrain + paving with deterministic small texture.
            noise=(x*13+y*17+(x*y)%29)%13
            color=(139+noise,184+noise//2,145+noise//3)
            if context:
                if abs(x-(width*.44))<12 or abs(y-(height*.54))<15:
                    color=(159+noise//3,165+noise//3,175+noise//4)
                if 110<x<180 and 100<y<170:
                    color=(196,205,217)
                if (x//28+y//24)%5==0:
                    color=(112,151,116)
            else:
                if 25<y<53 or 190<y<220 or 180<x<213:
                    color=(169,173,183)
                if 53<x<96 and 71<y<127:
                    color=(184,192,211)
                if 106<x<154 and 83<y<155:
                    color=(217,219,226)
                if 118<x<155 and 132<y<155:
                    color=(163,143,224)
            row.extend(color)
        rgb_rows.append(bytes(row))
    raw=bytearray()
    prev=bytes(width*3)
    for row in rgb_rows:
        filt=filter_type
        output=bytearray()
        for j,value in enumerate(row):
            left=row[j-3] if j>=3 else 0
            above=prev[j]
            ul=prev[j-3] if j>=3 else 0
            if filt==0:predictor=0
            elif filt==1:predictor=left
            elif filt==2:predictor=above
            elif filt==3:predictor=(left+above)//2
            else:
                p=left+above-ul
                da,db,dc=abs(p-left),abs(p-above),abs(p-ul)
                predictor=left if da<=db and da<=dc else above if db<=dc else ul
            output.append((value-predictor)&255)
        raw.extend(bytes((filt,))+output)
        prev=row
    header=struct.pack(">IIBBBBB",width,height,8,2,0,0,0)
    return reg.PNG_SIGNATURE+chunk(b"IHDR",header)+chunk(b"IDAT",zlib.compress(bytes(raw),6))+chunk(b"IEND",b"")


def synthetic_fixture():
    site_id="KSS-OWNED-SYNTHETIC-001"
    model=spatial.validate({
        "schema":spatial.SCHEMA,"units":"meters","measurement_basis":"assumed",
        "title":"Synthetic solar and EV charging concept","source_note":"Entirely simulated source pixel geography",
        "source_report_id":"",
        "parcel":{"width":80,"depth":65},
        "objects":[
            {"id":"warehouse","kind":"building","label":"Workshop","x":8,"z":7,"width":26,"depth":19},
            {"id":"bay1","kind":"charging_bay","label":"EV-01","x":43,"z":25,"width":7,"depth":5},
            {"id":"bay2","kind":"charging_bay","label":"EV-02","x":51,"z":25,"width":7,"depth":5},
            {"id":"switchgear","kind":"equipment_pad","label":"Electrical concept","x":62,"z":40,"width":9,"depth":6},
            {"id":"lane","kind":"pavement","label":"Circulation concept","x":3,"z":45,"width":71,"depth":8},
        ]
    },site_id)
    study={"revision":3,"model":model,"model_sha256":spatial.digest(model)}
    site=synthetic_map_png(256,256,False)
    context=synthetic_map_png(384,320,True)
    def metadata(img,w,h,slope,offx,offz,role):
        return {
            "schema":reg.SCHEMA,"site_id":site_id,
            "pixel_width":w,"pixel_height":h,"expected_sha256":hashlib.sha256(img).hexdigest(),
            "rights_state":"owned","license_ref":"evercraft-synthetic-fixture-only",
            "source_ref":"synthetic:kennedy:"+role,"evidence_state":"synthetic",
            "max_rmse_m":0.01,
            "control_points":[
                {"pixel_x":x,"pixel_y":y,
                 "local_x_m":slope*x+offx,"local_z_m":slope*y+offz}
                for x,y in ((0,0),(w-1,0),(0,h-1),(w-1,h-1),(w//2,h//2))
            ]
        }
    return (study,site,metadata(site,256,256,.5,-18,-18,"site"),
            context,metadata(context,384,320,1,-145,-125,"context"),
            "100 Fictional Way, Imaginary City, Example State")


class TwoSheetTests(unittest.TestCase):
    def setUp(self):
        self.args=synthetic_fixture()

    def compile(self,*args):
        return comp.compile_two_sheet_synthetic(*(args or self.args))

    def test_two_image_sources_two_pages_fingerprints_and_actual_overlays(self):
        result=self.compile()
        study,site,sm,context,cm,_=self.args
        self.assertTrue(result.startswith(b"%PDF-1.4"))
        self.assertIn(b"/Count 2",result)
        self.assertEqual(result.count(b"/Subtype /Image"),2)
        self.assertIn(b"/ImSite Do Q",result)
        self.assertIn(b"/ImContext Do Q",result)
        self.assertIn(b"S-0  |  SYNTHETIC TEST ONLY",result)
        self.assertIn(b"A-0  |  SYNTHETIC TEST ONLY",result)
        for sha in (study["model_sha256"],
                    sm["expected_sha256"], cm["expected_sha256"]):
            # Title block splits 64-character fingerprints into two
            # complete 32-character lines to avoid right-column clipping.
            self.assertIn(sha[:32].encode(), result)
            self.assertIn(sha[32:].encode(), result)
        self.assertIn(b"NO SURVEY, ADA, ZONING OR CODE QA",result)
        self.assertIn(b"NOT FOR EXTERNAL DELIVERY",result)
        self.assertIn(b"Workshop",result)
        self.assertEqual(result,self.compile())
        # Cross-reference points to real PDF objects, not just text faking PDF.
        at=int(result.split(b"startxref\n")[-1].split(b"\n")[0])
        entries=result[at:].split(b"\n")
        self.assertEqual(entries[0],b"xref")
        self.assertEqual(entries[1],b"0 13")
        for i in range(1,13):
            pos=int(entries[i+2].split()[0])
            self.assertTrue(result[pos:].startswith(f"{i} 0 obj\n".encode()))

    def test_pdf_embeds_identical_decoded_png_pixels_not_generated_filler(self):
        import re
        study,site,sm,context,cm,address=self.args
        result=self.compile()
        originals=(comp.decode_rgb_png(site)[2],comp.decode_rgb_png(context)[2])
        for i,expected in zip((7,8),originals):
            block=re.search(rb"\n"+str(i).encode()+rb" 0 obj\n(.*?)\nendobj",result,re.S)
            self.assertIsNotNone(block)
            obj=block.group(1)
            self.assertIn(b"/Subtype /Image",obj)
            stream=obj.split(b"\nstream\n",1)[1].rsplit(b"\nendstream",1)[0]
            self.assertEqual(zlib.decompress(stream),expected)
            self.assertGreater(len(set(expected[::27])),5)

    def test_png_decoder_roundtrip_all_filters(self):
        for filt in range(5):
            png=synthetic_map_png(32,24,False,filter_type=filt)
            w,h,rgb=comp.decode_rgb_png(png)
            self.assertEqual((w,h,len(rgb)),(32,24,32*24*3))
            self.assertEqual(rgb,comp.decode_rgb_png(synthetic_map_png(32,24,False))[2])

    def test_wrong_source_and_forged_digest_rejected(self):
        s,site,sm,context,cm,address=self.args
        wrong={**sm,"expected_sha256":"0"*64}
        with self.assertRaisesRegex(reg.RegistrationError,"sha256_mismatch"):
            self.compile(s,site,wrong,context,cm,address)
        wrong={**cm,"site_id":"OTHER-SITE"}
        with self.assertRaisesRegex(comp.SheetError,"context_site_mismatch"):
            self.compile(s,site,sm,context,wrong,address)
        modified=dict(s)
        modified["model_sha256"]="0"*64
        with self.assertRaisesRegex(comp.SheetError,"saved_model_digest_mismatch"):
            self.compile(modified,site,sm,context,cm,address)

    def test_degenerate_rights_and_identical_images_fail_closed(self):
        s,site,sm,context,cm,address=self.args
        licensed={**sm,"rights_state":"licensed","derivative_use_approved":True}
        with self.assertRaisesRegex(comp.SheetError,"synthetic_only_gate"):
            self.compile(s,site,licensed,context,cm,address)
        unapproved={**cm,"rights_state":"licensed"}
        with self.assertRaisesRegex(reg.RegistrationError,"derivative_use"):
            self.compile(s,site,sm,context,unapproved,address)
        with self.assertRaisesRegex(comp.SheetError,"distinct_image_bytes_required"):
            self.compile(s,site,sm,site,sm,address)
        modified={**sm,"control_points":[
            {"pixel_x":x,"pixel_y":y,
             "local_x_m":0.5*x-18,"local_z_m":0.75*y-18}
            for x,y in ((0,0),(255,0),(0,255),(255,255))
        ]}
        with self.assertRaisesRegex(comp.SheetError,"unequal_pixel_scale"):
            self.compile(s,site,modified,context,cm,address)

    def test_out_of_image_parcel_and_bad_png_fail(self):
        s,site,sm,context,cm,address=self.args
        shifted={**sm,"control_points":[
            {"pixel_x":x,"pixel_y":y,"local_x_m":x*.5-300,"local_z_m":y*.5-300}
            for x,y in ((0,0),(255,0),(0,255),(255,255))
        ]}
        with self.assertRaisesRegex(comp.SheetError,"site_geometry_outside_image"):
            self.compile(s,site,shifted,context,cm,address)
        corrupted=bytearray(site)
        corrupted[51]^=1
        changed={**sm,"expected_sha256":hashlib.sha256(corrupted).hexdigest()}
        with self.assertRaises(comp.SheetError):
            self.compile(s,bytes(corrupted),changed,context,cm,address)

    def test_png_has_two_distinct_color_images(self):
        study,site,sm,context,cm,_=self.args
        w,h,site_raw=comp.decode_rgb_png(site)
        cw,ch,context_raw=comp.decode_rgb_png(context)
        self.assertEqual((w,h),(256,256))
        self.assertEqual((cw,ch),(384,320))
        self.assertGreater(len(set(site_raw[::9])),15)
        self.assertGreater(len(set(context_raw[::9])),15)


if __name__=="__main__":
    unittest.main()
