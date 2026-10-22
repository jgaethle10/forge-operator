"""Deterministic offline canary tests. No publishing, credentials or paid providers."""
import hashlib, json, subprocess, tempfile, unittest
from pathlib import Path
import cv2
import render

class TestPhotonForge(unittest.TestCase):
    def test_timestamp_determinism(self):
        a=render.frame_at(3.6)
        b=render.frame_at(3.6)
        self.assertEqual(hashlib.sha256(a.tobytes()).digest(),hashlib.sha256(b.tobytes()).digest())
    def test_changes_across_shots(self):
        a=render.frame_at(1.2).astype('float32')
        b=render.frame_at(6.7).astype('float32')
        self.assertGreater(abs(a-b).mean(),4.0)
    def test_final_brand_reveal(self):
        a=render.frame_at(9.5)
        self.assertGreater(int(a[235:290,220:740].max()),175)
    def test_video_receipt_if_present(self):
        video=Path(__file__).parent/'Evercraft_Photon_Forge_V3_SILENT.mp4'
        if not video.is_file():self.skipTest('MP4 not beside tests')
        report=video.with_suffix('.receipt.json')
        meta=json.loads(report.read_text())
        self.assertEqual(meta['sha256'],hashlib.sha256(video.read_bytes()).hexdigest())
        self.assertFalse(meta['publicationAuthority'])
        self.assertFalse(meta['audio'])
        p=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(video)]))
        self.assertEqual(len(p['streams']),1)
        self.assertEqual(int(p['streams'][0]['nb_read_frames']),300)
        self.assertEqual(p['streams'][0]['codec_name'],'h264')

if __name__=='__main__':unittest.main()
