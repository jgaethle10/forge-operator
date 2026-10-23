import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
import numpy as np
import cv2
import laser_foundry as lf

class LaserFoundryProof(unittest.TestCase):
    def setUp(self):
        self.w=360;self.h=640;self.portrait=True
        self.bg,self.horizon=lf.build_static(self.w,self.h,self.portrait)

    def test_original_stage_deterministic_and_not_empty(self):
        b2,h2=lf.build_static(self.w,self.h,self.portrait)
        self.assertTrue(np.array_equal(self.bg,b2))
        self.assertEqual(self.horizon,h2)
        self.assertGreater(float(self.bg.mean()),3.0)

    def test_five_distinct_directed_laser_cues(self):
        self.assertEqual([lf.rig(t,True) for t in [0.5,2.5,4.9,7.5,10.5]],[0,1,2,3,4])
        marks=[]
        for t in [0.5,2.5,4.9,7.5,10.5]:
            h,c,f=lf.beam_system(t,self.w,self.h,True,self.horizon)
            self.assertGreater(int(c.sum()),2500)
            marks.append(hashlib.sha256(c.tobytes()).hexdigest())
        self.assertEqual(len(set(marks)),5)

    def test_full_frames_genuinely_change_and_have_original_title(self):
        a=lf.frame_at(2.5,self.w,self.h,True,self.bg,self.horizon)
        b=lf.frame_at(7.5,self.w,self.h,True,self.bg,self.horizon)
        c=lf.frame_at(10.7,self.w,self.h,True,self.bg,self.horizon)
        self.assertEqual(a.shape,(self.h,self.w,3))
        self.assertGreater(float(np.mean(cv2.absdiff(a,b))),7)
        self.assertGreater(float(np.mean(cv2.absdiff(b,c))),7)
        # Contrast at 10.7 in the center title area must exceed same area pre-reveal.
        left=int(self.w*.14);right=int(self.w*.86)
        top=int(self.h*.40);bottom=int(self.h*.51)
        self.assertGreater(float(c[top:bottom,left:right].mean()),float(a[top:bottom,left:right].mean())+12)

    def test_rendered_receipt_for_actual_current_exports(self):
        path=Path('/mnt/data/evercraft_laser_foundry/render_receipt.json')
        if not path.exists():self.skipTest('artifact-specific receipt outside packaged CI')
        r=json.loads(path.read_text())
        self.assertFalse(r['publicationAuthority'])
        self.assertFalse(r['original3dGpuEngineUsed'])
        self.assertTrue(r['upscaledOutput'])
        self.assertEqual(len(r['videos']),2)
        self.assertTrue(all(v['frames']==360 for v in r['videos']))

if __name__=='__main__':unittest.main()

