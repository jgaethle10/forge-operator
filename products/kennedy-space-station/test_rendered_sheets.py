"""Offline pixel-region test for KSS two-sheet render quality."""
import tempfile
from pathlib import Path
import unittest

import verify_rendered_sheets as qa


class PagePixelQATest(unittest.TestCase):
    def make(self, region="#f8f9fd"):
        w,h=qa.EXPECTED
        color=bytes.fromhex(region.lstrip("#"))
        return bytearray(color*(w*h))

    @staticmethod
    def set_pixel(pix,x,y,color):
        w,_=qa.EXPECTED
        start=(y*w+x)*3
        pix[start:start+3]=bytes.fromhex(color.lstrip("#"))

    def test_blank_pages_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            w,h=qa.EXPECTED
            path=Path(tmp)/"qa-1.ppm"
            path.write_bytes(f"P6\n{w} {h}\n255\n".encode()+bytes(self.make()))
            with self.assertRaisesRegex(qa.RenderQAError,"header_missing"):
                qa.inspect_page(path,"S-0")

    def test_short_and_corrupt_ppm_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"qa-1.ppm"
            path.write_bytes(b"P6\n2592 1728\n255\n" + b"no")
            with self.assertRaisesRegex(qa.RenderQAError,"pixel_length_mismatch"):
                qa.ppm_pixels(path)

    def test_color_sample_check_is_strict(self):
        with tempfile.TemporaryDirectory() as tmp:
            w,h=qa.EXPECTED
            pixels=self.make()
            self.set_pixel(pixels,25,95,"#12213b")
            self.set_pixel(pixels,1990,285,"#251c57")
            self.set_pixel(pixels,70,1602,"#f1eaff")
            path=Path(tmp)/"qa-1.ppm"
            path.write_bytes(f"P6\n{w} {h}\n255\n".encode()+pixels)
            with self.assertRaisesRegex(qa.RenderQAError,"underlay_not_visible"):
                qa.inspect_page(path,"S-0")


if __name__=="__main__":
    unittest.main()
