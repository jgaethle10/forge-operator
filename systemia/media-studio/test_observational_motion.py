"""Regression: a static pan is not scene action; moving foreground produces residual motion."""
import unittest
import tempfile
from pathlib import Path
import cv2
import numpy as np
from observational_motion import evaluate

class MotionDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.dir=Path(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()
    def make_clip(self,moving):
        rng=np.random.default_rng(17)
        background=rng.integers(10,220,(360,640,3),dtype=np.uint8)
        background=cv2.GaussianBlur(background,(3,3),0)
        foreground=rng.integers(0,255,(150,220,3),dtype=np.uint8)
        foreground=cv2.GaussianBlur(foreground,(3,3),0)
        out=self.dir/('moving.mp4' if moving else 'static.mp4')
        writer=cv2.VideoWriter(str(out),cv2.VideoWriter_fourcc(*'mp4v'),24,(640,360))
        self.assertTrue(writer.isOpened())
        for i in range(72):
            frame=background.copy()
            x=240+int(i*.6) if moving else 240
            y=100+int(i*.16) if moving else 100
            frame[y:y+150,x:x+220]=foreground
            writer.write(frame)
        writer.release()
        return out
    def manifest(self):
        return {'schema':'evercraft.fallen.observational-motion-input.v1','shots':[{'id':'scene','startSec':0,'durationSec':2.8,'requiresIndependentMotion':True}]}
    def test_static_card_cannot_masquerade_as_action(self):
        r=evaluate(self.make_clip(False),self.manifest())
        self.assertEqual(r['status'],'rejected')
        self.assertEqual(r['failures'],['independent_motion_not_observed:scene'])
    def test_moving_foreground_has_independent_motion(self):
        r=evaluate(self.make_clip(True),self.manifest())
        self.assertEqual(r['status'],'diagnostic_accepted',r['shots'])
        self.assertTrue(r['shots'][0]['independentMotionObserved'])
    def test_no_release_or_authenticity_grant(self):
        r=evaluate(self.make_clip(True),self.manifest())
        self.assertFalse(r['boundaries']['publicationAuthorityGranted'])
        self.assertTrue(r['boundaries']['sourceAuthenticityNotProven'])
        self.assertTrue(r['boundaries']['storyQualityNotVerified'])
if __name__=='__main__':
    unittest.main()
