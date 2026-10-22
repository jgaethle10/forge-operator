import hashlib
import json
import unittest
from pathlib import Path
import numpy as np
from finish_native import render_frame, W, H, BEATS, SCHEMA

class EditorialProofTests(unittest.TestCase):
 def setUp(self):
  self.native=np.full((360,640,3),8,dtype=np.uint8)
  self.native[120:220,230:410]=[44,96,173]
 def test_actual_native_frame_remains_background_and_output_has_expected_size(self):
  a=render_frame(self.native,42,96)
  self.assertEqual(a.shape,(H,W,3))
  self.assertNotEqual(tuple(a[360,640]),tuple(a[25,640]))
 def test_three_story_beats_generate_distinct_visible_pixels(self):
  images=[render_frame(self.native, i,96) for i in (12,45,81)]
  hashes=[hashlib.sha256(a.tobytes()).hexdigest() for a in images]
  self.assertEqual(len(set(hashes)),3)
  self.assertEqual(len(BEATS),3)
 def test_source_is_stamped_as_synthetic_not_customer_evidence(self):
  source=Path(__file__).with_name('finish_native.py').read_text()
  self.assertIn('SYNTHETIC DATA',source)
  self.assertIn('NOT CUSTOMER EVIDENCE',source)
  self.assertIn('publicationAuthority',source)
  self.assertEqual(SCHEMA,'evercraft.cinema.native-editorial-finish.v1')

if __name__=='__main__':unittest.main()

