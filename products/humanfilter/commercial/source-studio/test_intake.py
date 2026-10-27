import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from ingest_live_action import ingest, sha

ROOT=Path(__file__).parent
SAMPLE=ROOT/'demo-only-testsrc.mp4'


def pack(out:Path, *, rights=True, digest=None, bad_extra=None):
    item={'shot_id':'wide','path':'footage/wide.mp4','original_filename':'SYNTHETIC_TEST_ONLY.mp4',
        'size_bytes':SAMPLE.stat().st_size,'sha256':digest if digest is not None else sha(SAMPLE),
        'human_consent':'owner_attested','source_rights':'owner_attested','creative_approval':False}
    manifest={'schema':'evercraft.humanfilter.fallen.live-action-intake.v1','project':'humanfilter-launch-rc3',
        'rights_attested':rights,'consent_attested':True,'publication_authority':False,
        'owner_creative_approved':False,'files':[item]}
    with zipfile.ZipFile(out,mode='w',compression=zipfile.ZIP_STORED) as f:
        f.writestr('intake-manifest.json',json.dumps(manifest))
        f.write(SAMPLE,'footage/wide.mp4')
        if bad_extra: f.writestr(bad_extra,'not a video')

class IntakeTest(unittest.TestCase):
    def test_technical_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            t=Path(tmp);p=t/'testfixture.zip';pack(p)
            receipt=ingest(p,t/'output')
            self.assertEqual(receipt['status'],'TECHNICAL_ACCEPTED_HUMAN_VISUAL_REVIEW_REQUIRED')
            self.assertEqual(receipt['missing_shots'],['hands','reaction','hero'])
            self.assertEqual(receipt['source_count'],1)
            self.assertFalse(receipt['publication_authority'])
            self.assertFalse(receipt['automated_visual_subject_verification'])
            self.assertEqual(len(receipt['sources'][0]['sampled_frames']),3)
            self.assertEqual(sha(t/'output'/'originals'/'wide.mp4'),sha(SAMPLE))
    def test_rejects_no_consent(self):
        with tempfile.TemporaryDirectory() as tmp:
            t=Path(tmp);p=t/'testfixture.zip';pack(p,rights=False)
            with self.assertRaisesRegex(ValueError,'consent_or_rights_unattested'):
                ingest(p,t/'output')
            self.assertFalse((t/'output').exists())
    def test_rejects_forged_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            t=Path(tmp);p=t/'testfixture.zip';pack(p,digest='f'*64)
            with self.assertRaisesRegex(ValueError,'client_hash_mismatch'):
                ingest(p,t/'output')
            self.assertFalse((t/'output').exists())
    def test_rejects_traversal_extra_member(self):
        with tempfile.TemporaryDirectory() as tmp:
            t=Path(tmp);p=t/'testfixture.zip';pack(p,bad_extra='../evil.txt')
            with self.assertRaisesRegex(ValueError,'unapproved_zip_member_or_path'):
                ingest(p,t/'output')
            self.assertFalse((t/'output').exists())

if __name__=='__main__':unittest.main(verbosity=2)